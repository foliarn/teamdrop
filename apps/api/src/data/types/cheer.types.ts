import type { OccurrenceKey } from './event.types';

/** A cheer type (reference data, BR-SOC-11, BR-TECH-12). */
export type CheerType = {
  id: string;
  /** Stable English code: branch on it, never on `name` (BR-TECH-12). */
  code: string;
  name: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
};

/** Input of `CheerRepository.createCheerType` (back office). */
export type CreateCheerTypeInput = {
  code: string;
  name: string;
  sortOrder: number;
  icon?: string | null;
  isActive?: boolean;
};

/** Patch of `CheerRepository.updateCheerType` (back office). Missing fields are unchanged. */
export type UpdateCheerTypePatch = Partial<CreateCheerTypeInput>;

/** A participant of a completed occurrence the viewer may cheer (BR-SOC-11). */
export type CheerableParticipant = {
  userId: string;
  username: string;
  avatarPath: string | null;
  /** Code of the cheer the viewer already gave this participant for this occurrence, `null` if none. */
  givenCheerTypeCode: string | null;
};

/** A cheer as seen by its recipient, who sees the giver (BR-SOC-12). */
export type ReceivedCheer = {
  id: string;
  type: { code: string; name: string };
  /** `null` when the giver's account was erased ("deleted user", BR-GDP-05). */
  giver: { userId: string; username: string; avatarPath: string | null } | null;
  occurrence: {
    occurrenceId: string;
    key: OccurrenceKey;
    title: string;
    startsAt: Date;
  };
  createdAt: Date;
};

/** Count of cheers of one type received by a user, as seen by others (BR-SOC-12). */
export type CheerCount = { code: string; name: string; count: number };
