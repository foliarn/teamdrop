import type { GeoPoint, LocalDate } from './common.types';

/** Registration mode of an event (BR-REG-03). DB enum `registration_mode`. */
export type RegistrationMode = 'automatic' | 'approval';

/** Event visibility (BR-EVT-23). DB enum `event_visibility`. */
export type EventVisibility =
  'public' | 'circle_priority' | 'circle_only' | 'community_only';

/** Event status (BR-EVT-24). DB enum `event_status`. */
export type EventStatus = 'draft' | 'published' | 'cancelled';

/** Occurrence status (BR-EVT-24, BR-EVT-26). DB enum `occurrence_status`. */
export type OccurrenceStatus =
  'scheduled' | 'ongoing' | 'completed' | 'cancelled';

/** Registration status (BR-REG-02, BR-REG-04). DB enum `registration_status`. */
export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled'
  | 'removed';

/** Attendance value (BR-ATT-03). DB enum `attendance_status`. Set by batch 1D. */
export type AttendanceStatus = 'attended' | 'no_show' | 'excused';

/**
 * Public identity of an occurrence (BR-EVT-04): the event and the ORIGINAL local date of the occurrence,
 * in the event's time zone. It stays valid before and after materialization.
 */
export type OccurrenceKey = { eventId: string; date: LocalDate };

/** A saved place (BR-EVT-08). */
export type Venue = {
  id: string;
  name: string;
  address: string;
  municipalityId: string;
  location: GeoPoint;
  isPrivate: boolean;
  createdById: string | null;
  createdAt: Date;
};

/** Input of `VenueRepository.createVenue`. */
export type CreateVenueInput = {
  name: string;
  address: string;
  municipalityId: string;
  location: GeoPoint;
  isPrivate?: boolean;
};

/** Patch of `VenueRepository.updateVenue`. Only the given fields change. */
export type UpdateVenuePatch = Partial<CreateVenueInput>;

/** Input of `VenueRepository.searchVenues`. */
export type SearchVenuesInput = {
  near?: { point: GeoPoint; radiusMeters: number };
  query?: string;
  limit?: number;
};

/** Recurrence of an event (BR-EVT-02). `until` and `count` are exclusive. */
export type EventRecurrenceInput = {
  rule: string;
  until?: LocalDate;
  count?: number;
};

/** Input of `EventRepository.createEvent`. */
export type CreateEventInput = {
  sportId: string;
  title: string;
  description?: string;
  skillLevelMinId: string;
  skillLevelMaxId: string;
  adultsOnly?: boolean;
  minParticipants?: number;
  maxParticipants: number;
  ownerCountsTowardCapacity?: boolean;
  registrationMode?: RegistrationMode;
  visibility?: EventVisibility;
  circlePriorityHours?: number;
  circleIds?: string[];
  communityId?: string;
  venueId?: string;
  address?: string;
  municipalityId?: string;
  location?: GeoPoint;
  locationHidden?: boolean;
  startDate: LocalDate;
  startTime: string;
  durationMinutes: number;
  recurrence?: EventRecurrenceInput;
};

/**
 * Patch of `EventRepository.updateEvent`. Only the given fields change.
 * `recurrence: null` turns the event into a one-off event (not allowed with `fromDate`).
 */
export type UpdateEventPatch = {
  title?: string;
  description?: string | null;
  sportId?: string;
  skillLevelMinId?: string;
  skillLevelMaxId?: string;
  adultsOnly?: boolean;
  minParticipants?: number | null;
  maxParticipants?: number;
  registrationMode?: RegistrationMode;
  visibility?: EventVisibility;
  circlePriorityHours?: number | null;
  communityId?: string | null;
  venueId?: string | null;
  address?: string;
  municipalityId?: string;
  location?: GeoPoint;
  locationHidden?: boolean;
  startDate?: LocalDate;
  startTime?: string;
  durationMinutes?: number;
  recurrence?: EventRecurrenceInput | null;
};

/**
 * Scope of an edit (BR-EVT-04, BR-EVT-05): the whole series, one occurrence date, or this date and the following ones.
 */
export type UpdateEventScope =
  'series' | { occurrenceDate: LocalDate } | { fromDate: LocalDate };

/** Outcome of `EventRepository.updateEvent` (BR-EVT-06, BR-EVT-07). */
export type UpdateEventOutcome = {
  /** Active registrants of the affected upcoming occurrences, without the actor. */
  affectedUserIds: string[];
  /** True when the change counts as significant (BR-EVT-07). */
  significantChange: boolean;
};

/** Outcome of cancellations (BR-EVT-25). */
export type CancelOutcome = {
  /** Active registrants of the cancelled upcoming occurrences. */
  affectedUserIds: string[];
};

