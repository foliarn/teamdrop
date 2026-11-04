import { type RawBuilder, sql } from 'kysely';
import type { GeoPoint } from '../types/common.types';

/** A WGS 84 point as a `geography` fragment: `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`. */
export function geographyPoint(point: GeoPoint): RawBuilder<string> {
  return sql<string>`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography`;
}

/** Latitude of a `geography` expression, as a float. */
export function latitudeOf(
  expression: RawBuilder<unknown>,
): RawBuilder<number> {
  return sql<number>`ST_Y((${expression})::geometry)`;
}

/** Longitude of a `geography` expression, as a float. */
export function longitudeOf(
  expression: RawBuilder<unknown>,
): RawBuilder<number> {
  return sql<number>`ST_X((${expression})::geometry)`;
}
