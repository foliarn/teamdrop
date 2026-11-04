import type { Kysely } from 'kysely';
import type { DB } from './generated/database';
import type { AuditEntryInput } from '../types/moderation.types';

/**
 * Writes one audit log entry inside the caller's transaction, so the action and its trace commit together (BR-MOD-05).
 * `details` holds ids and codes only, never personal data or message bodies.
 */
export async function writeAudit(
  trx: Kysely<DB>,
  actorId: string | null,
  entry: AuditEntryInput,
): Promise<string> {
  const row = await trx
    .insertInto('audit_log')
    .values({
      actor_id: actorId,
      action: entry.action,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      report_id: entry.reportId ?? null,
      details:
        entry.details === undefined ? null : JSON.stringify(entry.details),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
