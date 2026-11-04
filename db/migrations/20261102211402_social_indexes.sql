-- migrate:up
-- Indexes on the circle and community foreign keys missing from batch 1B (review fix).
-- The partial unique indexes on (circle_id, invitee_id) and (community_id, user_id) do not cover these
-- columns for foreign key checks and cascades, so plain btree indexes are added.

CREATE INDEX ix_circle_invitation_circle_id ON circle_invitation (circle_id);
CREATE INDEX ix_community_join_request_community_id ON community_join_request (community_id);

COMMENT ON INDEX ix_circle_invitation_circle_id IS 'Foreign key index: invitations of a circle (cascade on circle deletion, BR-SOC-06).';
COMMENT ON INDEX ix_community_join_request_community_id IS 'Foreign key index: join requests of a community (cascade on community deletion, BR-SOC-09).';

-- migrate:down
DROP INDEX ix_community_join_request_community_id;
DROP INDEX ix_circle_invitation_circle_id;
