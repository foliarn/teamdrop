import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Updateable, sql } from 'kysely';
import {
  DataError,
  InvalidInputError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { asUuid, canViewSection } from '../internal/visibility';
import type {
  AwardBadgeOutcome,
  Badge,
  BadgeTierInput,
  CreateBadgeInput,
  UpdateBadgePatch,
  UserBadge,
} from '../types/stats.types';

const BADGE_CONSTRAINTS: Record<string, () => DataError> = {
  uq_badge_code: () => new InvalidInputError('Badge code is already used'),
  uq_badge_tier_badge_rank: () =>
    new InvalidInputError('Two tiers have the same rank'),
  ck_badge_tier_rank_positive: () =>
    new InvalidInputError('Tier ranks start at 1'),
  ck_badge_tier_threshold_not_negative: () =>
    new InvalidInputError('Thresholds cannot be negative'),
  fk_user_badge_user_id: () => new NotFoundError('User not found'),
  fk_user_badge_badge_id: () => new NotFoundError('Badge not found'),
  fk_user_badge_badge_tier_id: () =>
    new InvalidReferenceError('The tier does not belong to the badge'),
};

function assertText(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidInputError(`${name} is required`);
  }
}

/**
 * Badges (BR-GAM-01, BR-GAM-02): the catalog with optional tiers (back office), and the badges users hold. The badge
 * definitions are not decided yet (DEFERRED): the catalog starts empty. The developers' code evaluates badges in real
 * time with `StatsRepository.getBadgeProgress`, then awards or removes them here; badges can be lost.
 */
