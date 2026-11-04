/**
 * Base class of every error thrown by the data layer.
 * `code` is a stable string that developers switch on. Never parse `message`.
 */
export class DataError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

/** The requested row does not exist, or is not visible to the viewer. */
export class NotFoundError extends DataError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message);
  }
}

/** Unexpected database failure. Its details (SQL, parameters) are never exposed. */
export class InternalDataError extends DataError {
  constructor() {
    super('INTERNAL', 'Unexpected data error');
  }
}

/** The username is already used by another account (case-insensitive, BR-ACC-02). */
export class UsernameTakenError extends DataError {
  constructor(message = 'Username is already taken') {
    super('USERNAME_TAKEN', message);
  }
}

/** The email is already used by another account (BR-ACC-04). */
export class EmailTakenError extends DataError {
  constructor(message = 'Email is already taken') {
    super('EMAIL_TAKEN', message);
  }
}

/** A Google sign-up uses an email that already belongs to an account; no merge is done (BR-ACC-06). */
export class EmailBelongsToExistingAccountError extends DataError {
  constructor(message = 'Email belongs to an existing account') {
    super('EMAIL_BELONGS_TO_EXISTING_ACCOUNT', message);
  }
}

/** The user is younger than the minimum age on the creation date, Europe/Paris (BR-ACC-03). */
export class UnderMinimumAgeError extends DataError {
  constructor(message = 'Under the minimum age') {
    super('UNDER_MINIMUM_AGE', message);
  }
}

/** A reference id (municipality, sport, skill level, rating system or rating grade) does not exist. */
export class InvalidReferenceError extends DataError {
  constructor(message = 'Unknown reference') {
    super('INVALID_REFERENCE', message);
  }
}

/** The Google subject, or the Google identity of the user, is already linked (BR-ACC-05). */
export class GoogleAlreadyLinkedError extends DataError {
  constructor(message = 'Google identity is already linked') {
    super('GOOGLE_ALREADY_LINKED', message);
  }
}

/** The change would remove the user's only login method (BR-ACC-05). */
export class LastLoginMethodError extends DataError {
  constructor(message = 'Cannot remove the last login method') {
    super('LAST_LOGIN_METHOD', message);
  }
}

/** The token is unknown, expired or already used. */
export class InvalidTokenError extends DataError {
  constructor(message = 'Invalid token') {
    super('INVALID_TOKEN', message);
  }
}

/** A revoked or already rotated refresh token was presented: the whole family was revoked (BR-ACC-07, BR-TECH-11). */
export class RefreshTokenReuseError extends DataError {
  constructor(message = 'Refresh token reuse detected') {
    super('REFRESH_TOKEN_REUSE', message);
  }
}

/** The slots of one user overlap (BR-ACC-12). */
export class OverlappingSlotsError extends DataError {
  constructor(message = 'Availability slots overlap') {
    super('OVERLAPPING_SLOTS', message);
  }
}

/** An availability slot is invalid: day outside 1..7 or end not after start (BR-ACC-12). */
export class InvalidSlotError extends DataError {
  constructor(message = 'Invalid availability slot') {
    super('INVALID_SLOT', message);
  }
}

/** A rating does not match its rating system (BR-ACC-11). */
export class InvalidRatingError extends DataError {
  constructor(message = 'Invalid rating') {
    super('INVALID_RATING', message);
  }
}

/** An input value is invalid, or it violates a uniqueness or check constraint of a reference table. */
export class InvalidInputError extends DataError {
  constructor(message = 'Invalid input') {
    super('INVALID_INPUT', message);
  }
}

/** The action targets the acting user themself (follow, block, invite). Rules: BR-SOC-01, BR-SOC-02, BR-SOC-06. */
export class SelfActionError extends DataError {
  constructor(message = 'Action on oneself is not allowed') {
    super('SELF_ACTION', message);
  }
}

/** The two users are blocked in one direction or the other (BR-SOC-02). */
export class BlockedError extends DataError {
  constructor(message = 'Users are blocked') {
    super('BLOCKED', message);
  }
}

/** The user is already a member of the circle or community. */
export class AlreadyMemberError extends DataError {
  constructor(message = 'Already a member') {
    super('ALREADY_MEMBER', message);
  }
}

