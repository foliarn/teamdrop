import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, sql } from 'kysely';
import {
  DataError,
  InvalidInputError,
  InvalidStateError,
  NotFoundError,
  SelfActionError,
} from '../errors';
import { writeAudit } from '../internal/audit';
import { deleteMessageRow } from '../internal/conversations';
import { identityHash } from '../internal/crypto';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { findActiveBan } from '../internal/sanctions';
import type {
  ActiveBan,
  IssueSanctionInput,
  RemoveMessageOutcome,
  Sanction,
} from '../types/moderation.types';

/** Constraints of the sanction tables, mapped to typed errors. */
const SANCTION_CONSTRAINTS: Record<string, () => DataError> = {
  fk_user_sanction_user_id: () => new NotFoundError('User not found'),
  fk_user_sanction_report_id: () => new NotFoundError('Report not found'),
  fk_user_sanction_issued_by_id: () => new NotFoundError('Moderator not found'),
  fk_audit_log_actor_id: () => new NotFoundError('Moderator not found'),
  fk_audit_log_report_id: () => new NotFoundError('Report not found'),
  ck_user_sanction_ends_at: () =>
    new InvalidInputError('Only a temporary ban has an end, in the future'),
  ck_user_sanction_reason_not_blank: () =>
    new InvalidInputError('reason is required'),
};

function toSanction(row: Selectable<DB['user_sanction']>): Sanction {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    reason: row.reason,
    reportId: row.report_id,
    issuedById: row.issued_by_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

function assertReason(reason: unknown): void {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new InvalidInputError('reason is required');
  }
}

/**
 * Sanctions (BR-MOD-03, BR-MOD-04): warnings, temporary bans (end chosen by the moderator), permanent bans and content
 * removals. A permanent ban also stores the hashes of the user's email and Google subjects, so that the person cannot
 * sign up again, even after erasure (BR-MOD-04). Every method writes its audit entry in the same transaction (BR-MOD-05).
 * The developers check the moderator role, and refuse the login of a banned user (see `AuthRepository.findLoginByEmail`).
 */
