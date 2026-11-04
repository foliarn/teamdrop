import type { Venue } from '../../types/event.types';

/** A venue row with its point read as latitude and longitude. */
export type VenueRecord = {
  id: string;
  name: string;
  address: string;
  municipality_id: string;
  is_private: boolean;
  created_by_id: string | null;
  created_at: Date;
  lat: number;
  lng: number;
};

/** Maps a venue row (with its coordinates) to the public `Venue` type. */
export function toVenue(row: VenueRecord): Venue {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    municipalityId: row.municipality_id,
    location: { lat: row.lat, lng: row.lng },
    isPrivate: row.is_private,
    createdById: row.created_by_id,
    createdAt: row.created_at,
  };
}
