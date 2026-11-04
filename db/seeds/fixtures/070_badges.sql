-- Dev fixtures: badge groundwork (batch 4, BR-GAM-01, BR-GAM-02). The real badges are not defined yet (DEFERRED):
-- this example, with a dev_ code, only lets the front end show a badge with tiers and an unseen unlock.
-- Dev data only. Idempotent. Ids: ...000000001bNN.
BEGIN;

INSERT INTO badge (id, code, name, description, category, sort_order) VALUES
  ('00000000-0000-7000-8000-000000001b01', 'dev_example_regular', 'Regular (dev example)',
   'Dev-only example: attend sessions.', 'sessions', 1)
ON CONFLICT DO NOTHING;

INSERT INTO badge_tier (id, badge_id, tier_rank, name, threshold) VALUES
  ('00000000-0000-7000-8000-000000001b11', '00000000-0000-7000-8000-000000001b01', 1, 'Bronze', 1),
  ('00000000-0000-7000-8000-000000001b12', '00000000-0000-7000-8000-000000001b01', 2, 'Silver', 10)
ON CONFLICT DO NOTHING;

-- alice holds the bronze level and has not seen it yet.
INSERT INTO user_badge (user_id, badge_id, badge_tier_id, unlocked_at) VALUES
  ('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000001b01',
   '00000000-0000-7000-8000-000000001b11', now() - interval '6 days')
ON CONFLICT DO NOTHING;

COMMIT;
