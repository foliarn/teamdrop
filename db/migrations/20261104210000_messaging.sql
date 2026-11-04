-- migrate:up
-- Messaging (batch 2): conversations of occurrences, circles and communities, messages, replies, reactions and read
-- state (BR-MSG-01, BR-MSG-02, BR-MSG-03, BR-MSG-06, BR-TECH-08). Direct conversations and attachments are
-- PENDING-TEAM (BR-MSG-04, BR-MSG-07) and are not built.
-- Who may read and post is derived at query time by the data layer from circle_member, community_member, the event's
-- organizers and the active registrations; conversation_member only holds per-user state (read pointer, mute).

CREATE TYPE conversation_kind AS ENUM ('occurrence', 'circle', 'community');

-- ---------------------------------------------------------------------------
-- conversation
-- ---------------------------------------------------------------------------
CREATE TABLE conversation (
  id uuid NOT NULL DEFAULT uuidv7(),
  kind conversation_kind NOT NULL,
  occurrence_id uuid NULL,
  circle_id uuid NULL,
  community_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_conversation PRIMARY KEY (id),
  CONSTRAINT uq_conversation_occurrence_id UNIQUE (occurrence_id),
  CONSTRAINT uq_conversation_circle_id UNIQUE (circle_id),
  CONSTRAINT uq_conversation_community_id UNIQUE (community_id),
  CONSTRAINT fk_conversation_occurrence_id FOREIGN KEY (occurrence_id)
    REFERENCES event_occurrence (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_circle_id FOREIGN KEY (circle_id)
    REFERENCES circle (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_community_id FOREIGN KEY (community_id)
    REFERENCES community (id) ON DELETE CASCADE,
  CONSTRAINT ck_conversation_one_target CHECK (num_nonnulls(occurrence_id, circle_id, community_id) = 1),
  CONSTRAINT ck_conversation_kind_target CHECK (
    (kind = 'occurrence') = (occurrence_id IS NOT NULL)
    AND (kind = 'circle') = (circle_id IS NOT NULL)
    AND (kind = 'community') = (community_id IS NOT NULL)
  )
);

COMMENT ON TABLE conversation IS 'A chat attached to exactly one occurrence, circle or community (BR-MSG-01).';
COMMENT ON COLUMN conversation.id IS 'Primary key, UUID v7.';
COMMENT ON COLUMN conversation.kind IS 'occurrence, circle or community; must match the target column that is set (BR-MSG-01).';
COMMENT ON COLUMN conversation.occurrence_id IS 'Occurrence of an occurrence chat, created on first need (BR-EVT-03, BR-MSG-01). Purged 1 year after the occurrence (BR-MSG-05).';
COMMENT ON COLUMN conversation.circle_id IS 'Circle of a circle chat, created with the circle (BR-SOC-08, BR-MSG-01). Deleted with the circle (BR-MSG-06).';
COMMENT ON COLUMN conversation.community_id IS 'Community of a community chat, created with the community (BR-SOC-09, BR-MSG-01). Deleted with the community (BR-MSG-06).';
COMMENT ON COLUMN conversation.created_at IS 'When the conversation was created.';

-- Every circle and community has its own chat (BR-SOC-08, BR-SOC-09): created by trigger, so that every writer
-- (data layer, dataset generator, SQL scripts) gets it.
CREATE FUNCTION create_circle_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO conversation (kind, circle_id) VALUES ('circle', NEW.id);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION create_circle_conversation() IS 'Creates the chat of a new circle (BR-SOC-08, BR-MSG-01).';

CREATE FUNCTION create_community_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO conversation (kind, community_id) VALUES ('community', NEW.id);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION create_community_conversation() IS 'Creates the chat of a new community (BR-SOC-09, BR-MSG-01).';

CREATE TRIGGER trg_circle_create_conversation
  AFTER INSERT ON circle
  FOR EACH ROW EXECUTE FUNCTION create_circle_conversation();

CREATE TRIGGER trg_community_create_conversation
  AFTER INSERT ON community
  FOR EACH ROW EXECUTE FUNCTION create_community_conversation();

-- Backfill: one conversation for each existing circle and community.
INSERT INTO conversation (kind, circle_id, created_at)
SELECT 'circle', c.id, c.created_at FROM circle c;

INSERT INTO conversation (kind, community_id, created_at)
SELECT 'community', c.id, c.created_at FROM community c;

-- ---------------------------------------------------------------------------
-- message
-- ---------------------------------------------------------------------------
CREATE TABLE message (
  id uuid NOT NULL DEFAULT uuidv7(),
  conversation_id uuid NOT NULL,
  sender_id uuid NULL,
  client_message_id uuid NOT NULL,
  reply_to_message_id uuid NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NULL,
  CONSTRAINT pk_message PRIMARY KEY (id),
  CONSTRAINT uq_message_sender_client_message_id UNIQUE (sender_id, client_message_id),
  CONSTRAINT fk_message_conversation_id FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_sender_id FOREIGN KEY (sender_id)
    REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_message_reply_to_message_id FOREIGN KEY (reply_to_message_id)
    REFERENCES message (id) ON DELETE SET NULL,
  CONSTRAINT ck_message_body_not_blank CHECK (body ~ '[^[:space:]]'),
  CONSTRAINT ck_message_body_max_length CHECK (char_length(body) <= 4000),
  CONSTRAINT ck_message_not_reply_to_self CHECK (reply_to_message_id IS NULL OR reply_to_message_id <> id)
);

CREATE INDEX ix_message_conversation_id_id ON message (conversation_id, id);
CREATE INDEX ix_message_sender_id ON message (sender_id);
CREATE INDEX ix_message_reply_to_message_id ON message (reply_to_message_id);

COMMENT ON TABLE message IS 'A chat message. Hard deleted when removed (BR-MSG-02, BR-MSG-03).';
COMMENT ON COLUMN message.id IS 'Primary key, UUID v7: time-ordered, used for ordering, pagination and read pointers (BR-TECH-08).';
COMMENT ON COLUMN message.conversation_id IS 'The conversation the message belongs to (BR-MSG-01).';
COMMENT ON COLUMN message.sender_id IS 'Author; NULL after erasure, shown as "deleted user" (BR-GDP-04).';
COMMENT ON COLUMN message.client_message_id IS 'Id generated by the client, unique per sender: a re-sent message is deduplicated (BR-TECH-08).';
COMMENT ON COLUMN message.reply_to_message_id IS 'Message this one replies to, in the same conversation; NULL when the target was deleted (BR-MSG-02).';
COMMENT ON COLUMN message.body IS 'Text of the message: not blank, at most 4000 characters (BR-MSG-02). Never logged.';
COMMENT ON COLUMN message.created_at IS 'When the message was sent.';
COMMENT ON COLUMN message.edited_at IS 'When the author last edited the message, NULL if never edited (BR-MSG-02).';

-- ---------------------------------------------------------------------------
-- conversation_member
-- ---------------------------------------------------------------------------
CREATE TABLE conversation_member (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_message_id uuid NULL,
  muted boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_conversation_member PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_conversation_member_conversation_id FOREIGN KEY (conversation_id)
    REFERENCES conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_member_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_member_last_read_message_id FOREIGN KEY (last_read_message_id)
    REFERENCES message (id) ON DELETE SET NULL
);

CREATE INDEX ix_conversation_member_user_id ON conversation_member (user_id);
CREATE INDEX ix_conversation_member_last_read_message_id ON conversation_member (last_read_message_id);

COMMENT ON TABLE conversation_member IS 'Per-user state in a conversation: read pointer and mute. Access itself is derived from circles, communities, organizers and registrations (BR-MSG-01, BR-MSG-02).';
COMMENT ON COLUMN conversation_member.conversation_id IS 'The conversation.';
COMMENT ON COLUMN conversation_member.user_id IS 'The user.';
COMMENT ON COLUMN conversation_member.last_read_message_id IS 'Last message read by the user; gives unread counts and "seen by" (BR-MSG-02).';
COMMENT ON COLUMN conversation_member.muted IS 'When true, the user gets no push for this conversation but still sees unread counts (BR-NOT-01).';
COMMENT ON COLUMN conversation_member.joined_at IS 'When the row was created (first read or mute).';

-- ---------------------------------------------------------------------------
-- message_reaction
-- ---------------------------------------------------------------------------
CREATE TABLE message_reaction (
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_message_reaction PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT fk_message_reaction_message_id FOREIGN KEY (message_id)
    REFERENCES message (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reaction_user_id FOREIGN KEY (user_id)
    REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT ck_message_reaction_emoji CHECK (
    emoji IN ('thumbs_up', 'thumbs_down', 'laugh', 'surprised', 'angry', 'smile', 'heart')
  )
);

CREATE INDEX ix_message_reaction_user_id ON message_reaction (user_id);

COMMENT ON TABLE message_reaction IS 'A reaction of a user to a message (BR-MSG-02).';
COMMENT ON COLUMN message_reaction.message_id IS 'The message; reactions are deleted with it (BR-MSG-03).';
COMMENT ON COLUMN message_reaction.user_id IS 'The user who reacted.';
COMMENT ON COLUMN message_reaction.emoji IS 'Reaction code from the fixed list: thumbs_up, thumbs_down, laugh, surprised, angry, smile, heart. The front end shows the glyph (BR-MSG-02, BR-TECH-12).';
COMMENT ON COLUMN message_reaction.created_at IS 'When the reaction was added.';

-- migrate:down
DROP TABLE message_reaction;
DROP TABLE conversation_member;
DROP TABLE message;
DROP TRIGGER trg_community_create_conversation ON community;
DROP TRIGGER trg_circle_create_conversation ON circle;
DROP FUNCTION create_community_conversation();
DROP FUNCTION create_circle_conversation();
DROP TABLE conversation;
DROP TYPE conversation_kind;
