import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type RawBuilder, type SqlBool, sql } from 'kysely';
import {
  type DataError,
  BlockedError,
  InvalidInputError,
  InvalidReferenceError,
  InvalidStateError,
  NotCoOrganizerError,
  NotFoundError,
  NotMemberError,
  OccurrenceFullError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { escapeLike } from '../internal/expressions';
import { decodeCursor, encodeCursor, clampLimit } from '../internal/pagination';
import { isBlocked } from '../internal/visibility';
import { eventVisibleTo } from '../internal/event-visibility';
import {
  assertLevelRange,
  resolveLocation,
  skillLevelRank,
} from '../internal/event-values';
import {
  assertCoOrganizer,
  updateOccurrence,
  updateSeries,
  splitSeries,
} from '../internal/event-update';
import {
  eventSourceSql,
  occurrenceSourceSql,
  summaryOfMaterialized,
  summaryOfVirtual,
  type EventSourceRow,
  type NearFilter,
  type OccurrenceSourceRow,
} from '../internal/event-queries';
import {
  ownerOf,
  ACTIVE_REGISTRATION_STATUSES,
  activeRegistrantIds,
  effectiveMaxParticipants,
  loadEvent,
  lockEvent,
  lockOccurrence,
  materializeOccurrence,
  promoteFromWaitlist,
  scheduleOf,
  takenSpots,
  upcomingScheduledOccurrences,
} from '../internal/occurrences';
import { geographyPoint } from '../internal/geo';
import {
  expandDates,
  validateRecurrenceRule,
  type RecurrenceInput,
} from '../internal/recurrence';
import {
  addDays,
  instantToLocal,
  isLocalDate,
  isLocalTime,
  localToInstant,
  todayLocal,
} from '../internal/time';
import type { Page, PageRequest } from '../types/common.types';
import type {
  CancelOutcome,
  CreateEventInput,
  MyOrganizedEvent,
  MyPastRegistration,
  MyUpcomingRegistration,
  OccurrenceDetails,
  OccurrenceKey,
  OccurrenceSummary,
  PromotionOutcome,
  SearchOccurrencesFilters,
  UpdateEventOutcome,
  UpdateEventPatch,
  UpdateEventScope,
} from '../types/event.types';

/** Constraints of `event`, `event_occurrence` and related foreign keys, mapped to typed errors. */
const EVENT_CONSTRAINTS: Record<string, () => DataError> = {
  fk_event_owner_id: () => new NotFoundError('User not found'),
  fk_event_community_id: () => new InvalidReferenceError('Unknown community'),
  fk_event_sport_id: () => new InvalidReferenceError('Unknown sport'),
  fk_event_skill_level_min_id: () =>
    new InvalidReferenceError('Unknown skill level'),
  fk_event_skill_level_max_id: () =>
    new InvalidReferenceError('Unknown skill level'),
  fk_event_venue_id: () => new InvalidReferenceError('Unknown venue'),
  fk_event_municipality_id: () =>
    new InvalidReferenceError('Unknown municipality'),
  fk_event_split_from_event_id: () =>
    new InvalidReferenceError('Unknown event'),
  ck_event_max_participants: () => new InvalidInputError('Invalid capacity'),
  ck_event_min_participants: () =>
    new InvalidInputError('Invalid minimum participants'),
  ck_event_duration_positive: () =>
    new InvalidInputError('Duration must be positive'),
  ck_event_circle_priority_hours: () =>
    new InvalidInputError('Invalid circle priority delay'),
  ck_event_community_only_requires_community: () =>
    new InvalidInputError('A community-only event needs a community'),
  ck_event_recurrence_end: () =>
    new InvalidInputError('Use either an end date or a count'),
  ck_event_recurrence_fields: () =>
    new InvalidInputError('End fields need a recurrence rule'),
  ck_event_recurrence_count_positive: () =>
    new InvalidInputError('Count must be at least 1'),
  ck_event_published_at: () =>
    new InvalidInputError('Invalid publication state'),
  fk_event_occurrence_venue_id: () =>
    new InvalidReferenceError('Unknown venue'),
  fk_event_occurrence_municipality_id: () =>
    new InvalidReferenceError('Unknown municipality'),
  ck_event_occurrence_duration_positive: () =>
    new InvalidInputError('Duration must be positive'),
  ck_event_occurrence_max_participants: () =>
    new InvalidInputError('Invalid capacity'),
  fk_event_co_organizer_user_id: () => new NotFoundError('User not found'),
  fk_event_circle_circle_id: () => new InvalidReferenceError('Unknown circle'),
};

/** Keeps the UTC instant of a local day, used to compare with window bounds. */
const DAY_MS = 86_400_000;

/** Maximum span of a search range, inclusive (BR-EVT-03: occurrences are computed on the fly). */
const MAX_SEARCH_DAYS = 31;

/** Cursor of occurrence search: (startsAt, eventId, date). */
type OccurrenceCursor = { t: number; e: string; d: string };

/** Compares two (startsAt, eventId, date) keys. */
function compareOccurrenceKeys(
  a: { t: number; e: string; d: string },
  b: { t: number; e: string; d: string },
): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.e !== b.e) return a.e < b.e ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

