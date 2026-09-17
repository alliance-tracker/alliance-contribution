-- Event scheduling + Discord notifications (2026-09-17 spec). Inert unless the deployment sets
-- SCHEDULER_ENABLED = "true" and a [triggers] cron: empty tables cost nothing, so the migration runs
-- everywhere. The four default templates ARE seeded here (not in seed/seed.sql) so existing
-- deployments get them by running migrations alone.

CREATE TABLE discord_webhooks (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,            -- "#announcements"
  webhook_id TEXT NOT NULL UNIQUE,     -- Discord snowflake
  token      TEXT NOT NULL,            -- secret; only its last 4 chars ever leave the Worker
  channel_id TEXT                      -- from Discord's webhook GET on save (display only)
);

CREATE TABLE discord_roles (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,               -- "R4", "Bear squad"
  role_id TEXT NOT NULL UNIQUE         -- Discord snowflake
);

-- default_key marks the four migration-seeded templates: it is what the "no template chosen" rule
-- looks up, and what makes the API's is_default true. NULL for anything an admin creates.
CREATE TABLE message_templates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  default_key TEXT UNIQUE              -- get_ready | almost_time | starting | ongoing, else NULL
);

CREATE TABLE message_translations (
  template_id INTEGER NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
  lng         TEXT NOT NULL,           -- ISO 639-1 code
  text        TEXT NOT NULL,           -- may contain {event}, {time}, {end}
  PRIMARY KEY (template_id, lng)
);

CREATE TABLE scheduled_events (
  id               INTEGER PRIMARY KEY,
  title            TEXT NOT NULL,
  activity_type_id INTEGER REFERENCES activity_types(id) ON DELETE SET NULL,
  starts_at        TEXT NOT NULL,      -- ISO 8601 UTC, first occurrence
  every            INTEGER NOT NULL CHECK (every >= 1),
  unit             TEXT NOT NULL CHECK (unit IN ('day','week')),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  enabled          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE event_notifications (
  id             INTEGER PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES scheduled_events(id) ON DELETE CASCADE,
  webhook_id     INTEGER NOT NULL REFERENCES discord_webhooks(id) ON DELETE CASCADE,
  template_id    INTEGER REFERENCES message_templates(id) ON DELETE SET NULL,
  role_ids       TEXT NOT NULL DEFAULT '[]',  -- JSON array of discord_roles.id
  minutes_before INTEGER NOT NULL             -- negative = minutes AFTER start (during the event)
);

-- Dedupe: the PK makes one post per (notification, occurrence). INSERT OR IGNORE is the lock, so a
-- cron overlap or a replayed tick cannot double-post. Operational, not config: excluded from backups.
CREATE TABLE notification_log (
  notification_id INTEGER NOT NULL REFERENCES event_notifications(id) ON DELETE CASCADE,
  occurrence_at   TEXT NOT NULL,       -- the event occurrence, not the fire time
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  ok              INTEGER NOT NULL,    -- 1 = Discord 2xx, 0 = failed (logged, never retried)
  PRIMARY KEY (notification_id, occurrence_at)
);

INSERT INTO message_templates (id, name, default_key) VALUES
  (1, 'Get ready', 'get_ready'),
  (2, 'Almost time', 'almost_time'),
  (3, 'Starting', 'starting'),
  (4, 'Ongoing', 'ongoing');

INSERT INTO message_translations (template_id, lng, text) VALUES
  (1, 'en', 'Get ready! {event} starts {time}.'),
  (1, 'es', '¡Prepárate! {event} empieza {time}.'),
  (1, 'fr', 'Préparez-vous ! {event} commence {time}.'),
  (1, 'de', 'Macht euch bereit! {event} beginnt {time}.'),
  (1, 'ko', '준비하세요! {event}이(가) {time} 시작됩니다.'),
  (1, 'ar', 'استعدوا! {event} يبدأ {time}.'),
  (2, 'en', '{event} starts {time}!'),
  (2, 'es', '¡{event} empieza {time}!'),
  (2, 'fr', '{event} commence {time} !'),
  (2, 'de', '{event} beginnt {time}!'),
  (2, 'ko', '{event}이(가) {time} 시작됩니다!'),
  (2, 'ar', '{event} يبدأ {time}!'),
  (3, 'en', '{event} is starting now!'),
  (3, 'es', '¡{event} está empezando!'),
  (3, 'fr', '{event} commence maintenant !'),
  (3, 'de', '{event} beginnt jetzt!'),
  (3, 'ko', '{event}이(가) 지금 시작됩니다!'),
  (3, 'ar', '{event} يبدأ الآن!'),
  (4, 'en', '{event} is live! Ends {end}.'),
  (4, 'es', '¡{event} está en curso! Termina {end}.'),
  (4, 'fr', '{event} est en cours ! Se termine {end}.'),
  (4, 'de', '{event} läuft! Endet {end}.'),
  (4, 'ko', '{event}이(가) 진행 중입니다! {end} 종료됩니다.'),
  (4, 'ar', '{event} جارٍ الآن! ينتهي {end}.');