@Injectable()
export class SanctionRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Issues a warning, a temporary ban or a permanent ban (BR-MOD-03). A temporary ban needs `endsAt` in the future; the
   * other kinds refuse it. A permanent ban stores the banned identities (BR-MOD-04). Writes `sanction.issued`.
   * Content removal is `removeMessage`.
   * Errors: `SelfActionError`, `InvalidInputError` (blank reason, bad `endsAt`), `NotFoundError` (user, report).
   * Outcome: the sanction id. Notify the user and revoke their refresh tokens for a ban (developers).
   */
  async issueSanction(
    moderatorId: string,
    input: IssueSanctionInput,
  ): Promise<{ sanctionId: string }> {
    if (moderatorId === input.userId) {
      throw new SelfActionError();
    }
    assertReason(input.reason);
    if (input.kind === 'temporary_ban') {
      if (!(input.endsAt instanceof Date) || input.endsAt <= new Date()) {
        throw new InvalidInputError(
          'A temporary ban needs an end in the future',
        );
      }
    } else if (input.endsAt !== undefined) {
      throw new InvalidInputError('Only a temporary ban has an end');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const user = await trx
          .selectFrom('user_account')
          .select(['id', 'email_hash'])
          .where('id', '=', input.userId)
          .forUpdate()
          .executeTakeFirst();
        if (user === undefined) {
          throw new NotFoundError('User not found');
        }
        const row = await trx
          .insertInto('user_sanction')
          .values({
            user_id: input.userId,
            kind: input.kind,
            reason: input.reason,
            report_id: input.reportId ?? null,
            issued_by_id: moderatorId,
            ends_at: input.endsAt ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (input.kind === 'permanent_ban') {
          await this.banIdentities(trx, input.userId);
        }
        // BR-MOD-05: every moderator action is audited.
        await writeAudit(trx, moderatorId, {
          action: 'sanction.issued',
          targetTable: 'user_account',
          targetId: input.userId,
          reportId: input.reportId,
          details: { sanctionId: row.id, kind: input.kind },
        });
        return { sanctionId: row.id };
      });
    } catch (err) {
      throw mapDbError(err, SANCTION_CONSTRAINTS);
    }
  }

  /**
   * Lifts a sanction early (sets `revoked_at`). Revoking a permanent ban deletes the user's banned identities, so the
   * person can sign up again, unless another permanent ban of the user is still in force (BR-MOD-04).
   * Writes `sanction.revoked`.
   * Errors: `NotFoundError`, `InvalidStateError` (already revoked).
   */
  async revokeSanction(sanctionId: string, moderatorId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const sanction = await trx
          .selectFrom('user_sanction')
          .select(['id', 'user_id', 'kind', 'revoked_at', 'report_id'])
          .where('id', '=', sanctionId)
          .forUpdate()
          .executeTakeFirst();
        if (sanction === undefined) {
          throw new NotFoundError('Sanction not found');
        }
        if (sanction.revoked_at !== null) {
          throw new InvalidStateError('The sanction is already revoked');
        }
        await trx
          .updateTable('user_sanction')
          .set({ revoked_at: sql<Date>`now()` })
          .where('id', '=', sanctionId)
          .execute();
        if (sanction.kind === 'permanent_ban') {
          const other = await trx
            .selectFrom('user_sanction')
            .select('id')
            .where('user_id', '=', sanction.user_id)
            .where('kind', '=', 'permanent_ban')
            .where('revoked_at', 'is', null)
            .executeTakeFirst();
          if (other === undefined) {
            await this.unbanIdentities(trx, sanction.user_id);
          }
        }
        // BR-MOD-05: every moderator action is audited.
        await writeAudit(trx, moderatorId, {
          action: 'sanction.revoked',
          targetTable: 'user_account',
          targetId: sanction.user_id,
          reportId: sanction.report_id ?? undefined,
          details: { sanctionId, kind: sanction.kind },
        });
      });
    } catch (err) {
      throw mapDbError(err, SANCTION_CONSTRAINTS);
    }
  }

  /**
   * Removes a message as a moderator (BR-MOD-03 content removal): records a `content_removal` sanction on its author
   * (none when the author was erased), hard-deletes the message (BR-MSG-03) and writes `message.removed`, in one
   * transaction. A report on the message keeps its decision in `resolution_note`; its target becomes `removed`.
   * Errors: `NotFoundError` (message, report), `InvalidInputError` (blank reason).
   * Outcome: the conversation id (for the real-time update) and the sanction id.
   */
  async removeMessage(
    moderatorId: string,
    messageId: string,
    input: { reason: string; reportId?: string },
  ): Promise<RemoveMessageOutcome> {
    assertReason(input.reason);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const message = await trx
          .selectFrom('message')
          .select(['id', 'sender_id', 'conversation_id'])
          .where('id', '=', messageId)
          .forUpdate()
          .executeTakeFirst();
        if (message === undefined) {
          throw new NotFoundError('Message not found');
        }
        let sanctionId: string | null = null;
        if (message.sender_id !== null) {
          const row = await trx
            .insertInto('user_sanction')
            .values({
              user_id: message.sender_id,
              kind: 'content_removal',
              reason: input.reason,
              report_id: input.reportId ?? null,
              issued_by_id: moderatorId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          sanctionId = row.id;
        }
        await deleteMessageRow(trx, messageId);
        // BR-MOD-05: every moderator action is audited. No message body in the log.
        await writeAudit(trx, moderatorId, {
          action: 'message.removed',
          targetTable: 'message',
          targetId: messageId,
          reportId: input.reportId,
          details: {
            conversationId: message.conversation_id,
            authorId: message.sender_id,
            sanctionId,
          },
        });
        return { conversationId: message.conversation_id, sanctionId };
      });
    } catch (err) {
      throw mapDbError(err, SANCTION_CONSTRAINTS);
    }
  }

  /** Lists the sanctions of a user, newest first (moderators). */
  async listSanctions(userId: string): Promise<Sanction[]> {
    try {
      const rows = await this.db
        .selectFrom('user_sanction')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('id', 'desc')
        .execute();
      return rows.map(toSanction);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** The ban in force on the user, or `null` (BR-MOD-03). A permanent ban outranks a temporary one. */
  async getActiveBan(userId: string): Promise<ActiveBan | null> {
    try {
      return await findActiveBan(this.db, userId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Stores the hashes of the user's email and Google subjects as banned identities (BR-MOD-04). */
  private async banIdentities(trx: Kysely<DB>, userId: string): Promise<void> {
    await sql`
      INSERT INTO banned_identity (identity_kind, identity_hash)
      SELECT 'email', u.email_hash FROM user_account u WHERE u.id = ${userId}::uuid
      ON CONFLICT (identity_kind, identity_hash) DO NOTHING
    `.execute(trx);
    const subjects = await trx
      .selectFrom('auth_identity')
      .select('provider_subject')
      .where('user_id', '=', userId)
      .where('provider', '=', 'google')
      .execute();
    for (const { provider_subject: subject } of subjects) {
      if (subject === null) continue;
      await sql`
        INSERT INTO banned_identity (identity_kind, identity_hash)
        VALUES ('google_subject', ${identityHash(subject)})
        ON CONFLICT (identity_kind, identity_hash) DO NOTHING
      `.execute(trx);
    }
  }

  /** Deletes the banned identities of the user's current email and Google subjects (BR-MOD-04). */
  private async unbanIdentities(
    trx: Kysely<DB>,
    userId: string,
  ): Promise<void> {
    await sql`
      DELETE FROM banned_identity b
      USING user_account u
      WHERE u.id = ${userId}::uuid AND b.identity_kind = 'email' AND b.identity_hash = u.email_hash
    `.execute(trx);
    const subjects = await trx
      .selectFrom('auth_identity')
      .select('provider_subject')
      .where('user_id', '=', userId)
      .where('provider', '=', 'google')
      .execute();
    for (const { provider_subject: subject } of subjects) {
      if (subject === null) continue;
      await sql`
        DELETE FROM banned_identity
        WHERE identity_kind = 'google_subject' AND identity_hash = ${identityHash(subject)}
      `.execute(trx);
    }
  }
}
