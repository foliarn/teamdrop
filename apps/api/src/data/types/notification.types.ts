/** A notification type (reference data, BR-NOT-01, BR-TECH-12). */
export type NotificationType = {
  id: string;
  /** Stable English code: branch on it, never on `name` (BR-TECH-12). */
  code: string;
  name: string;
  defaultPush: boolean;
  defaultInApp: boolean;
};

/** Input of `NotificationRepository.createNotificationType` (back office). */
export type CreateNotificationTypeInput = {
  code: string;
  name: string;
  defaultPush: boolean;
  defaultInApp: boolean;
};

/** Patch of `NotificationRepository.updateNotificationType` (back office). Missing fields are unchanged. */
export type UpdateNotificationTypePatch = Partial<CreateNotificationTypeInput>;

/**
 * Payload of a notification: a JSON object of ids needed to display it (event, occurrence, user, conversation).
 * Never put emails, birth dates, tokens or message bodies in it.
 */
export type NotificationPayload = Record<string, unknown>;

/** A Web Push target: one device of a recipient (BR-NOT-01). Never log these values. */
export type PushTarget = {
  userId: string;
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  authSecret: string;
};

/** Outcome of `NotificationRepository.notify` (BR-NOT-01). */
export type NotifyOutcome = {
  /** Ids of the in-app notifications created. */
  notificationIds: string[];
  /** Users who got an in-app notification (in-app channel enabled). */
  inAppUserIds: string[];
  /** Devices to push to (push channel enabled). The developers send the push. */
  pushTargets: PushTarget[];
};

/** An in-app notification of the user (BR-NOT-01). */
export type AppNotification = {
  id: string;
  typeCode: string;
  payload: NotificationPayload;
  createdAt: Date;
  /** `null` while unread. */
  readAt: Date | null;
};

/** Effective preference of a user for one notification type (BR-NOT-01, BR-ACC-15). */
export type NotificationPreference = {
  typeCode: string;
  typeName: string;
  push: boolean;
  inApp: boolean;
  /** True when the user has no override: the values are the type defaults. */
  isDefault: boolean;
};

/** Patch of `setPreference`. A missing field keeps its current effective value. */
export type NotificationPreferencePatch = { push?: boolean; inApp?: boolean };

/** Input of `savePushSubscription`: the browser's `PushSubscription` (BR-NOT-01). */
export type SavePushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  authSecret: string;
  userAgent?: string;
};

/** A device of the user, for the settings screen. Keys are never returned here. */
export type MyPushSubscription = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};
