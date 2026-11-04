import type { AttendanceStatus } from './event.types';

/** Dispute status (BR-ATT-02). DB enum `dispute_status`. */
export type DisputeStatus = 'open' | 'upheld' | 'rejected';

/** Outcome of `AttendanceRepository.startDueOccurrences` (BR-EVT-26). */
export type StartDueOutcome = {
  /** Occurrences that became `ongoing` in this run. */
  startedOccurrenceIds: string[];
};

/** One occurrence completed by `completeDueOccurrences` (BR-EVT-26). */
export type CompletedOccurrence = {
  occurrenceId: string;
  eventId: string;
  /** Confirmed registrants with a user id, to notify (for example to invite them to give cheers later). */
  participantUserIds: string[];
};

/** Outcome of `AttendanceRepository.completeDueOccurrences` (BR-EVT-26, BR-ATT-01, BR-REG-05). */
export type CompleteDueOutcome = {
  completed: CompletedOccurrence[];
};

/** Outcome of `AttendanceRepository.completeOccurrence` (BR-EVT-26). */
export type CompleteOccurrenceOutcome = {
  /** Confirmed registrants with a user id, to notify. */
  participantUserIds: string[];
};

/** One confirmed registration of an occurrence, with its attendance and dispute (BR-ATT-01, BR-ATT-02). */
export type AttendanceEntry = {
  registrationId: string;
  /** NULL after erasure of the account (BR-GDP-04). */
  userId: string | null;
  username: string | null;
  /** NULL until the attendance is set or the occurrence is completed (BR-ATT-01). */
  attendance: AttendanceStatus | null;
  /** Number of guests of the registration (BR-REG-05). */
  guestCount: number;
  disputeStatus: DisputeStatus | null;
};

/** Outcome of `AttendanceRepository.openDispute` (BR-ATT-02). */
export type OpenDisputeOutcome = {
  disputeId: string;
};

/** Outcome of `AttendanceRepository.resolveDispute` (BR-ATT-02). */
export type ResolveDisputeOutcome = {
  /** The participant, to notify. NULL after erasure of the account. */
  userId: string | null;
};

/** An open dispute, as read by moderators (BR-ATT-02). */
export type OpenDisputeEntry = {
  disputeId: string;
  reason: string;
  createdAt: Date;
  registrationId: string;
  /** The disputing participant; NULL after erasure of the account. */
  user: { id: string; username: string } | null;
  occurrence: {
    id: string;
    eventId: string;
    title: string;
    startsAt: Date;
  };
  /** The organizer who declared the no-show; NULL when no organizer set it. */
  setBy: { id: string; username: string } | null;
};
