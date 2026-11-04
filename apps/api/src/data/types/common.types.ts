/** Local calendar date, 'YYYY-MM-DD'. Calendar logic uses Europe/Paris. */
export type LocalDate = string; // 'YYYY-MM-DD'

/** Local time of day, 'HH:mm'. */
export type LocalTime = string; // 'HH:mm'

/** Geographic point, WGS 84. */
export type GeoPoint = { lat: number; lng: number };

/** Cursor pagination input. */
export type PageRequest = { cursor?: string; limit?: number };

/** Cursor pagination output. `nextCursor` is null on the last page. */
export type Page<T> = { items: T[]; nextCursor: string | null };