/** The user is not a member of the circle or community. */
export class NotMemberError extends DataError {
  constructor(message = 'Not a member') {
    super('NOT_MEMBER', message);
  }
}

/** The invitee's circle invitation setting refuses this inviter (BR-ACC-15, BR-SOC-06). */
export class InvitePolicyError extends DataError {
  constructor(message = 'The invitee does not accept this invitation') {
    super('INVITE_POLICY', message);
  }
}

/** A pending invitation already exists for this circle and invitee (BR-SOC-06). */
export class InvitationAlreadyPendingError extends DataError {
  constructor(message = 'An invitation is already pending') {
    super('INVITATION_ALREADY_PENDING', message);
  }
}

/** A pending join request already exists for this user and community (BR-SOC-09). */
export class JoinRequestAlreadyPendingError extends DataError {
  constructor(message = 'A join request is already pending') {
    super('JOIN_REQUEST_ALREADY_PENDING', message);
  }
}

/** The row is not in a state that allows the transition (e.g. an invitation already answered). */
export class InvalidStateError extends DataError {
  constructor(message = 'Invalid state for this action') {
    super('INVALID_STATE', message);
  }
}

/** The owner cannot be removed or demoted; ownership must be transferred first (BR-SOC-05, BR-SOC-09). */
export class OwnerCannotBeRemovedError extends DataError {
  constructor(message = 'The owner cannot be removed') {
    super('OWNER_CANNOT_BE_REMOVED', message);
  }
}

/** The recurrence rule is outside the supported subset (BR-EVT-02). */
export class InvalidRecurrenceError extends DataError {
  constructor(message = 'Invalid recurrence rule') {
    super('INVALID_RECURRENCE', message);
  }
}

/** The event is not published, or the occurrence is cancelled, ongoing, completed, or starts in the past (BR-EVT-24, BR-REG-01). */
export class OccurrenceNotOpenError extends DataError {
  constructor(message = 'The occurrence is not open for registration') {
    super('OCCURRENCE_NOT_OPEN', message);
  }
}

/** The event is adults only and the user is a minor (BR-EVT-11). */
export class AdultsOnlyError extends DataError {
  constructor(message = 'The event is for adults only') {
    super('ADULTS_ONLY', message);
  }
}

/** The event is not visible to the viewer: visibility rules or blocking apply (BR-EVT-23, BR-SOC-02). */
export class NotVisibleError extends DataError {
  constructor(message = 'The event is not visible') {
    super('NOT_VISIBLE', message);
  }
}

/** The user already holds an active registration for this occurrence (BR-REG-02). */
export class AlreadyRegisteredError extends DataError {
  constructor(message = 'Already registered for this occurrence') {
    super('ALREADY_REGISTERED', message);
  }
}

/** Not enough free spots for the registration, including its guests (BR-REG-04, BR-REG-05). */
export class OccurrenceFullError extends DataError {
  constructor(message = 'The occurrence is full') {
    super('OCCURRENCE_FULL', message);
  }
}

/** The new capacity is below the confirmed spots already taken (BR-EVT-06). */
export class CapacityBelowConfirmedError extends DataError {
  constructor(message = 'Capacity is below the confirmed spots') {
    super('CAPACITY_BELOW_CONFIRMED', message);
  }
}

/** The user is not a co-organizer of the event (BR-EVT-20). */
export class NotCoOrganizerError extends DataError {
  constructor(message = 'Not a co-organizer of this event') {
    super('NOT_CO_ORGANIZER', message);
  }
}

/** Attendance can only be set from the start until one hour after the end of the occurrence (BR-ATT-01). */
export class AttendanceWindowClosedError extends DataError {
  constructor(message = 'The attendance window is closed') {
    super('ATTENDANCE_WINDOW_CLOSED', message);
  }
}

/** A no-show can be disputed only until seven days after the end of the occurrence (BR-ATT-02). */
export class DisputeWindowClosedError extends DataError {
  constructor(message = 'The dispute window is closed') {
    super('DISPUTE_WINDOW_CLOSED', message);
  }
}

/** The registration already has a dispute: one dispute per registration (BR-ATT-02). */
export class DisputeAlreadyExistsError extends DataError {
  constructor(message = 'A dispute already exists for this registration') {
    super('DISPUTE_ALREADY_EXISTS', message);
  }
}
