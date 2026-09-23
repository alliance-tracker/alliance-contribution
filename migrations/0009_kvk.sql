CREATE TABLE kvk_access_keys (
  id             INTEGER PRIMARY KEY,
  alliance_name  TEXT NOT NULL,
  representative TEXT NOT NULL,
  color          TEXT NOT NULL,          -- hex from the 10-swatch palette
  key            TEXT NOT NULL UNIQUE,   -- 'kvk_' + 19 random base62 chars
  last_used_at   INTEGER,                -- epoch ms, throttled (see Auth)
  created_at     INTEGER NOT NULL
);

CREATE TABLE kvk_appointments (
  id          INTEGER PRIMARY KEY,
  day         INTEGER NOT NULL CHECK (day BETWEEN 1 AND 5),
  position    TEXT    NOT NULL CHECK (position IN ('chief_minister','noble_advisor')),
  slot        INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 47),
  key_id      INTEGER REFERENCES kvk_access_keys(id) ON DELETE SET NULL,
  player_id   TEXT    NOT NULL,          -- digits only
  player_name TEXT    NOT NULL,
  created_by  TEXT    NOT NULL,          -- 'admin' or the representative's name at creation
  updated_at  INTEGER NOT NULL,
  UNIQUE (day, position, slot)
);
