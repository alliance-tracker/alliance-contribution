-- Config-only seed: default activity_types + scoring_tiers for a FRESH D1 database. Roster,
-- aliases, events, and participations are entered in-app, not seeded. Snapshotted from the live
-- database 2026-08-24 (original defaults: docs/specs/02_scoring.md); editable in-app from here on.
--
-- activity_types ids (referenced by scoring_tiers' foreign key) are assigned explicitly in
-- insertion order rather than relying on SQLite's implicit rowid behavior.
--
-- Assumes it runs once against a fresh, migrated D1; it is NOT idempotent against an
-- already-seeded database (start from a clean DB in dev if re-seeding).
--
-- Usage: npm run seed:local  (or seed:remote)

INSERT INTO activity_types (id, key, name, unit_label, weight, max_instance, min_value, active, sort, color) VALUES
  (1, 'bear_trap', 'Bear Trap', 'Damage', 1, 2, 0, 1, 1, 'blue'),
  (2, 'contribution', 'Alliance Contribution', 'Contribution', 1, 1, 0, 1, 2, 'green'),
  (3, 'mobilization', 'Alliance Mobilization', 'Personal Points', 2, 1, 0, 1, 3, 'violet'),
  (4, 'alliance_championship', 'Alliance Championship', 'Appearance', 1, 1, 0, 1, 0, 'slate'),
  (5, 'castle_battle', 'Castle Battle', 'Points', 3, 1, 0, 1, 0, 'red'),
  (6, 'kvk_prep', 'KvK Prep', 'Points', 6, 1, 0, 1, 0, 'red'),
  (7, 'kvk_battle', 'KvK Battle', 'Points', 3, 1, 0, 1, 0, 'red'),
  (8, 'triumph', 'Triumph', 'points', 1, 1, 0, 1, 0, 'sky'),
  (9, 'alliance_brawl', 'Alliance Brawl', 'points', 1, 1, 0, 1, 0, 'pink'),
  (10, 'swordland', 'Swordland', 'points', 3, 2, 0, 1, 0, 'green');

INSERT INTO scoring_tiers (activity_type_id, min_value, points) VALUES
  (1, 0, 1),
  (2, 0, 0),
  (2, 20000, 1),
  (2, 60000, 2),
  (2, 120000, 3),
  (3, 0, 0),
  (3, 2000, 1),
  (3, 5000, 2),
  (3, 10000, 3),
  (4, 0, 1),
  (5, 0, 1),
  (6, 0, 1),
  (7, 0, 1),
  (8, 500, 1),
  (8, 5000, 2),
  (8, 10000, 3),
  (9, 1000000, 1),
  (9, 1700000, 2),
  (9, 2500000, 3),
  (9, 3900000, 4),
  (9, 6000000, 5),
  (10, 0, 1);
