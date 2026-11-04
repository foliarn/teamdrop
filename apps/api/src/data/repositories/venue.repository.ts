import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type SqlBool, type Updateable, sql } from 'kysely';
import {
  type DataError,
  InvalidInputError,
  InvalidReferenceError,
  NotFoundError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { geographyPoint, latitudeOf, longitudeOf } from '../internal/geo';
import { KYSELY } from '../internal/kysely';
import { escapeLike } from '../internal/expressions';
import { clampLimit } from '../internal/pagination';
import { toVenue } from '../internal/mappers/event.mapper';
import type {
  CreateVenueInput,
  SearchVenuesInput,
  UpdateVenuePatch,
  Venue,
} from '../types/event.types';

/** Constraints of `venue`, mapped to typed errors. */
const VENUE_CONSTRAINTS: Record<string, () => DataError> = {
  fk_venue_municipality_id: () =>
    new InvalidReferenceError('Unknown municipality'),
  fk_venue_created_by_id: () => new NotFoundError('User not found'),
};

/** Minimum length of a venue name query. */
const MIN_QUERY_LENGTH = 2;

/**
 * Saved venues (BR-EVT-08). Venues are public by default and can be made private by their creator.
 * Who may edit or delete a venue is checked by the developers (the creator).
 */
@Injectable()
export class VenueRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Creates a venue, public unless `isPrivate` is set (BR-EVT-08).
   * Errors: `InvalidReferenceError` (unknown municipality), `NotFoundError` (unknown creator).
   * Outcome: the new venue.
   */
  async createVenue(userId: string, input: CreateVenueInput): Promise<Venue> {
    try {
      const row = await this.db
        .insertInto('venue')
        .values({
          name: input.name,
          address: input.address,
          municipality_id: input.municipalityId,
          location: geographyPoint(input.location),
          is_private: input.isPrivate ?? false,
          created_by_id: userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return await this.getVenueRow(row.id);
    } catch (err) {
      throw mapDbError(err, VENUE_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a venue. Events keep the address and point they copied (BR-EVT-08).
   * Errors: `NotFoundError`, `InvalidReferenceError`.
   * Outcome: none.
   */
  async updateVenue(venueId: string, patch: UpdateVenuePatch): Promise<void> {
    const values: Updateable<DB['venue']> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.address !== undefined) values.address = patch.address;
    if (patch.municipalityId !== undefined)
      values.municipality_id = patch.municipalityId;
    if (patch.isPrivate !== undefined) values.is_private = patch.isPrivate;
    const point =
      patch.location === undefined ? undefined : geographyPoint(patch.location);
    try {
      if (Object.keys(values).length === 0 && point === undefined) {
        await this.getVenueRow(venueId);
        return;
      }
      const result = await this.db
        .updateTable('venue')
        .set({ ...values, ...(point === undefined ? {} : { location: point }) })
        .where('id', '=', venueId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('Venue not found');
      }
    } catch (err) {
      throw mapDbError(err, VENUE_CONSTRAINTS);
    }
  }

  /**
   * Deletes a venue. Events and occurrences that used it keep their copied address and point (BR-EVT-08, FK SET NULL).
   * Errors: `NotFoundError`.
   * Outcome: none.
   */
  async deleteVenue(venueId: string): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('venue')
        .where('id', '=', venueId)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Venue not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Searches venues visible to the viewer: public venues and the viewer's own private ones (BR-EVT-08).
   * `near` keeps venues within the radius; `query` matches names with trigram similarity (BR-TECH-10).
   * Errors: `InvalidInputError` (query shorter than 2 characters, radius not positive).
   * Outcome: up to `limit` venues (default 20, max 100), closest first when `near` is given, else best match first.
   */
  async searchVenues(
    viewerId: string,
    input: SearchVenuesInput,
  ): Promise<Venue[]> {
    const query = input.query?.trim();
    if (query !== undefined && query.length < MIN_QUERY_LENGTH) {
      throw new InvalidInputError('The query must be at least 2 characters');
    }
    if (input.near !== undefined && !(input.near.radiusMeters > 0)) {
      throw new InvalidInputError('The radius must be positive');
    }
    try {
      let builder = this.db
        .selectFrom('venue as v')
        .select([
          'v.id',
          'v.name',
          'v.address',
          'v.municipality_id',
          'v.is_private',
          'v.created_by_id',
          'v.created_at',
          latitudeOf(sql`v.location`).as('lat'),
          longitudeOf(sql`v.location`).as('lng'),
        ])
        .where((eb) =>
          eb.or([
            eb('v.is_private', '=', false),
            eb('v.created_by_id', '=', viewerId),
          ]),
        );
      if (input.near !== undefined) {
        builder = builder.where(
          sql<SqlBool>`ST_DWithin(v.location, ${geographyPoint(input.near.point)}, ${input.near.radiusMeters})`,
        );
      }
      if (query !== undefined) {
        builder = builder.where(
          sql<SqlBool>`(
            immutable_unaccent(v.name) % immutable_unaccent(${query})
            OR immutable_unaccent(v.name) ILIKE ${`%${escapeLike(query)}%`}
          )`,
        );
        builder = builder.orderBy(
          sql`similarity(immutable_unaccent(v.name), immutable_unaccent(${query})) DESC`,
        );
      }
      if (input.near !== undefined) {
        builder = builder.orderBy(
          sql`ST_Distance(v.location, ${geographyPoint(input.near.point)})`,
        );
      }
      const rows = await builder
        .orderBy('v.name')
        .orderBy('v.id')
        .limit(clampLimit(input.limit))
        .execute();
      return rows.map(toVenue);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Reads one venue with its coordinates. Throws `NotFoundError` when it does not exist. */
  private async getVenueRow(venueId: string): Promise<Venue> {
    const row = await this.db
      .selectFrom('venue as v')
      .select([
        'v.id',
        'v.name',
        'v.address',
        'v.municipality_id',
        'v.is_private',
        'v.created_by_id',
        'v.created_at',
        latitudeOf(sql`v.location`).as('lat'),
        longitudeOf(sql`v.location`).as('lng'),
      ])
      .where('v.id', '=', venueId)
      .executeTakeFirst();
    if (row === undefined) {
      throw new NotFoundError('Venue not found');
    }
    return toVenue(row);
  }
}
