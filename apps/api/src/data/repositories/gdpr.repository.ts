import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  DataError,
  InvalidInputError,
  InvalidReferenceError,
  InvalidStateError,
  NotFoundError,
} from '../errors';
import { decryptText, exportUserDataSql } from '../internal/crypto';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import {
  activeRegistrantIds,
  lockOccurrence,
  promoteFromWaitlist,
  upcomingScheduledOccurrences,
} from '../internal/occurrences';
import type {
  ClaimedExport,
  ConsentPurpose,
  ConsentRecord,
  ConsentState,
  DataExportRequest,
  ErasureOutcome,
  InactiveAccount,
  PolicyDocument,
  PolicyVersion,
} from '../types/gdpr.types';

const GDPR_CONSTRAINTS: Record<string, () => DataError> = {
  uq_policy_version_document_version: () =>
    new InvalidInputError('This version is already published'),
  uq_data_export_request_active: () =>
    new InvalidStateError('An export is already in progress'),
  fk_user_consent_user_id: () => new NotFoundError('User not found'),
  fk_data_export_request_user_id: () => new NotFoundError('User not found'),
};

/** Grace period between the deletion request and the erasure (BR-GDP-03). */
const GRACE_DAYS = 30;
/** Inactivity before the warning email (BR-GDP-08). */
const WARNING_MONTHS = 12;
/** Life of a download link (BR-GDP-07). */
const EXPORT_DAYS = 7;
/** Documents whose current version a required purpose must accept. */
const PURPOSE_DOCUMENT: Record<string, PolicyDocument> = {
  terms_of_service: 'terms_of_service',
  privacy_policy: 'privacy_policy',
};

/**
 * GDPR (BR-GDP-01 to BR-GDP-10): policies and consents, data export, account erasure and inactivity.
 * - Consents are append-only: every grant or withdrawal is a new row.
 * - Export: the user requests it; the developers' worker claims a request, builds the JSON with `buildExportData`, writes
 *   the file, and completes it. Links last 7 days; the database marks them expired and the developers delete the files
 *   listed by `listExpiredExportFiles`.
 * - Erasure: 30 days after the deletion request, the developers' nightly job calls `eraseDueAccounts` and notifies the
 *   users in the outcomes. Retention purges run in the database (pg_cron, `run_gdpr_jobs`).
 * - Inactivity: warn by email with `listInactiveAccountsToWarn` / `markInactivityWarned`; the database schedules the
 *   deletion of warned accounts at 24 months.
 */
