-- migrate:up
-- Notifications (batch 2): notification types (reference), per-type and per-channel preferences, in-app
-- notifications and Web Push subscriptions (BR-NOT-01, BR-ACC-15, BR-TECH-12). Push sending is done by the developers.

-- ---------------------------------------------------------------------------
-- notification_type (reference)
-- ---------------------------------------------------------------------------
CREATE TABLE notification_type (
  id uuid NOT NULL DEFAULT uuidv7(),
  code text NOT NULL,
  name text NOT NULL,
  default_push boolean NOT NULL,
  default_in_app boolean NOT NULL,
  CONSTRAINT pk_notification_type PRIMARY KEY (id),
  CONSTRAINT uq_notification_type_code UNIQUE (code)
);

COMMENT ON TABLE notification_type IS 'Reference list of notification types, managed from the back office (BR-NOT-01, BR-TECH-12).';
COMMENT ON COLUMN notification_type.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN notification_type.code IS 'Stable English code used by the code and the front end i18n files (BR-TECH-12).';
COMMENT ON COLUMN notification_type.name IS 'English name, shown until the front end has a translation (BR-TECH-12).';
COMMENT ON COLUMN notification_type.default_push IS 'Push channel value for users without a preference row (BR-NOT-01).';
COMMENT ON COLUMN notification_type.default_in_app IS 'In-app channel value for users without a preference row (BR-NOT-01).';

-- ---------------------------------------------------------------------------
-- notification_preference
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preference (
  user_id uuid NOT NULL,
  notification_type_id uuid NOT NULL,
  push_enabled boolean NOT NULL,
  in_app_enabled boolean NOT NULL,
  CONSTRAINT pk_notification_preference PRIMARY KEY (user_id, notification_type_id),
  CONSTRAINT fk_notification_preference_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_preference_notification_type_id FOREIGN KEY (notification_type_id)
    REFERENCES notification_type (id) ON DELETE RESTRICT
);

CREATE INDEX ix_notification_preference_notification_type_id ON notification_preference (notification_type_id);

COMMENT ON TABLE notification_preference IS 'A user override of the defaults of one notification type, per channel. No row means the type defaults (BR-NOT-01, BR-ACC-15).';
COMMENT ON COLUMN notification_preference.user_id IS 'The user.';
COMMENT ON COLUMN notification_preference.notification_type_id IS 'The notification type; a type in use cannot be deleted.';
COMMENT ON COLUMN notification_preference.push_enabled IS 'Whether the user wants push notifications of this type (BR-NOT-01).';
COMMENT ON COLUMN notification_preference.in_app_enabled IS 'Whether the user wants in-app notifications of this type (BR-NOT-01).';

-- ---------------------------------------------------------------------------
-- notification
-- ---------------------------------------------------------------------------
CREATE TABLE notification (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  notification_type_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  CONSTRAINT pk_notification PRIMARY KEY (id),
  CONSTRAINT fk_notification_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_notification_type_id FOREIGN KEY (notification_type_id)
    REFERENCES notification_type (id) ON DELETE RESTRICT,
  CONSTRAINT ck_notification_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX ix_notification_user_id_id ON notification (user_id, id);
CREATE INDEX ix_notification_unread ON notification (user_id) WHERE read_at IS NULL;
CREATE INDEX ix_notification_created_at ON notification (created_at);
CREATE INDEX ix_notification_notification_type_id ON notification (notification_type_id);

COMMENT ON TABLE notification IS 'An in-app notification, kept 90 days (BR-NOT-01, BR-GDP-09).';
COMMENT ON COLUMN notification.id IS 'Primary key, UUID v7 (time-ordered, used for pagination).';
COMMENT ON COLUMN notification.user_id IS 'The recipient.';
COMMENT ON COLUMN notification.notification_type_id IS 'The notification type (BR-NOT-01).';
COMMENT ON COLUMN notification.payload IS 'JSON object of ids needed to display the notification (event, occurrence, user, conversation). Never emails, birth dates, tokens or message bodies.';
COMMENT ON COLUMN notification.created_at IS 'When the notification was created; purged after 90 days (BR-GDP-09).';
COMMENT ON COLUMN notification.read_at IS 'When the user read it, NULL while unread.';

-- ---------------------------------------------------------------------------
-- push_subscription
-- ---------------------------------------------------------------------------
CREATE TABLE push_subscription (
  id uuid NOT NULL DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  CONSTRAINT pk_push_subscription PRIMARY KEY (id),
  CONSTRAINT uq_push_subscription_endpoint UNIQUE (endpoint),
  CONSTRAINT fk_push_subscription_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE
);

CREATE INDEX ix_push_subscription_user_id ON push_subscription (user_id);

COMMENT ON TABLE push_subscription IS 'A Web Push subscription, one per device (unique endpoint) (BR-NOT-01).';
COMMENT ON COLUMN push_subscription.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN push_subscription.user_id IS 'The user currently logged in on the device.';
COMMENT ON COLUMN push_subscription.endpoint IS 'Push service URL of the device, unique: a device has one subscription (BR-NOT-01).';
COMMENT ON COLUMN push_subscription.p256dh IS 'Public key of the browser, used to encrypt the payload (Web Push).';
COMMENT ON COLUMN push_subscription.auth_secret IS 'Authentication secret of the browser (Web Push). Never logged.';
COMMENT ON COLUMN push_subscription.user_agent IS 'Optional browser description, to name the device in the settings.';
COMMENT ON COLUMN push_subscription.created_at IS 'When the subscription was saved.';
COMMENT ON COLUMN push_subscription.last_used_at IS 'When a push was last sent to it, NULL if never.';

-- migrate:down
DROP TABLE push_subscription;
DROP TABLE notification;
DROP TABLE notification_preference;
DROP TABLE notification_type;