/** Recurrence input of an event source row (for date expansion). */
function scheduleOfSource(row: EventSourceRow): RecurrenceInput {
  return {
    startDate: row.start_date,
    rule: row.recurrence_rule,
    until: row.recurrence_until,
    count: row.recurrence_count,
  };
}

/** Local start time of a source row, 'HH:mm'. */
function startTimeOfSource(row: EventSourceRow): string {
  return row.start_time.slice(0, 5);
}

/**
 * Events: templates, occurrences, organizers, venues-free scheduling, and the read side for viewers
 * (search, details, my lists). Rules: BR-EVT-01 to BR-EVT-27, BR-REG-06 for the occurrence rows.
 * Permissions (who may create, edit or cancel) are checked by the developers; this class checks the data rules.
 */
@Injectable()
export class EventRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Creates an event as a draft (BR-EVT-01, BR-EVT-02, BR-EVT-08, BR-EVT-23).
   * Checks: level range (min rank <= max rank); recurrence subset; `circle_priority` and `circle_only` need at least one
   * circle that the owner is a member of; `community_only` needs a community; a venue fills the missing address,
   * point and municipality, otherwise they are required (BR-EVT-08). The community creator check (BR-SOC-10) is the
   * developers' job.
   * Errors: `InvalidInputError`, `InvalidRecurrenceError`, `InvalidReferenceError`, `NotMemberError`, `NotFoundError`.
   * Outcome: the new event id.
   */
  async createEvent(
    ownerId: string,
    input: CreateEventInput,
  ): Promise<{ eventId: string }> {
    if (!isLocalDate(input.startDate) || !isLocalTime(input.startTime)) {
      throw new InvalidInputError('Invalid start date or time');
    }
    if (input.recurrence !== undefined) {
      validateRecurrenceRule(input.recurrence.rule);
    }
    const visibility = input.visibility ?? 'public';
    const circleIds = [...new Set(input.circleIds ?? [])];
    if (
      (visibility === 'circle_priority' || visibility === 'circle_only') &&
      circleIds.length === 0
    ) {
      throw new InvalidInputError('This visibility needs at least one circle');
    }
    if (visibility === 'community_only' && input.communityId === undefined) {
      throw new InvalidInputError('A community-only event needs a community');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        await assertLevelRange(
          trx,
          input.skillLevelMinId,
          input.skillLevelMaxId,
        );

        // BR-EVT-08: a venue fills the missing address, point and municipality.
        const location = await resolveLocation(trx, ownerId, {
          venueId: input.venueId,
          address: input.address,
          municipalityId: input.municipalityId,
          location: input.location,
        });
        if (
          location.address === undefined ||
          location.municipalityId === undefined ||
          location.location === undefined
        ) {
          throw new InvalidInputError(
            'Address, municipality and location are required without a venue',
          );
        }

        if (circleIds.length > 0) {
          await this.assertCirclesOfOwner(trx, ownerId, circleIds);
        }

        const event = await trx
          .insertInto('event')
          .values({
            owner_id: ownerId,
            community_id: input.communityId ?? null,
            sport_id: input.sportId,
            title: input.title,
            description: input.description ?? null,
            skill_level_min_id: input.skillLevelMinId,
            skill_level_max_id: input.skillLevelMaxId,
            adults_only: input.adultsOnly ?? false,
            min_participants: input.minParticipants ?? null,
            max_participants: input.maxParticipants,
            owner_counts_toward_capacity:
              input.ownerCountsTowardCapacity ?? true,
            registration_mode: input.registrationMode ?? 'automatic',
            visibility,
            circle_priority_hours: input.circlePriorityHours ?? null,
            venue_id: input.venueId ?? null,
            address: location.address,
            municipality_id: location.municipalityId,
            location: geographyPoint(location.location),
            location_hidden: input.locationHidden ?? false,
            start_date: input.startDate,
            start_time: input.startTime,
            duration_minutes: input.durationMinutes,
            recurrence_rule: input.recurrence?.rule ?? null,
            recurrence_until: input.recurrence?.until ?? null,
            recurrence_count: input.recurrence?.count ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        if (circleIds.length > 0) {
          await trx
            .insertInto('event_circle')
            .values(
              circleIds.map((circleId) => ({
                event_id: event.id,
                circle_id: circleId,
              })),
            )
            .execute();
        }
        return { eventId: event.id };
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Publishes a draft (BR-EVT-24). A one-off event gets its single occurrence now (BR-EVT-03); a series does not.
   * Errors: `NotFoundError`, `InvalidStateError` (not a draft).
   * Outcome: none.
   */
  async publishEvent(eventId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        if (event.status !== 'draft') {
          throw new InvalidStateError('Only a draft can be published');
        }
        await trx
          .updateTable('event')
          .set({ status: 'published', published_at: sql<Date>`now()` })
          .where('id', '=', eventId)
          .execute();
        if (event.recurrence_rule === null) {
          // BR-EVT-03: a one-off event gets its single occurrence when it is published.
          await materializeOccurrence(
            trx,
            { ...event, status: 'published' },
            event.start_date,
          );
        }
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Edits an event (BR-EVT-04, BR-EVT-05, BR-EVT-06, BR-EVT-07), in one of three scopes:
   * - `'series'`: the event row; schedule changes apply to upcoming scheduled occurrences;
   * - `{ occurrenceDate }`: only start, duration, place and capacity of that date;
   * - `{ fromDate }`: "this and following", which splits the series (not for a one-off event).
   * Capacity below the confirmed spots is refused (BR-EVT-06). A cancelled event cannot be edited.
   * Errors: `NotFoundError`, `InvalidStateError`, `InvalidInputError`, `InvalidRecurrenceError`, `InvalidReferenceError`,
   * `CapacityBelowConfirmedError`.
   * Outcome: the active registrants to notify (without `actorId`) and whether the change is significant.
   */
  async updateEvent(
    eventId: string,
    actorId: string,
    patch: UpdateEventPatch,
    scope: UpdateEventScope,
  ): Promise<UpdateEventOutcome> {
    if (patch.recurrence) {
      validateRecurrenceRule(patch.recurrence.rule);
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        if (event.status === 'cancelled') {
          throw new InvalidStateError('A cancelled event cannot be edited');
        }
        if (scope === 'series') {
          return updateSeries(trx, event, actorId, patch);
        }
        if ('occurrenceDate' in scope) {
          if (!isLocalDate(scope.occurrenceDate)) {
            throw new InvalidInputError('Invalid occurrence date');
          }
          return updateOccurrence(
            trx,
            event,
            actorId,
            scope.occurrenceDate,
            patch,
          );
        }
        if (!isLocalDate(scope.fromDate)) {
          throw new InvalidInputError('Invalid date');
        }
        return splitSeries(trx, event, actorId, patch, scope.fromDate);
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Cancels an event: the event becomes `cancelled` and every upcoming scheduled occurrence is cancelled (BR-EVT-24).
   * Permission: organizers, moderators and admins (BR-EVT-25), checked by the developers.
   * Errors: `NotFoundError`, `InvalidStateError` (already cancelled).
   * Outcome: the active registrants of the cancelled occurrences, without `actorId`.
   */
  async cancelEvent(
    eventId: string,
    actorId: string,
    reason?: string,
  ): Promise<CancelOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        if (event.status === 'cancelled') {
          throw new InvalidStateError('The event is already cancelled');
        }
        await trx
          .updateTable('event')
          .set({ status: 'cancelled' })
          .where('id', '=', eventId)
          .execute();
        const upcoming = await upcomingScheduledOccurrences(trx, eventId);
        const affected = await this.cancelOccurrenceRows(
          trx,
          upcoming,
          actorId,
          reason,
        );
        return { affectedUserIds: affected };
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Cancels one occurrence, materializing it first (BR-EVT-03). Only a published event has occurrences to cancel.
   * Permission: organizers, moderators and admins (BR-EVT-25), checked by the developers.
   * Errors: `NotFoundError` (unknown event or date), `InvalidStateError` (not published, or not scheduled).
   * Outcome: the active registrants of the occurrence, without `actorId`.
   */
  async cancelOccurrence(
    key: OccurrenceKey,
    actorId: string,
    reason?: string,
  ): Promise<CancelOutcome> {
    if (!isLocalDate(key.date)) {
      throw new NotFoundError('Occurrence not found');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await loadEvent(trx, key.eventId);
        if (event.status !== 'published') {
          throw new InvalidStateError(
            'Only occurrences of a published event can be cancelled',
          );
        }
        const { row } = await materializeOccurrence(trx, event, key.date);
        const occurrence = await lockOccurrence(trx, row.id);
        if (occurrence.status !== 'scheduled') {
          throw new InvalidStateError(
            'Only scheduled occurrences can be cancelled',
          );
        }
        const affected = await this.cancelOccurrenceRows(
          trx,
          [occurrence],
          actorId,
          reason,
        );
        return { affectedUserIds: affected };
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Transfers ownership to a co-organizer (BR-EVT-20, BR-EVT-21). The new owner leaves the co-organizers; the old owner
   * joins them with the old owner's capacity flag; the event takes the new owner's flag. Registrations are unchanged.
   * Permission: the current owner, checked by the developers.
   * Errors: `NotCoOrganizerError` (the new owner is not a co-organizer), `NotFoundError`.
   * Outcome: none.
   */
  async transferOwnership(eventId: string, newOwnerId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        await assertCoOrganizer(trx, eventId, newOwnerId);
        const newOwner = await trx
          .selectFrom('event_co_organizer')
          .select('counts_toward_capacity')
          .where('event_id', '=', eventId)
          .where('user_id', '=', newOwnerId)
          .executeTakeFirstOrThrow();

        await trx
          .deleteFrom('event_co_organizer')
          .where('event_id', '=', eventId)
          .where('user_id', '=', newOwnerId)
          .execute();
        await trx
          .insertInto('event_co_organizer')
          .values({
            event_id: eventId,
            user_id: ownerOf(event),
            counts_toward_capacity: event.owner_counts_toward_capacity,
            added_at: sql<Date>`now()`,
          })
          .execute();
        await trx
          .updateTable('event')
          .set({
            owner_id: newOwnerId,
            owner_counts_toward_capacity: newOwner.counts_toward_capacity,
          })
          .where('id', '=', eventId)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Adds a co-organizer (BR-EVT-20). If the co-organizer counts toward capacity, a confirmed registration is added on
   * every upcoming scheduled materialized occurrence, when the capacity allows; otherwise nothing changes (BR-EVT-21, BR-EVT-22).
   * Permission: the owner, checked by the developers.
   * Errors: `BlockedError` (blocked with the owner, BR-SOC-02), `InvalidInputError` (owner or already a co-organizer),
   * `OccurrenceFullError`, `NotFoundError`.
   * Outcome: none.
   */
  async addCoOrganizer(
    eventId: string,
    userId: string,
    countsTowardCapacity: boolean,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        if (userId === event.owner_id) {
          throw new InvalidInputError(
            'The owner cannot be added as a co-organizer',
          );
        }
        // BR-SOC-02: no organizing with a blocked user.
        if (await isBlocked(trx, ownerOf(event), userId)) {
          throw new BlockedError();
        }
        const existing = await trx
          .selectFrom('event_co_organizer')
          .select('user_id')
          .where('event_id', '=', eventId)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (existing !== undefined) {
          throw new InvalidInputError('Already a co-organizer');
        }
        await trx
          .insertInto('event_co_organizer')
          .values({
            event_id: eventId,
            user_id: userId,
            counts_toward_capacity: countsTowardCapacity,
            added_at: sql<Date>`now()`,
          })
          .execute();

        if (!countsTowardCapacity) {
          return;
        }
        // BR-EVT-21: the co-organizer takes a spot on each upcoming occurrence, if there is room.
        const upcoming = await upcomingScheduledOccurrences(trx, eventId);
        for (const occurrence of upcoming) {
          const alreadyRegistered = await trx
            .selectFrom('registration')
            .select('id')
            .where('occurrence_id', '=', occurrence.id)
            .where('user_id', '=', userId)
            .where('status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
            .executeTakeFirst();
          if (alreadyRegistered !== undefined) {
            continue;
          }
          const taken = await takenSpots(trx, occurrence.id);
          if (taken + 1 > effectiveMaxParticipants(event, occurrence)) {
            throw new OccurrenceFullError();
          }
          await trx
            .insertInto('registration')
            .values({
              occurrence_id: occurrence.id,
              user_id: userId,
              status: 'confirmed',
              confirmed_at: sql<Date>`now()`,
            })
            .execute();
        }
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Removes a co-organizer (BR-EVT-20). Their organizer registrations on upcoming occurrences are cancelled, not as late
   * cancellations (BR-REG-06), and the waitlist is promoted where spots were freed (BR-REG-04).
   * Permission: the owner, checked by the developers.
   * Errors: `NotCoOrganizerError`, `NotFoundError`.
   * Outcome: the promoted users, to notify.
   */
  async removeCoOrganizer(
    eventId: string,
    userId: string,
  ): Promise<PromotionOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        const removed = await trx
          .deleteFrom('event_co_organizer')
          .where('event_id', '=', eventId)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (Number(removed.numDeletedRows) === 0) {
          throw new NotCoOrganizerError();
        }

        const promotedUserIds: string[] = [];
        const upcoming = await upcomingScheduledOccurrences(trx, eventId);
        for (const occurrence of upcoming) {
          const registration = await trx
            .selectFrom('registration')
            .select(['id', 'status'])
            .where('occurrence_id', '=', occurrence.id)
            .where('user_id', '=', userId)
            .where('status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
            .executeTakeFirst();
          if (registration === undefined) {
            continue;
          }
          // BR-REG-06: the organizer's own cancellation is not late; the flag stays false.
          await trx
            .updateTable('registration')
            .set({
              status: 'cancelled',
              cancelled_at: sql<Date>`now()`,
              is_late_cancellation: false,
            })
            .where('id', '=', registration.id)
            .execute();
          if (registration.status === 'confirmed') {
            const outcome = await promoteFromWaitlist(trx, event, occurrence);
            promotedUserIds.push(...outcome.promotedUserIds);
          }
        }
        return { promotedUserIds };
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Organizer role of a user on an event, used by the developers for permission checks.
   * Outcome: 'owner', 'co_organizer', or null (also when the event does not exist).
   */
  async getOrganizerRole(
    eventId: string,
    userId: string,
  ): Promise<'owner' | 'co_organizer' | null> {
    try {
      const event = await this.db
        .selectFrom('event')
        .select('owner_id')
        .where('id', '=', eventId)
        .executeTakeFirst();
      if (event === undefined) {
        return null;
      }
      if (event.owner_id === userId) {
        return 'owner';
      }
      const coOrganizer = await this.db
        .selectFrom('event_co_organizer')
        .select('user_id')
        .where('event_id', '=', eventId)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return coOrganizer === undefined ? null : 'co_organizer';
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Replaces the circles targeted by an event (BR-EVT-23). The owner must be a member of each circle.
   * `circle_priority` and `circle_only` events keep at least one circle.
   * Permission: the owner, checked by the developers. `ownerId` must be the event owner.
   * Errors: `InvalidInputError`, `InvalidReferenceError`, `NotMemberError`, `NotFoundError`.
   * Outcome: none.
   */
  async setTargetCircles(
    eventId: string,
    ownerId: string,
    circleIds: string[],
  ): Promise<void> {
    const ids = [...new Set(circleIds)];
    try {
      await this.db.transaction().execute(async (trx) => {
        const event = await lockEvent(trx, eventId);
        if (event.owner_id !== ownerId) {
          throw new InvalidInputError('Only the owner can target circles');
        }
        if (
          ids.length === 0 &&
          (event.visibility === 'circle_priority' ||
            event.visibility === 'circle_only')
        ) {
          throw new InvalidInputError(
            'This visibility needs at least one circle',
          );
        }
        if (ids.length > 0) {
          await this.assertCirclesOfOwner(trx, ownerId, ids);
        }
        await trx
          .deleteFrom('event_circle')
          .where('event_id', '=', eventId)
          .execute();
        if (ids.length > 0) {
          await trx
            .insertInto('event_circle')
            .values(
              ids.map((circleId) => ({
                event_id: eventId,
                circle_id: circleId,
              })),
            )
            .execute();
        }
      });
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Searches upcoming occurrences of published events visible to the viewer (BR-EVT-03, BR-EVT-09, BR-EVT-23, BR-SOC-02).
   * Algorithm: (1) SQL selects the candidate events (visibility, sport, level, text, date window, radius prefilter);
   * (2) SQL reads the materialized occurrences in the window with their effective values and counts; (3) TypeScript
   * expands the dates, merges the two, drops cancelled and out-of-radius occurrences, applies `hasFreeSpots`, sorts by
   * (startsAt, eventId, date) and paginates.
   * The range `from..to` is on the original local date of each occurrence (its key), inclusive, at most 31 days.
   * Errors: `InvalidInputError` (range, text shorter than 2 characters, invalid cursor), `InvalidReferenceError`.
   * Outcome: a cursor page of occurrence summaries.
   */
  async searchOccurrences(
    viewerId: string,
    input: SearchOccurrencesFilters & PageRequest,
  ): Promise<Page<OccurrenceSummary>> {
    const { from, to } = input;
    if (!isLocalDate(from) || !isLocalDate(to) || from > to) {
      throw new InvalidInputError('Invalid date range');
    }
    const span =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS +
      1;
    if (span > MAX_SEARCH_DAYS) {
      throw new InvalidInputError(
        `The range is at most ${MAX_SEARCH_DAYS} days`,
      );
    }
    const text = input.text?.trim();
    if (text !== undefined && text.length < 2) {
      throw new InvalidInputError('The text must be at least 2 characters');
    }
    if (input.near !== undefined && !(input.near.radiusMeters > 0)) {
      throw new InvalidInputError('The radius must be positive');
    }
    const limit = clampLimit(input.limit);
    const cursor =
      input.cursor === undefined ? null : parseOccurrenceCursor(input.cursor);
    const near: NearFilter | null = input.near ?? null;

    try {
      const levelRank =
        input.skillLevelId === undefined
          ? null
          : await skillLevelRank(this.db, input.skillLevelId);

      // (1) Candidate events.
      const conditions: RawBuilder<SqlBool>[] = [
        sql<SqlBool>`e.status = 'published'`,
        eventVisibleTo(viewerId),
        sql<SqlBool>`e.start_date <= ${to}::date`,
        sql<SqlBool>`(CASE
          WHEN e.recurrence_rule IS NULL THEN e.start_date >= ${from}::date
          ELSE (e.recurrence_until IS NULL OR e.recurrence_until >= ${from}::date)
        END)`,
      ];
      if (input.sportIds !== undefined && input.sportIds.length > 0) {
        conditions.push(
          sql<SqlBool>`e.sport_id = ANY(${input.sportIds}::uuid[])`,
        );
      }
      if (levelRank !== null) {
        conditions.push(
          sql<SqlBool>`smin.rank <= ${levelRank} AND ${levelRank} <= smax.rank`,
        );
      }
      if (text !== undefined) {
        conditions.push(sql<SqlBool>`(
          immutable_unaccent(e.title) ILIKE ${`%${escapeLike(text)}%`}
          OR immutable_unaccent(e.title) % immutable_unaccent(${text})
        )`);
      }
      const windowLow = localToInstant(addDays(from, -2), '00:00');
      const windowHigh = localToInstant(addDays(to, 3), '00:00');
      if (near !== null) {
        const point = geographyPoint(near.point);
        conditions.push(sql<SqlBool>`(
          ST_DWithin(e.location, ${point}, ${near.radiusMeters})
          OR ST_DWithin(em.center, ${point}, ${near.radiusMeters})
          OR EXISTS (
            SELECT 1 FROM event_occurrence po
            LEFT JOIN municipality pm ON pm.id = po.municipality_id
            WHERE po.event_id = e.id
              AND po.original_starts_at >= ${windowLow}
              AND po.original_starts_at < ${windowHigh}
              AND (
                ST_DWithin(COALESCE(po.location, e.location), ${point}, ${near.radiusMeters})
                OR ST_DWithin(COALESCE(pm.center, em.center), ${point}, ${near.radiusMeters})
              )
          )
        )`);
      }
      const eventRows = (
        await eventSourceSql(
          viewerId,
          near,
          sql<SqlBool>`(${sql.join(conditions, sql` AND `)})`,
        ).execute(this.db)
      ).rows;
      if (eventRows.length === 0) {
        return { items: [], nextCursor: null };
      }

      // (2) Materialized occurrences of those events, in the window.
      const eventIds = eventRows.map((row) => row.event_id);
      const occurrenceRows = (
        await occurrenceSourceSql(
          viewerId,
          near,
          sql<SqlBool>`o.event_id = ANY(${eventIds}::uuid[])
            AND o.original_starts_at >= ${windowLow}
            AND o.original_starts_at < ${windowHigh}`,
        ).execute(this.db)
      ).rows;
      const materialized = new Map<string, OccurrenceSourceRow>();
      for (const row of occurrenceRows) {
        materialized.set(
          `${row.event_id}|${row.original_starts_at.getTime()}`,
          row,
        );
      }

      // (3) Expansion, merge, filters, sort and pagination in TypeScript.
      const summaries: {
        cursor: OccurrenceCursor;
        summary: OccurrenceSummary;
      }[] = [];
      for (const event of eventRows) {
        const dates = expandDates(scheduleOfSource(event), from, to);
        for (const date of dates) {
          const original = localToInstant(
            date,
            startTimeOfSource(event),
            event.time_zone,
          );
          const row = materialized.get(
            `${event.event_id}|${original.getTime()}`,
          );
          let summary: OccurrenceSummary;
          if (row !== undefined) {
            if (row.occurrence_status === 'cancelled') {
              continue;
            }
            summary = summaryOfMaterialized(event, row, date);
          } else {
            summary = summaryOfVirtual(event, date, original);
          }
          if (
            near !== null &&
            (summary.distanceMeters === null ||
              summary.distanceMeters > near.radiusMeters)
          ) {
            continue;
          }
          if (input.hasFreeSpots === true && summary.freeSpots <= 0) {
            continue;
          }
          summaries.push({
            cursor: {
              t: summary.startsAt.getTime(),
              e: summary.eventId,
              d: date,
            },
            summary,
          });
        }
      }
      summaries.sort((a, b) => compareOccurrenceKeys(a.cursor, b.cursor));
      const remaining =
        cursor === null
          ? summaries
          : summaries.filter(
              (entry) => compareOccurrenceKeys(entry.cursor, cursor) > 0,
            );

      const pageItems = remaining.slice(0, limit);
      const last = pageItems[pageItems.length - 1];
      const nextCursor =
        remaining.length > limit && last !== undefined
          ? encodeCursor(last.cursor)
          : null;
      return { items: pageItems.map((entry) => entry.summary), nextCursor };
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * Details of one occurrence for a viewer (BR-EVT-03, BR-EVT-09, BR-EVT-23). Returns null when the event is not
   * visible, or when the date is neither produced by the schedule nor materialized (BR-EVT-03).
   * The address and the exact point are hidden from viewers who are neither organizers nor registered (BR-EVT-09).
   * `pendingCount` is set for organizers only.
   * Outcome: the details, or null.
   */
  async getOccurrence(
    viewerId: string,
    key: OccurrenceKey,
  ): Promise<OccurrenceDetails | null> {
    if (!isLocalDate(key.date)) {
      return null;
    }
    try {
      const event = (
        await eventSourceSql(
          viewerId,
          null,
          sql<SqlBool>`e.id = ${key.eventId}::uuid AND ${eventVisibleTo(viewerId)}`,
        ).execute(this.db)
      ).rows[0];
      if (event === undefined) {
        return null;
      }
      const original = localToInstant(
        key.date,
        startTimeOfSource(event),
        event.time_zone,
      );
      const row = (
        await occurrenceSourceSql(
          viewerId,
          null,
          sql<SqlBool>`o.event_id = ${key.eventId}::uuid AND o.original_starts_at = ${original}`,
        ).execute(this.db)
      ).rows[0];
      if (
        row === undefined &&
        expandDates(scheduleOfSource(event), key.date, key.date).length === 0
      ) {
        return null;
      }

      const summary =
        row === undefined
          ? summaryOfVirtual(event, key.date, original)
          : summaryOfMaterialized(event, row, key.date);
      const coOrganizers = await this.db
        .selectFrom('event_co_organizer as eco')
        .innerJoin('user_account as u', 'u.id', 'eco.user_id')
        .select(['u.id', 'u.username', 'eco.counts_toward_capacity'])
        .where('eco.event_id', '=', key.eventId)
        .orderBy('eco.added_at')
        .orderBy('u.id')
        .execute();

      let viewerRegistration: OccurrenceDetails['viewerRegistration'] = null;
      if (row !== undefined) {
        const registration = await this.db
          .selectFrom('registration as r')
          .select((eb) => [
            'r.id',
            'r.status',
            eb
              .selectFrom('registration_guest as g')
              .select((gb) => gb.fn.countAll<string>().as('guests'))
              .whereRef('g.registration_id', '=', 'r.id')
              .as('guests'),
          ])
          .where('r.occurrence_id', '=', row.occurrence_id)
          .where('r.user_id', '=', viewerId)
          .where('r.status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
          .executeTakeFirst();
        if (registration !== undefined) {
          viewerRegistration = {
            id: registration.id,
            status: registration.status,
            guestCount: Number(registration.guests ?? 0),
          };
        }
      }

      const isOrganizer = event.is_organizer;
      let pendingCount: number | null = null;
      if (isOrganizer) {
        pendingCount = 0;
        if (row !== undefined) {
          const pending = await this.db
            .selectFrom('registration')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .where('occurrence_id', '=', row.occurrence_id)
            .where('status', '=', 'pending_approval')
            .executeTakeFirst();
          pendingCount = Number(pending?.count ?? 0);
        }
      }

      return {
        ...summary,
        description: event.description,
        // BR-EVT-09: the text address is hidden with the exact location.
        address: summary.locationIsApproximate
          ? null
          : (row?.address ?? event.address),
        minParticipants: event.min_participants,
        // BR-GDP-04: `null` when the owner's account was erased ("deleted user").
        owner:
          event.owner_id === null || event.owner_username === null
            ? null
            : { id: event.owner_id, username: event.owner_username },
        coOrganizers: coOrganizers.map((co) => ({
          id: co.id,
          username: co.username,
          countsTowardCapacity: co.counts_toward_capacity,
        })),
        community:
          event.community_id === null || event.community_name === null
            ? null
            : { id: event.community_id, name: event.community_name },
        status: row === undefined ? 'scheduled' : row.occurrence_status,
        viewerRole:
          event.owner_id === viewerId
            ? 'owner'
            : isOrganizer
              ? 'co_organizer'
              : null,
        viewerRegistration,
        pendingCount,
      };
    } catch (err) {
      throw mapDbError(err, EVENT_CONSTRAINTS);
    }
  }

  /**
   * The viewer's active registrations on upcoming scheduled occurrences (BR-REG-02). Not paginated.
   * Outcome: the list, earliest first.
   */
  async listMyUpcoming(userId: string): Promise<MyUpcomingRegistration[]> {
    try {
      const rows = await this.db
        .selectFrom('registration as r')
        .innerJoin('event_occurrence as o', 'o.id', 'r.occurrence_id')
        .innerJoin('event as e', 'e.id', 'o.event_id')
        .select((eb) => [
          'r.id as registration_id',
          'r.status',
          'o.event_id',
          'o.original_starts_at',
          'o.starts_at',
          'e.time_zone',
          'e.title',
          sql<string>`COALESCE(o.duration_minutes, e.duration_minutes)`.as(
            'duration_minutes',
          ),
          eb
            .selectFrom('registration_guest as g')
            .select((gb) => gb.fn.countAll<string>().as('guests'))
            .whereRef('g.registration_id', '=', 'r.id')
            .as('guests'),
        ])
        .where('r.user_id', '=', userId)
        .where('r.status', 'in', [...ACTIVE_REGISTRATION_STATUSES])
        .where('o.status', '=', 'scheduled')
        .where(sql<SqlBool>`o.starts_at > now()`)
        .orderBy('o.starts_at')
        .orderBy('r.id')
        .execute();
      return rows.map((row) => ({
        registrationId: row.registration_id,
        status: row.status,
        occurrence: {
          eventId: row.event_id,
          date: instantToLocal(row.original_starts_at, row.time_zone).date,
        },
        startsAt: row.starts_at,
        durationMinutes: Number(row.duration_minutes),
        title: row.title,
        guestCount: Number(row.guests ?? 0),
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Events the user owns or co-organizes, drafts included (BR-EVT-20). `next` is the first occurrence that starts
   * after now and is not cancelled, looked up over the next 400 days.
   * Outcome: the list, by title.
   */
  async listMyOrganized(userId: string): Promise<MyOrganizedEvent[]> {
    try {
      const events = await this.db
        .selectFrom('event as e')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('e.owner_id', '=', userId),
            eb(
              'e.id',
              'in',
              eb
                .selectFrom('event_co_organizer')
                .select('event_id')
                .where('user_id', '=', userId),
            ),
          ]),
        )
        .orderBy('e.title')
        .orderBy('e.id')
        .execute();
      if (events.length === 0) {
        return [];
      }

      const occurrences = await this.db
        .selectFrom('event_occurrence')
        .select(['event_id', 'original_starts_at', 'starts_at', 'status'])
        .where(
          'event_id',
          'in',
          events.map((event) => event.id),
        )
        .where(sql<SqlBool>`original_starts_at >= now() - interval '2 days'`)
        .execute();
      const byKey = new Map<string, (typeof occurrences)[number]>();
      for (const row of occurrences) {
        byKey.set(`${row.event_id}|${row.original_starts_at.getTime()}`, row);
      }

      const now = Date.now();
      return events.map((event) => {
        const role = event.owner_id === userId ? 'owner' : 'co_organizer';
        let next: MyOrganizedEvent['next'] = null;
        if (event.status !== 'cancelled') {
          const today = todayLocal(event.time_zone);
          const dates = expandDates(
            scheduleOf(event),
            today,
            addDays(today, 400),
          );
          for (const date of dates) {
            const original = localToInstant(
              date,
              event.start_time.slice(0, 5),
              event.time_zone,
            );
            const row = byKey.get(`${event.id}|${original.getTime()}`);
            if (row?.status === 'cancelled') {
              continue;
            }
            const startsAt = row?.starts_at ?? original;
            if (startsAt.getTime() > now) {
              next = { date, startsAt };
              break;
            }
          }
        }
        return {
          eventId: event.id,
          title: event.title,
          status: event.status,
          role,
          next,
        };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * The viewer's registrations on past occurrences (BR-REG-02), newest first, keyset paginated on (startsAt, id).
   * Outcome: a cursor page.
   */
  async listMyPast(
    userId: string,
    page: PageRequest = {},
  ): Promise<Page<MyPastRegistration>> {
    const limit = clampLimit(page.limit);
    const cursor =
      page.cursor === undefined ? null : parsePastCursor(page.cursor);
    try {
      const rows = await this.db
        .selectFrom('registration as r')
        .innerJoin('event_occurrence as o', 'o.id', 'r.occurrence_id')
        .innerJoin('event as e', 'e.id', 'o.event_id')
        .select([
          'r.id as registration_id',
          'r.status',
          'r.attendance',
          'o.event_id',
          'o.original_starts_at',
          'o.starts_at',
          'e.time_zone',
          'e.title',
          sql<string>`COALESCE(o.duration_minutes, e.duration_minutes)`.as(
            'duration_minutes',
          ),
        ])
        .where('r.user_id', '=', userId)
        .where(sql<SqlBool>`o.starts_at < now()`)
        .$if(cursor !== null, (qb) =>
          qb.where(
            sql<SqlBool>`(o.starts_at, r.id) < (${cursor?.startsAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)`,
          ),
        )
        .orderBy('o.starts_at', 'desc')
        .orderBy('r.id', 'desc')
        .limit(limit + 1)
        .execute();

      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      const nextCursor =
        rows.length > limit && last !== undefined
          ? encodeCursor({
              t: last.starts_at.toISOString(),
              id: last.registration_id,
            })
          : null;
      return {
        items: pageRows.map((row) => ({
          registrationId: row.registration_id,
          status: row.status,
          occurrence: {
            eventId: row.event_id,
            date: instantToLocal(row.original_starts_at, row.time_zone).date,
          },
          startsAt: row.starts_at,
          durationMinutes: Number(row.duration_minutes),
          title: row.title,
          attendance: row.attendance,
        })),
        nextCursor,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Checks that every circle exists and that the owner is a member of each (BR-EVT-23). */
  private async assertCirclesOfOwner(
    trx: Kysely<DB>,
    ownerId: string,
    circleIds: string[],
  ): Promise<void> {
    const circles = await trx
      .selectFrom('circle')
      .select('id')
      .where('id', 'in', circleIds)
      .execute();
    if (circles.length !== circleIds.length) {
      throw new InvalidReferenceError('Unknown circle');
    }
    const memberships = await trx
      .selectFrom('circle_member')
      .select('circle_id')
      .where('user_id', '=', ownerId)
      .where('circle_id', 'in', circleIds)
      .execute();
    if (memberships.length !== circleIds.length) {
      throw new NotMemberError(
        'The owner must be a member of each targeted circle',
      );
    }
  }

  /**
   * Cancels upcoming occurrences (BR-EVT-06): status, time, actor and reason are recorded, the registrations are kept.
   * Locks each occurrence first. Returns the active registrants, without `actorId`.
   */
  private async cancelOccurrenceRows(
    trx: Kysely<DB>,
    occurrences: { id: string }[],
    actorId: string,
    reason: string | undefined,
  ): Promise<string[]> {
    const affected = new Set<string>();
    for (const occurrence of occurrences) {
      for (const userId of await activeRegistrantIds(trx, occurrence.id)) {
        if (userId !== actorId) {
          affected.add(userId);
        }
      }
      await trx
        .updateTable('event_occurrence')
        .set({
          status: 'cancelled',
          cancelled_at: sql<Date>`now()`,
          cancelled_by_id: actorId,
          cancellation_reason: reason ?? null,
        })
        .where('id', '=', occurrence.id)
        .execute();
    }
    return [...affected];
  }
}

/** Parses the cursor of occurrence search. Throws `INVALID_CURSOR` (through `InvalidInputError`) on bad input. */
function parseOccurrenceCursor(cursor: string): OccurrenceCursor {
  const value = decodeCursor<Partial<OccurrenceCursor>>(cursor);
  if (
    typeof value.t !== 'number' ||
    typeof value.e !== 'string' ||
    typeof value.d !== 'string'
  ) {
    throw new InvalidInputError('Invalid cursor');
  }
  return { t: value.t, e: value.e, d: value.d };
}

/** Parses the cursor of `listMyPast`. */
function parsePastCursor(cursor: string): { startsAt: Date; id: string } {
  const value = decodeCursor<Partial<{ t: string; id: string }>>(cursor);
  if (typeof value.t !== 'string' || typeof value.id !== 'string') {
    throw new InvalidInputError('Invalid cursor');
  }
  const startsAt = new Date(value.t);
  if (Number.isNaN(startsAt.getTime())) {
    throw new InvalidInputError('Invalid cursor');
  }
  return { startsAt, id: value.id };
}
