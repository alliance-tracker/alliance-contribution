-- Day 4 is KvK Prep's Training day, not day 3 (day 3 has no focus). Swap existing bookings and the
-- per-day config between days 3 and 4 so each stays with its theme.
-- Row-by-row UNIQUE (day, position, slot) and the CHECKs rule out an in-place swap, so stage via a copy.
CREATE TABLE kvk_swap AS SELECT * FROM kvk_appointments WHERE day IN (3, 4);
DELETE FROM kvk_appointments WHERE day IN (3, 4);
INSERT INTO kvk_appointments (id, day, position, slot, key_id, player_id, player_name, created_by, updated_at)
  SELECT id, 7 - day, position, slot, key_id, player_id, player_name, created_by, updated_at FROM kvk_swap;
DROP TABLE kvk_swap;

UPDATE settings
   SET value = json_set(value, '$[2]', json(value -> '$[3]'), '$[3]', json(value -> '$[2]'))
 WHERE key = 'kvk_days' AND json_valid(value) AND json_array_length(value) = 5;
