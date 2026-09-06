-- Workers AI daily tally (screenshot reads). One row per UTC day. Not domain config: no seed, no UI,
-- excluded from backups (src/domain/backup.ts).
CREATE TABLE ai_usage (
  day      TEXT    PRIMARY KEY,
  neurons  REAL    NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0
);