/** Outcome of a change that can free spots (BR-REG-04). */
export type PromotionOutcome = {
  /** Users promoted from the waitlist; notify them. */
  promotedUserIds: string[];
};

/** Filters of `EventRepository.searchOccurrences` (BR-EVT-03, BR-EVT-23). */
export type SearchOccurrencesFilters = {
  /** First local date of the range, inclusive. The range is at most 31 days (inclusive). */
  from: LocalDate;
  /** Last local date of the range, inclusive. */
  to: LocalDate;
  /** Keep occurrences whose displayed location is within the radius of the point. */
  near?: { point: GeoPoint; radiusMeters: number };
  sportIds?: string[];
  /** Keep events whose level range contains this level. */
  skillLevelId?: string;
  /** Keep occurrences with at least one free spot. */
  hasFreeSpots?: boolean;
  /** Text matched against event titles (at least 2 characters). */
  text?: string;
};

/** One occurrence in a search result or a list. */
export type OccurrenceSummary = {
  key: OccurrenceKey;
  eventId: string;
  title: string;
  sport: { id: string; code: string; name: string };
  startsAt: Date;
  durationMinutes: number;
  /** Displayed location: the exact point, or the municipality center when hidden (BR-EVT-09). */
  location: GeoPoint;
  locationIsApproximate: boolean;
  municipality: { id: string; name: string };
  /** Distance from the search point to the displayed location, null without a search point. */
  distanceMeters: number | null;
  maxParticipants: number;
  takenSpots: number;
  freeSpots: number;
  waitlistCount: number;
  registrationMode: RegistrationMode;
  visibility: EventVisibility;
  adultsOnly: boolean;
  levelRange: { minCode: string; maxCode: string };
  /** False while the occurrence is virtual (no row yet, BR-EVT-03). */
  isMaterialized: boolean;
};

/** Full view of one occurrence (`EventRepository.getOccurrence`). */
export type OccurrenceDetails = OccurrenceSummary & {
  description: string | null;
  /** Text address, or null when the location is hidden from the viewer (BR-EVT-09). */
  address: string | null;
  minParticipants: number | null;
  /** `null` when the owner's account was erased without a co-organizer to take over ("deleted user", BR-GDP-04). */
  owner: { id: string; username: string } | null;
  coOrganizers: {
    id: string;
    username: string;
    countsTowardCapacity: boolean;
  }[];
  community: { id: string; name: string } | null;
  status: OccurrenceStatus;
  viewerRole: 'owner' | 'co_organizer' | null;
  viewerRegistration: {
    id: string;
    status: RegistrationStatus;
    guestCount: number;
  } | null;
  /** Number of pending approvals, for organizers only; null for everyone else. */
  pendingCount: number | null;
};

/** An active registration of the viewer on an upcoming occurrence. */
export type MyUpcomingRegistration = {
  registrationId: string;
  status: RegistrationStatus;
  occurrence: OccurrenceKey;
  startsAt: Date;
  durationMinutes: number;
  title: string;
  guestCount: number;
};

/** An event the viewer owns or co-organizes, drafts included. */
export type MyOrganizedEvent = {
  eventId: string;
  title: string;
  status: EventStatus;
  role: 'owner' | 'co_organizer';
  /** Next occurrence that is not cancelled, or null. */
  next: { date: LocalDate; startsAt: Date } | null;
};

/** A registration of the viewer on a past occurrence. */
export type MyPastRegistration = {
  registrationId: string;
  status: RegistrationStatus;
  occurrence: OccurrenceKey;
  startsAt: Date;
  durationMinutes: number;
  title: string;
  attendance: AttendanceStatus | null;
};

/** Outcome of `RegistrationRepository.register`. */
export type RegistrationOutcome = {
  registrationId: string;
  status: 'confirmed' | 'pending_approval' | 'waitlisted';
};

/** Outcome of `RegistrationRepository.cancelRegistration` (BR-REG-04, BR-REG-06). */
export type CancelRegistrationOutcome = PromotionOutcome & {
  /** Cancelled less than 24 hours before the start, without a significant change (BR-REG-06). */
  wasLate: boolean;
};

/** A confirmed participant, as listed to viewers. */
export type Participant = {
  userId: string | null;
  username: string | null;
  avatarPath: string | null;
  isOrganizer: boolean;
  guestCount: number;
  /** Guest names, for organizers only; null for everyone else. */
  guestNames: string[] | null;
};

/** A waitlisted or pending registration, as listed to organizers. */
export type RegistrationQueueEntry = {
  registrationId: string;
  userId: string | null;
  username: string | null;
  avatarPath: string | null;
  guestCount: number;
  createdAt: Date;
};
