/** Versioned policy document (BR-GDP-01). DB enum `policy_document`. */
export type PolicyDocument = 'terms_of_service' | 'privacy_policy';

/** Status of a data export request (BR-GDP-07). DB enum `export_status`. */
export type ExportStatus =
  'pending' | 'processing' | 'ready' | 'failed' | 'expired';

/** A published version of a policy (BR-GDP-01). */
export type PolicyVersion = {
  id: string;
  document: PolicyDocument;
  version: string;
  url: string;
  publishedAt: Date;
};

/** A consent purpose (reference data, BR-GDP-01, BR-TECH-12). */
export type ConsentPurpose = {
  id: string;
  code: string;
  name: string;
  isRequired: boolean;
};

/** Current state of one consent purpose for a user (the latest row of the append-only history). */
export type ConsentState = {
  purposeCode: string;
  isRequired: boolean;
  /** `null` when the user never answered. */
  granted: boolean | null;
  answeredAt: Date | null;
  /** Policy version accepted, for the terms of service and the privacy policy. */
  policyVersion: string | null;
  /**
   * For a required purpose: true when it is granted for the current version of its document. Ask the user again when
   * false. Always true for an optional purpose.
   */
  upToDate: boolean;
};

/** One row of the consent history (BR-GDP-01). */
export type ConsentRecord = {
  purposeCode: string;
  granted: boolean;
  policyVersion: string | null;
  createdAt: Date;
};

/** A data export request (BR-GDP-07). */
export type DataExportRequest = {
  id: string;
  status: ExportStatus;
  requestedAt: Date;
  completedAt: Date | null;
  /** End of the download link (7 days after completion). */
  expiresAt: Date | null;
  /** Path of the file on the server disk, while it exists. */
  filePath: string | null;
};

/** An export to build, claimed by the developers' export worker (BR-GDP-07). */
export type ClaimedExport = { requestId: string; userId: string };

/** An account inactive for 12 months, to warn by email (BR-GDP-08). Never log the email. */
export type InactiveAccount = {
  userId: string;
  email: string;
  firstName: string;
};

/** Outcome of an account erasure (BR-GDP-03, BR-GDP-04): who to notify. */
export type ErasureOutcome = {
  userId: string;
  /** Users promoted from waitlists because the erased user's places were freed (BR-REG-04). */
  promotedUserIds: string[];
  /** Upcoming sessions cancelled because the erased owner had no co-organizer, with their active registrants. */
  cancelledOccurrences: {
    occurrenceId: string;
    eventId: string;
    participantUserIds: string[];
  }[];
  /** Events handed over to their oldest co-organizer. */
  transferredEvents: { eventId: string; newOwnerId: string }[];
};