@Injectable()
export class GdprRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** Lists the consent purposes (BR-GDP-01), required ones first. */
  async listConsentPurposes(): Promise<ConsentPurpose[]> {
    try {
      const rows = await this.db
        .selectFrom('consent_purpose')
        .selectAll()
        .orderBy('is_required', 'desc')
        .orderBy('code')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isRequired: row.is_required,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Publishes a new version of a policy (back office; the caller checks the admin role and writes the audit entry). The
   * latest published version is the current one: users must accept it again (BR-GDP-01).
   * Errors: `InvalidInputError` (version already published, blank version or url).
   */
  async publishPolicyVersion(
    document: PolicyDocument,
    version: string,
    url: string,
  ): Promise<PolicyVersion> {
    if (version.trim() === '' || url.trim() === '') {
      throw new InvalidInputError('version and url are required');
    }
    try {
      const row = await this.db
        .insertInto('policy_version')
        .values({ document, version, url })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        id: row.id,
        document: row.document,
        version: row.version,
        url: row.url,
        publishedAt: row.published_at,
      };
    } catch (err) {
      throw mapDbError(err, GDPR_CONSTRAINTS);
    }
  }

  /** The current version of each policy document, or `null` when none is published. */
  async getCurrentPolicies(): Promise<
    Record<PolicyDocument, PolicyVersion | null>
  > {
    try {
      const rows = await sql<{
        id: string;
        document: PolicyDocument;
        version: string;
        url: string;
        published_at: Date;
      }>`
        SELECT DISTINCT ON (document) id, document, version, url, published_at
        FROM policy_version
        WHERE published_at <= now()
        ORDER BY document, published_at DESC, id DESC
      `.execute(this.db);
      const result: Record<PolicyDocument, PolicyVersion | null> = {
        terms_of_service: null,
        privacy_policy: null,
      };
      for (const row of rows.rows) {
        result[row.document] = {
          id: row.id,
          document: row.document,
          version: row.version,
          url: row.url,
          publishedAt: row.published_at,
        };
      }
      return result;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Records a grant or a withdrawal (BR-GDP-01, append-only). For the terms of service and the privacy policy, a grant
   * accepts the current version of the document.
   * Errors: `InvalidReferenceError` (unknown purpose), `InvalidStateError` (granting a policy with no published version),
   * `NotFoundError` (user).
   */
  async recordConsent(
    userId: string,
    purposeCode: string,
    granted: boolean,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const purpose = await trx
          .selectFrom('consent_purpose')
          .select('id')
          .where('code', '=', purposeCode)
          .executeTakeFirst();
        if (purpose === undefined) {
          throw new InvalidReferenceError('Unknown consent purpose');
        }
        let policyVersionId: string | null = null;
        const document = PURPOSE_DOCUMENT[purposeCode];
        if (granted && document !== undefined) {
          const current = await trx
            .selectFrom('policy_version')
            .select('id')
            .where('document', '=', document)
            .where('published_at', '<=', sql<Date>`now()`)
            .orderBy('published_at', 'desc')
            .orderBy('id', 'desc')
            .executeTakeFirst();
          if (current === undefined) {
            throw new InvalidStateError('No published version of this policy');
          }
          policyVersionId = current.id;
        }
        await trx
          .insertInto('user_consent')
          .values({
            user_id: userId,
            consent_purpose_id: purpose.id,
            policy_version_id: policyVersionId,
            granted,
          })
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, GDPR_CONSTRAINTS);
    }
  }

  /**
   * The current state of every purpose for the user (latest row of the history), and whether a required purpose covers
   * the current version of its document (BR-GDP-01). Ask the user again for every required purpose not `upToDate`.
   */
  async getMyConsents(userId: string): Promise<ConsentState[]> {
    try {
      const result = await sql<{
        code: string;
        is_required: boolean;
        granted: boolean | null;
        created_at: Date | null;
        version: string | null;
        up_to_date: boolean;
      }>`
        SELECT cp.code, cp.is_required, last.granted, last.created_at, pv.version,
          (NOT cp.is_required OR (
            last.granted IS TRUE AND (
              cp.code NOT IN ('terms_of_service', 'privacy_policy')
              OR last.policy_version_id = (
                SELECT cur.id FROM policy_version cur
                WHERE cur.document::text = cp.code AND cur.published_at <= now()
                ORDER BY cur.published_at DESC, cur.id DESC LIMIT 1
              )
            )
          )) AS up_to_date
        FROM consent_purpose cp
        LEFT JOIN LATERAL (
          SELECT uc.granted, uc.created_at, uc.policy_version_id FROM user_consent uc
          WHERE uc.user_id = ${userId}::uuid AND uc.consent_purpose_id = cp.id
          ORDER BY uc.id DESC LIMIT 1
        ) last ON true
        LEFT JOIN policy_version pv ON pv.id = last.policy_version_id
        ORDER BY cp.is_required DESC, cp.code
      `.execute(this.db);
      return result.rows.map((row) => ({
        purposeCode: row.code,
        isRequired: row.is_required,
        granted: row.granted,
        answeredAt: row.created_at,
        policyVersion: row.version,
        upToDate: row.up_to_date,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** The user's full consent history, oldest first (BR-GDP-01). */
  async listConsentHistory(userId: string): Promise<ConsentRecord[]> {
    try {
      const rows = await this.db
        .selectFrom('user_consent as uc')
        .innerJoin('consent_purpose as cp', 'cp.id', 'uc.consent_purpose_id')
        .leftJoin('policy_version as pv', 'pv.id', 'uc.policy_version_id')
        .select(['cp.code', 'uc.granted', 'pv.version', 'uc.created_at'])
        .where('uc.user_id', '=', userId)
        .orderBy('uc.id')
        .execute();
      return rows.map((row) => ({
        purposeCode: row.code,
        granted: row.granted,
        policyVersion: row.version,
        createdAt: row.created_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Requests a data export (BR-GDP-07). One request at a time: while one is pending or processing, it is returned
   * instead of creating another.
   * Errors: `NotFoundError` (user).
   */
  async requestExport(userId: string): Promise<DataExportRequest> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('data_export_request')
          .values({ user_id: userId })
          .onConflict((oc) =>
            oc
              .columns(['user_id'])
              .where('status', 'in', ['pending', 'processing'])
              .doNothing(),
          )
          .execute();
        const row = await trx
          .selectFrom('data_export_request')
          .selectAll()
          .where('user_id', '=', userId)
          .where('status', 'in', ['pending', 'processing'])
          .executeTakeFirstOrThrow();
        return toExport(row);
      });
    } catch (err) {
      throw mapDbError(err, GDPR_CONSTRAINTS);
    }
  }

  /** The user's export requests, newest first (BR-GDP-07). */
  async listMyExports(userId: string): Promise<DataExportRequest[]> {
    try {
      const rows = await this.db
        .selectFrom('data_export_request')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('id', 'desc')
        .execute();
      return rows.map(toExport);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Claims the oldest pending export for the developers' worker: it becomes `processing`. Safe with several workers
   * (`FOR UPDATE SKIP LOCKED`).
   * Outcome: the request to build, or `null` when the queue is empty.
   */
  async claimNextExport(): Promise<ClaimedExport | null> {
    try {
      const result = await sql<{ id: string; user_id: string }>`
        WITH next AS (
          SELECT id FROM data_export_request
          WHERE status = 'pending'
          ORDER BY requested_at, id
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE data_export_request x SET status = 'processing'
        FROM next WHERE x.id = next.id
        RETURNING x.id, x.user_id
      `.execute(this.db);
      const row = result.rows[0];
      return row === undefined
        ? null
        : { requestId: row.id, userId: row.user_id };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Every piece of data of the user as one JSON object, built by the database (BR-GDP-07): account (email and birth date
   * decrypted), settings, sports, social graph, events, registrations, messages, notifications, cheers, reports filed,
   * sanctions, badges, consents. Write it to the export file; never log it.
   * Errors: `NotFoundError` (user).
   */
  async buildExportData(userId: string): Promise<Record<string, unknown>> {
    try {
      const result = await sql<{ data: Record<string, unknown> }>`
        SELECT ${exportUserDataSql(userId)} AS data
      `.execute(this.db);
      const data = result.rows[0]?.data;
      if (data === undefined || data.account === null) {
        throw new NotFoundError('User not found');
      }
      return data;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Marks a claimed export as ready with its file; the download link lasts 7 days (BR-GDP-07).
   * Errors: `NotFoundError`, `InvalidStateError` (not processing), `InvalidInputError` (blank path).
   */
  async completeExport(requestId: string, filePath: string): Promise<void> {
    if (filePath.trim() === '') {
      throw new InvalidInputError('filePath is required');
    }
    await this.finishExport(requestId, {
      status: 'ready',
      file_path: filePath,
      completed_at: sql<Date>`now()`,
      expires_at: sql<Date>`now() + make_interval(days => ${EXPORT_DAYS})`,
    });
  }

  /**
   * Marks a claimed export as failed; the user may request a new one.
   * Errors: `NotFoundError`, `InvalidStateError` (not processing).
   */
  async failExport(requestId: string): Promise<void> {
    await this.finishExport(requestId, { status: 'failed' });
  }

  /** Expired exports whose file is still on the disk: delete each file, then call `markExportFileDeleted` (BR-GDP-09). */
  async listExpiredExportFiles(): Promise<
    { requestId: string; filePath: string }[]
  > {
    try {
      const rows = await this.db
        .selectFrom('data_export_request')
        .select(['id', 'file_path'])
        .where('status', '=', 'expired')
        .where('file_path', 'is not', null)
        .orderBy('id')
        .execute();
      return rows.map((row) => ({
        requestId: row.id,
        filePath: row.file_path ?? '',
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Records that the file of an export was deleted from the disk. */
  async markExportFileDeleted(requestId: string): Promise<void> {
    try {
      await this.db
        .updateTable('data_export_request')
        .set({ file_path: null })
        .where('id', '=', requestId)
        .where('status', 'in', ['expired', 'failed'])
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Ids of the accounts whose deletion request is older than the 30-day grace period (BR-GDP-03), oldest first. */
  async listDueErasures(limit = 100): Promise<string[]> {
    try {
      const rows = await this.db
        .selectFrom('user_account')
        .select('id')
        .where(
          'deletion_requested_at',
          '<=',
          sql<Date>`now() - make_interval(days => ${GRACE_DAYS})`,
        )
        .orderBy('deletion_requested_at')
        .orderBy('id')
        .limit(limit)
        .execute();
      return rows.map((row) => row.id);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Erases every due account (BR-GDP-03), one transaction per account, and returns who to notify. Call it nightly.
   * Outcome: one erasure outcome per erased account.
   */
  async eraseDueAccounts(limit = 100): Promise<ErasureOutcome[]> {
    const outcomes: ErasureOutcome[] = [];
    for (const userId of await this.listDueErasures(limit)) {
      outcomes.push(await this.eraseAccount(userId));
    }
    return outcomes;
  }

  /**
   * Erases one account whose 30-day grace period is over (BR-GDP-03, BR-GDP-04, BR-GDP-05), in one transaction:
   * 1. its upcoming active registrations are cancelled (not late), and the waitlists promoted (BR-REG-04);
   * 2. owned events go to the oldest co-organizer; without one, their upcoming sessions are cancelled and the event
   *    keeps no owner;
   * 3. every consent is withdrawn, then the account is deleted: personal data goes, messages, cheers given, past
   *    registrations, reports and audit entries stay without the identity; banned identities and anonymous aggregates stay.
   * Errors: `NotFoundError`, `InvalidStateError` (no deletion request, or still in the grace period).
   * Outcome: the promoted users, the cancelled sessions with their participants, and the transferred events, to notify.
   */
  async eraseAccount(userId: string): Promise<ErasureOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const user = await trx
          .selectFrom('user_account')
          .select([
            'id',
            sql<boolean>`deletion_requested_at <= now() - make_interval(days => ${GRACE_DAYS})`.as(
              'due',
            ),
          ])
          .where('id', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (user === undefined) {
          throw new NotFoundError('User not found');
        }
        if (user.due !== true) {
          throw new InvalidStateError('The account is not due for erasure');
        }

        const promoted = new Set<string>();
        // 1. Upcoming active registrations: the places are freed (BR-REG-04).
        const registrations = await trx
          .selectFrom('registration as r')
          .innerJoin('event_occurrence as o', 'o.id', 'r.occurrence_id')
          .select(['r.id', 'r.status', 'r.occurrence_id'])
          .where('r.user_id', '=', userId)
          .where('r.status', 'in', [
            'pending_approval',
            'confirmed',
            'waitlisted',
          ])
          .where('o.status', '=', 'scheduled')
          .where('o.starts_at', '>', sql<Date>`now()`)
          .orderBy('o.starts_at')
          .execute();
        for (const registration of registrations) {
          const occurrence = await lockOccurrence(
            trx,
            registration.occurrence_id,
          );
          await trx
            .updateTable('registration')
            .set({ status: 'cancelled', cancelled_at: sql<Date>`now()` })
            .where('id', '=', registration.id)
            .execute();
          if (registration.status === 'confirmed') {
            const event = await trx
              .selectFrom('event')
              .selectAll()
              .where('id', '=', occurrence.event_id)
              .executeTakeFirstOrThrow();
            const outcome = await promoteFromWaitlist(trx, event, occurrence);
            outcome.promotedUserIds.forEach((id) => promoted.add(id));
          }
        }

        // 2. Owned events: transfer to the oldest co-organizer, or cancel the upcoming sessions (BR-GDP-04).
        const transferredEvents: ErasureOutcome['transferredEvents'] = [];
        const cancelledOccurrences: ErasureOutcome['cancelledOccurrences'] = [];
        const owned = await trx
          .selectFrom('event')
          .select(['id', 'status'])
          .where('owner_id', '=', userId)
          .forUpdate()
          .execute();
        for (const event of owned) {
          const co = await trx
            .selectFrom('event_co_organizer')
            .select('user_id')
            .where('event_id', '=', event.id)
            .orderBy('added_at')
            .orderBy('user_id')
            .executeTakeFirst();
          if (co !== undefined) {
            transferredEvents.push({
              eventId: event.id,
              newOwnerId: co.user_id,
            });
            continue;
          }
          for (const occurrence of await upcomingScheduledOccurrences(
            trx,
            event.id,
          )) {
            const participants = (
              await activeRegistrantIds(trx, occurrence.id)
            ).filter((id) => id !== userId);
            await trx
              .updateTable('event_occurrence')
              .set({ status: 'cancelled', cancelled_at: sql<Date>`now()` })
              .where('id', '=', occurrence.id)
              .execute();
            cancelledOccurrences.push({
              occurrenceId: occurrence.id,
              eventId: event.id,
              participantUserIds: participants,
            });
          }
        }

        // 3. Transfers, withdrawals and deletion (database function, BR-GDP-04, BR-GDP-05).
        await sql`SELECT erase_user_account(${userId}::uuid)`.execute(trx);
        for (const id of promoted) {
          if (id === userId) promoted.delete(id);
        }
        return {
          userId,
          promotedUserIds: [...promoted],
          cancelledOccurrences,
          transferredEvents,
        };
      });
    } catch (err) {
      throw mapDbError(err, GDPR_CONSTRAINTS);
    }
  }

  /**
   * Accounts inactive for 12 months that were not warned yet, and have no deletion request (BR-GDP-08), with the email
   * to warn (decrypted; never log it). After sending, call `markInactivityWarned`. Warned accounts still inactive at
   * 24 months are scheduled for deletion by the database.
   */
  async listInactiveAccountsToWarn(limit = 100): Promise<InactiveAccount[]> {
    try {
      const rows = await this.db
        .selectFrom('user_account as u')
        .select([
          'u.id',
          'u.first_name',
          decryptText('u.email_ciphertext').as('email'),
        ])
        .where('u.inactivity_warned_at', 'is', null)
        .where('u.deletion_requested_at', 'is', null)
        .where(
          sql<Date>`COALESCE(u.last_active_at, u.created_at)`,
          '<',
          sql<Date>`now() - make_interval(months => ${WARNING_MONTHS})`,
        )
        .orderBy('u.id')
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        userId: row.id,
        email: String(row.email),
        firstName: row.first_name,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Records that the inactivity warning was sent (BR-GDP-08). */
  async markInactivityWarned(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.db
        .updateTable('user_account')
        .set({ inactivity_warned_at: sql<Date>`now()` })
        .where('id', 'in', userIds)
        .where('inactivity_warned_at', 'is', null)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  private async finishExport(
    requestId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('data_export_request')
          .select('status')
          .where('id', '=', requestId)
          .forUpdate()
          .executeTakeFirst();
        if (row === undefined) {
          throw new NotFoundError('Export request not found');
        }
        if (row.status !== 'processing') {
          throw new InvalidStateError('The export is not being processed');
        }
        await trx
          .updateTable('data_export_request')
          .set(values)
          .where('id', '=', requestId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, GDPR_CONSTRAINTS);
    }
  }
}

function toExport(row: {
  id: string;
  status: DataExportRequest['status'];
  requested_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
  file_path: string | null;
}): DataExportRequest {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    filePath: row.file_path,
  };
}