@Injectable()
export class BadgeRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** Lists the catalog by `sort_order`, with tiers lowest first; inactive badges only with `includeInactive`. */
  async listBadges(
    options: { includeInactive?: boolean } = {},
  ): Promise<Badge[]> {
    try {
      let query = this.db
        .selectFrom('badge')
        .selectAll()
        .orderBy('sort_order')
        .orderBy('code');
      if (options.includeInactive !== true) {
        query = query.where('is_active', '=', true);
      }
      const badges = await query.execute();
      if (badges.length === 0) {
        return [];
      }
      const tiers = await this.db
        .selectFrom('badge_tier')
        .selectAll()
        .where(
          'badge_id',
          'in',
          badges.map((b) => b.id),
        )
        .orderBy('tier_rank')
        .execute();
      return badges.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        description: b.description,
        category: b.category,
        icon: b.icon,
        isActive: b.is_active,
        sortOrder: b.sort_order,
        tiers: tiers
          .filter((t) => t.badge_id === b.id)
          .map((t) => ({
            id: t.id,
            rank: t.tier_rank,
            name: t.name,
            threshold: t.threshold,
          })),
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Creates a badge (back office; the caller checks the admin role and writes the audit entry).
   * Errors: `InvalidInputError` (code already used, blank fields).
   * Outcome: the badge id.
   */
  async createBadge(input: CreateBadgeInput): Promise<{ id: string }> {
    for (const field of ['code', 'name', 'description', 'category'] as const) {
      assertText(input[field], field);
    }
    try {
      const row = await this.db
        .insertInto('badge')
        .values({
          code: input.code,
          name: input.name,
          description: input.description,
          category: input.category,
          icon: input.icon ?? null,
          sort_order: input.sortOrder,
          ...(input.isActive === undefined
            ? {}
            : { is_active: input.isActive }),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return { id: row.id };
    } catch (err) {
      throw mapDbError(err, BADGE_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a badge (back office).
   * Errors: `NotFoundError`, `InvalidInputError`.
   */
  async updateBadge(id: string, patch: UpdateBadgePatch): Promise<void> {
    const values: Updateable<DB['badge']> = {};
    for (const field of ['code', 'name', 'description', 'category'] as const) {
      if (patch[field] !== undefined) {
        assertText(patch[field], field);
        values[field] = patch[field];
      }
    }
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.sortOrder !== undefined) values.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) values.is_active = patch.isActive;
    try {
      const exists = await this.db
        .selectFrom('badge')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (exists === undefined) {
        throw new NotFoundError('Badge not found');
      }
      if (Object.keys(values).length > 0) {
        await this.db
          .updateTable('badge')
          .set(values)
          .where('id', '=', id)
          .execute();
      }
    } catch (err) {
      throw mapDbError(err, BADGE_CONSTRAINTS);
    }
  }

  /**
   * Replaces the tiers of a badge (back office). Tiers whose rank is kept are updated in place, so holders keep their
   * level; removed ranks are deleted and their holders keep the badge without a level.
   * Errors: `NotFoundError` (badge), `InvalidInputError` (duplicate rank, rank below 1, negative threshold, blank name).
   */
  async setBadgeTiers(badgeId: string, tiers: BadgeTierInput[]): Promise<void> {
    const ranks = new Set(tiers.map((t) => t.rank));
    if (ranks.size !== tiers.length) {
      throw new InvalidInputError('Two tiers have the same rank');
    }
    tiers.forEach((t) => assertText(t.name, 'name'));
    try {
      await this.db.transaction().execute(async (trx) => {
        const badge = await trx
          .selectFrom('badge')
          .select('id')
          .where('id', '=', badgeId)
          .forUpdate()
          .executeTakeFirst();
        if (badge === undefined) {
          throw new NotFoundError('Badge not found');
        }
        let removal = trx
          .deleteFrom('badge_tier')
          .where('badge_id', '=', badgeId);
        if (tiers.length > 0) {
          removal = removal.where(
            'tier_rank',
            'not in',
            tiers.map((t) => t.rank),
          );
        }
        await removal.execute();
        for (const tier of tiers) {
          await trx
            .insertInto('badge_tier')
            .values({
              badge_id: badgeId,
              tier_rank: tier.rank,
              name: tier.name,
              threshold: tier.threshold,
            })
            .onConflict((oc) =>
              oc.constraint('uq_badge_tier_badge_rank').doUpdateSet({
                name: tier.name,
                threshold: tier.threshold,
              }),
            )
            .execute();
        }
      });
    } catch (err) {
      throw mapDbError(err, BADGE_CONSTRAINTS);
    }
  }

  /**
   * Deletes a badge and every user's copy of it (back office).
   * Errors: `NotFoundError`.
   */
  async deleteBadge(id: string): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('badge')
        .where('id', '=', id)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Badge not found');
      }
    } catch (err) {
      throw mapDbError(err, BADGE_CONSTRAINTS);
    }
  }

  /**
   * Awards a badge, or changes its level (BR-GAM-02, retroactive awarding allowed). A new badge or a new level resets
   * `unlocked_at` to now and `seen_at` to NULL, so the unlock animation plays once (BR-GAM-01).
   * Errors: `NotFoundError` (user or badge), `InvalidReferenceError` (tier of another badge).
   * Outcome: whether something changed, and whether the badge is new for the user.
   */
  async awardBadge(
    userId: string,
    badgeId: string,
    tierId: string | null = null,
  ): Promise<AwardBadgeOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const current = await trx
          .selectFrom('user_badge')
          .select('badge_tier_id')
          .where('user_id', '=', userId)
          .where('badge_id', '=', badgeId)
          .forUpdate()
          .executeTakeFirst();
        if (current !== undefined && current.badge_tier_id === tierId) {
          return { changed: false, isNew: false };
        }
        await trx
          .insertInto('user_badge')
          .values({ user_id: userId, badge_id: badgeId, badge_tier_id: tierId })
          .onConflict((oc) =>
            oc.constraint('pk_user_badge').doUpdateSet({
              badge_tier_id: tierId,
              unlocked_at: sql<Date>`now()`,
              seen_at: null,
            }),
          )
          .execute();
        return { changed: true, isNew: current === undefined };
      });
    } catch (err) {
      throw mapDbError(err, BADGE_CONSTRAINTS);
    }
  }

  /**
   * Removes a badge the user no longer deserves (BR-GAM-02: badges can be lost, the row is deleted).
   * Outcome: `removed` is false when the user did not hold it.
   */
  async removeBadge(
    userId: string,
    badgeId: string,
  ): Promise<{ removed: boolean }> {
    try {
      const result = await this.db
        .deleteFrom('user_badge')
        .where('user_id', '=', userId)
        .where('badge_id', '=', badgeId)
        .executeTakeFirst();
      return { removed: Number(result.numDeletedRows) > 0 };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the badges a user holds, by catalog order (BR-GAM-01). Gated by `badges_visibility` and blocking
   * (BR-ACC-14, BR-SOC-02). `seenAt` is only returned to the holder.
   * Outcome: `null` when the viewer may not see the badges section, or the user does not exist.
   */
  async listUserBadges(
    viewerId: string,
    userId: string,
  ): Promise<UserBadge[] | null> {
    try {
      const visible = await sql<{ ok: boolean }>`
        SELECT ${canViewSection(sql`s.badges_visibility`, asUuid(viewerId), asUuid(userId))} AS ok
        FROM user_setting s WHERE s.user_id = ${userId}::uuid
      `.execute(this.db);
      if (visible.rows[0]?.ok !== true) {
        return null;
      }
      return await this.userBadges(userId, viewerId === userId, false);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** The user's own badges whose unlock animation was not played yet (BR-GAM-01). */
  async listUnseenBadges(userId: string): Promise<UserBadge[]> {
    try {
      return await this.userBadges(userId, true, true);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Marks the user's badges as seen (the animation played). Unknown ids are ignored. */
  async markBadgesSeen(userId: string, badgeIds: string[]): Promise<void> {
    if (badgeIds.length === 0) {
      return;
    }
    try {
      await this.db
        .updateTable('user_badge')
        .set({ seen_at: sql<Date>`now()` })
        .where('user_id', '=', userId)
        .where('badge_id', 'in', badgeIds)
        .where('seen_at', 'is', null)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  private async userBadges(
    userId: string,
    isHolder: boolean,
    unseenOnly: boolean,
  ): Promise<UserBadge[]> {
    let query = this.db
      .selectFrom('user_badge as ub')
      .innerJoin('badge as b', 'b.id', 'ub.badge_id')
      .leftJoin('badge_tier as t', 't.id', 'ub.badge_tier_id')
      .select([
        'b.id',
        'b.code',
        'b.name',
        'b.category',
        'b.icon',
        't.id as tier_id',
        't.tier_rank',
        't.name as tier_name',
        'ub.unlocked_at',
        'ub.seen_at',
      ])
      .where('ub.user_id', '=', userId)
      .orderBy('b.sort_order')
      .orderBy('b.code');
    if (unseenOnly) {
      query = query.where('ub.seen_at', 'is', null);
    }
    const rows = await query.execute();
    return rows.map((row) => ({
      badgeId: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      icon: row.icon,
      tier:
        row.tier_id === null || row.tier_rank === null || row.tier_name === null
          ? null
          : { id: row.tier_id, rank: row.tier_rank, name: row.tier_name },
      unlockedAt: row.unlocked_at,
      seenAt: isHolder ? row.seen_at : null,
    }));
  }
}
