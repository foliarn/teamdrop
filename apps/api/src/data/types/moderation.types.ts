import type { Page } from './common.types';

/** Report status (BR-MOD-02). DB enum `report_status`. */
export type ReportStatus = 'open' | 'assigned' | 'resolved' | 'dismissed';

/** Sanction kind (BR-MOD-03). DB enum `sanction_kind`. */
export type SanctionKind =
  'warning' | 'temporary_ban' | 'permanent_ban' | 'content_removal';

/** A report reason (reference data, BR-MOD-01, BR-TECH-12). */
export type ReportReason = {
  id: string;
  /** Stable English code: branch on it, never on `name` (BR-TECH-12). */
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

/** Input of `createReportReason` (back office). */
export type CreateReportReasonInput = {
  code: string;
  name: string;
  sortOrder: number;
  isActive?: boolean;
};

/** Patch of `updateReportReason` (back office). Missing fields are unchanged. */
export type UpdateReportReasonPatch = Partial<CreateReportReasonInput>;

/** What a report is filed against: exactly one target (BR-MOD-01). */
export type ReportTargetInput =
  { userId: string } | { eventId: string } | { messageId: string };

/** Input of `ReportRepository.createReport` (BR-MOD-01). */
export type CreateReportInput = {
  reasonCode: string;
  target: ReportTargetInput;
  /** Optional free text from the reporter. */
  details?: string;
};

/**
 * Target of a stored report. `removed` when the target was erased or deleted after the report was filed: the report is
 * kept without it (BR-GDP-04).
 */
export type ReportTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'message'; messageId: string }
  | { kind: 'removed' };

/** A report in the moderators' queue (BR-MOD-02). */
export type ReportSummary = {
  id: string;
  reasonCode: string;
  target: ReportTarget;
  status: ReportStatus;
  /** `null` after erasure of the reporter (BR-GDP-04). */
  reporterId: string | null;
  assignedModeratorId: string | null;
  createdAt: Date;
  assignedAt: Date | null;
  closedAt: Date | null;
};

/** Summary of the reported content, for moderators only. */
export type ReportTargetDetails =
  | { kind: 'user'; userId: string; username: string }
  | {
      kind: 'event';
      eventId: string;
      title: string;
      /** `null` when the owner's account was erased (BR-GDP-04). */
      ownerId: string | null;
    }
  | {
      kind: 'message';
      messageId: string;
      conversationId: string;
      /** `null` for a deleted user. */
      senderId: string | null;
      senderUsername: string | null;
      /** Shown to moderators only. Never log it. */
      body: string;
      createdAt: Date;
    }
  | { kind: 'removed' };

/** A report with its content, for moderators (BR-MOD-02). */
export type ReportDetails = ReportSummary & {
  details: string | null;
  resolutionNote: string | null;
  targetDetails: ReportTargetDetails;
};

/** A report as listed to the user who filed it. */
export type MyReport = {
  id: string;
  reasonCode: string;
  targetKind: ReportTarget['kind'];
  status: ReportStatus;
  createdAt: Date;
  closedAt: Date | null;
};

/** Filters of `ReportRepository.listReports`. */
export type ListReportsFilter = {
  status?: ReportStatus | ReportStatus[];
  assignedModeratorId?: string;
};

/** Input of `SanctionRepository.issueSanction` (BR-MOD-03). */
export type IssueSanctionInput = {
  userId: string;
  kind: 'warning' | 'temporary_ban' | 'permanent_ban';
  reason: string;
  reportId?: string;
  /** Required for a temporary ban, in the future; refused for the other kinds (BR-MOD-03). */
  endsAt?: Date;
};

/** A sanction of a user (BR-MOD-03). */
export type Sanction = {
  id: string;
  userId: string;
  kind: SanctionKind;
  reason: string;
  reportId: string | null;
  /** `null` after erasure of the moderator. */
  issuedById: string | null;
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/** The ban in force on an account, if any (BR-MOD-03). The developers refuse the login. */
export type ActiveBan = {
  sanctionId: string;
  kind: 'temporary_ban' | 'permanent_ban';
  /** `null` for a permanent ban. */
  endsAt: Date | null;
};

/** Outcome of `SanctionRepository.removeMessage` (BR-MOD-03, BR-MSG-03). */
export type RemoveMessageOutcome = {
  conversationId: string;
  /** The `content_removal` sanction of the author, `null` when the author was erased. */
  sanctionId: string | null;
};

/** Stable codes of the audited actions (BR-MOD-05). */
export type AuditAction =
  | 'report.assigned'
  | 'report.resolved'
  | 'report.dismissed'
  | 'sanction.issued'
  | 'sanction.revoked'
  | 'message.removed'
  | 'dispute.resolved'
  | 'circle.invitation_rejected'
  | 'registration.removed'
  | 'user.role_changed'
  | 'reference.created'
  | 'reference.updated'
  | 'reference.deleted'
  | 'event.cancelled_by_moderator'
  | 'other';

/** Input of `AuditLogRepository.record` (BR-MOD-05). */
export type AuditEntryInput = {
  action: AuditAction;
  targetTable?: string;
  targetId?: string;
  reportId?: string;
  /** JSON object of ids and codes. Never emails, birth dates, tokens or message bodies. */
  details?: Record<string, unknown>;
};

/** An audit log entry (BR-MOD-05). */
export type AuditEntry = {
  id: string;
  /** `null` after erasure of the actor. */
  actorId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  reportId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
};

/** Filters of `AuditLogRepository.list`. */
export type ListAuditFilter = {
  actorId?: string;
  action?: AuditAction;
  targetTable?: string;
  targetId?: string;
  reportId?: string;
  from?: Date;
  to?: Date;
};

/** A page of audit entries. */
export type AuditPage = Page<AuditEntry>;
