-- Official rating systems and the ordered grades of the graded one (BR-ACC-11). Idempotent.
INSERT INTO rating_system (sport_id, code, name, value_kind, min_value, max_value) VALUES
  ((SELECT id FROM sport WHERE code = 'chess'), 'fide_elo', 'FIDE Elo', 'numeric', 0, 3500),
  ((SELECT id FROM sport WHERE code = 'tennis'), 'fft_ranking', 'French tennis ranking (FFT)', 'graded', NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO rating_grade (rating_system_id, code, rank)
SELECT rs.id, g.code, g.rank
FROM rating_system rs
CROSS JOIN (VALUES
  ('NC', 1), ('40', 2), ('30/5', 3), ('30/4', 4), ('30/3', 5), ('30/2', 6), ('30/1', 7), ('30', 8),
  ('15/5', 9), ('15/4', 10), ('15/3', 11), ('15/2', 12), ('15/1', 13), ('15', 14),
  ('5/6', 15), ('4/6', 16), ('3/6', 17), ('2/6', 18), ('1/6', 19), ('0', 20),
  ('-2/6', 21), ('-4/6', 22), ('-15', 23), ('-30', 24)
) AS g(code, rank)
WHERE rs.code = 'fft_ranking'
ON CONFLICT DO NOTHING;
