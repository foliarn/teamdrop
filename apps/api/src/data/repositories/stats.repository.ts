import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { computeProfileStats, computeReliability } from '../internal/stats';
import { asUuid, canViewSection } from '../internal/visibility';
import type {
  BadgeProgress,
  ProfileStats,
  Reliability,
} from '../types/stats.types';

/** Profile section whose visibility gates a read (BR-ACC-14). */
type Section = 'stats_visibility' | 'reliability_visibility';

/**
 * Per-user statistics, computed on demand by the data layer (BR-STA-01 to BR-STA-05, BR-STA-09, BR-ATT-04), and the
 * progress data the developers use to award badges (BR-GAM-02). Global statistics are in `AnalyticsRepository`.
 * Reads that show a profile are gated by the user's section visibility and by blocking (BR-ACC-14, BR-SOC-02).
 */
@Injectable()
export class StatsRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Profile statistics (BR-STA-01 to BR-STA-05): completed sessions, planned hours, people met, main sport by sessions
   * and by hours, specialist or all-rounder (70% of the sessions), current and longest streaks in days (Europe/Paris).
   * Outcome: `null` when the viewer may not see the stats section of this user, or the user does not exist.
   */
  async getProfileStats(
    viewerId: string,
    userId: string,
  ): Promise<ProfileStats | null> {
    try {
      if (!(await this.canSee(viewerId, userId, 'stats_visibility'))) {
        return null;
      }
      return await computeProfileStats(this.db, userId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Reliability rate (BR-ATT-04, BR-GDP-10): attended / (attended + no_show + 0.5 × late cancellations), all time and
   * the last 90 days. `hidden` is true, and the rates `null`, until the user has 5 past occurrences.
   * Outcome: `null` when the viewer may not see the reliability section of this user, or the user does not exist.
   */
  async getReliability(
    viewerId: string,
    userId: string,
  ): Promise<Reliability | null> {
    try {
      if (!(await this.canSee(viewerId, userId, 'reliability_visibility'))) {
        return null;
      }
      return await computeReliability(this.db, userId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Everything the developers' badge code needs to award or remove badges (BR-GAM-02): profile stats, reliability (with
   * its counts even when hidden), cheers received per type and completed occurrences of owned events. Not filtered by
   * visibility: never return it to a client as is.
   */
  async getBadgeProgress(userId: string): Promise<BadgeProgress> {
    try {
      const [stats, reliability, cheers, organized] = await Promise.all([
        computeProfileStats(this.db, userId),
        computeReliability(this.db, userId),
        sql<{ code: string; count: number }>`
          SELECT ct.code, count(*)::int AS count
          FROM cheer c JOIN cheer_type ct ON ct.id = c.cheer_type_id
          WHERE c.recipient_id = ${userId}::uuid
          GROUP BY ct.code
        `.execute(this.db),
        sql<{ count: number }>`
          SELECT count(*)::int AS count
          FROM event_occurrence o JOIN event e ON e.id = o.event_id
          WHERE e.owner_id = ${userId}::uuid AND o.status = 'completed'
        `.execute(this.db),
      ]);
      return {
        stats,
        reliability,
        cheersReceived: Object.fromEntries(
          cheers.rows.map((row) => [row.code, row.count]),
        ),
        organizedCompletedOccurrences: organized.rows[0]?.count ?? 0,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** True when the viewer may see this profile section of the user (BR-ACC-14, BR-SOC-02). */
  private async canSee(
    viewerId: string,
    userId: string,
    section: Section,
  ): Promise<boolean> {
    const result = await sql<{ ok: boolean }>`
      SELECT ${canViewSection(sql.ref(`s.${section}`), asUuid(viewerId), asUuid(userId))} AS ok
      FROM user_setting s WHERE s.user_id = ${userId}::uuid
    `.execute(this.db);
    return result.rows[0]?.ok === true;
  }
}
