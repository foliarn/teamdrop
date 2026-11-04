-- Notification types (BR-NOT-01, BR-TECH-12), approved list of batches 2 and 3. One type per notification named by a rule.
-- Defaults apply to users without a preference row. Idempotent: existing rows are left unchanged, because the
-- back office may have edited them.
INSERT INTO notification_type (code, name, default_push, default_in_app) VALUES
  ('new_message', 'New message', true, false),                                      -- BR-MSG-02
  ('looking_for_players', 'Looking for players', true, true),                       -- BR-SOC-08
  ('event_updated', 'Event updated', true, true),                                   -- BR-EVT-06
  ('occurrence_cancelled', 'Session cancelled', true, true),                        -- BR-EVT-25
  ('waitlist_promoted', 'Promoted from the waitlist', true, true),                  -- BR-REG-04
  ('registration_approved', 'Registration approved', true, true),                   -- BR-REG-03
  ('registration_declined', 'Registration declined', true, true),                   -- BR-REG-03
  ('block_shared_occurrence', 'Blocked user in a shared session', false, true),     -- BR-SOC-03
  ('follow_request', 'Follow request', true, true),                                 -- BR-SOC-01
  ('new_follower', 'New follower', false, true),                                    -- BR-SOC-01
  ('circle_invitation', 'Circle invitation', true, true),                           -- BR-SOC-06
  ('community_join_decided', 'Community join request answered', false, true),       -- BR-SOC-09
  ('dispute_resolved', 'Dispute resolved', false, true),                            -- BR-ATT-02
  ('cheer_received', 'Cheer received', false, true)                                 -- BR-SOC-11
ON CONFLICT DO NOTHING;
