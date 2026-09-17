import type { ScheduleUnit } from "../../shared/types";
import { all, first, run } from "./db";

// Stored rows for the six scheduling config tables plus notification_log. `role_ids` is JSON text and
// `enabled` an INTEGER — both are converted in the service, not here.

export type WebhookRow = { id: number; name: string; webhook_id: string; token: string; channel_id: string | null };
export type RoleRow = { id: number; name: string; role_id: string };
export type TemplateRow = { id: number; name: string; default_key: string | null };
export type TranslationRow = { template_id: number; lng: string; text: string };
export type EventRow = {
  id: number;
  title: string;
  activity_type_id: number | null;
  starts_at: string;
  every: number;
  unit: ScheduleUnit;
  duration_minutes: number | null;
  enabled: number;
};
export type NotificationRow = {
  id: number;
  event_id: number;
  webhook_id: number;
  template_id: number | null;
  role_ids: string;
  minutes_before: number;
};
export type LastSentRow = { notification_id: number; sent_at: string; ok: number };

export type NewEvent = Omit<EventRow, "id">;
export type NewNotification = Omit<NotificationRow, "id">;

export class ScheduleRepo {
  constructor(private readonly db: D1Database) {}

  // ---- discord_webhooks ----------------------------------------------------
  // The token is selected too: only the service decides what reaches the SPA.
  webhooks(): Promise<WebhookRow[]> {
    return all<WebhookRow>(this.db, "SELECT * FROM discord_webhooks ORDER BY id");
  }

  webhook(id: number): Promise<WebhookRow | null> {
    return first<WebhookRow>(this.db, "SELECT * FROM discord_webhooks WHERE id = ?", id);
  }

  async insertWebhook(w: Omit<WebhookRow, "id">): Promise<number> {
    const result = await run(
      this.db,
      "INSERT INTO discord_webhooks (name, webhook_id, token, channel_id) VALUES (?, ?, ?, ?)",
      w.name,
      w.webhook_id,
      w.token,
      w.channel_id,
    );
    return result.meta.last_row_id;
  }

  async deleteWebhook(id: number): Promise<boolean> {
    return (await run(this.db, "DELETE FROM discord_webhooks WHERE id = ?", id)).meta.changes > 0;
  }

  // ---- discord_roles -------------------------------------------------------
  roles(): Promise<RoleRow[]> {
    return all<RoleRow>(this.db, "SELECT * FROM discord_roles ORDER BY id");
  }

  async insertRole(name: string, roleId: string): Promise<number> {
    const result = await run(this.db, "INSERT INTO discord_roles (name, role_id) VALUES (?, ?)", name, roleId);
    return result.meta.last_row_id;
  }

  async deleteRole(id: number): Promise<boolean> {
    return (await run(this.db, "DELETE FROM discord_roles WHERE id = ?", id)).meta.changes > 0;
  }

  // ---- message_templates + message_translations ----------------------------
  templates(): Promise<TemplateRow[]> {
    return all<TemplateRow>(this.db, "SELECT * FROM message_templates ORDER BY id");
  }

  template(id: number): Promise<TemplateRow | null> {
    return first<TemplateRow>(this.db, "SELECT * FROM message_templates WHERE id = ?", id);
  }

  translations(): Promise<TranslationRow[]> {
    return all<TranslationRow>(this.db, "SELECT * FROM message_translations ORDER BY template_id, lng");
  }

  async insertTemplate(name: string): Promise<number> {
    // default_key stays NULL: only the migration seeds the four templates the fallback rule names.
    const result = await run(this.db, "INSERT INTO message_templates (name) VALUES (?)", name);
    return result.meta.last_row_id;
  }

  async renameTemplate(id: number, name: string): Promise<void> {
    await run(this.db, "UPDATE message_templates SET name = ? WHERE id = ?", name, id);
  }

  async deleteTemplate(id: number): Promise<boolean> {
    return (await run(this.db, "DELETE FROM message_templates WHERE id = ?", id)).meta.changes > 0;
  }

  async setTranslation(templateId: number, lng: string, text: string): Promise<void> {
    if (text === "") {
      await run(this.db, "DELETE FROM message_translations WHERE template_id = ? AND lng = ?", templateId, lng);
      return;
    }
    await run(
      this.db,
      "INSERT INTO message_translations (template_id, lng, text) VALUES (?, ?, ?) " +
        "ON CONFLICT(template_id, lng) DO UPDATE SET text = excluded.text",
      templateId,
      lng,
      text,
    );
  }

  // ---- scheduled_events ----------------------------------------------------
  events(): Promise<EventRow[]> {
    return all<EventRow>(this.db, "SELECT * FROM scheduled_events ORDER BY id");
  }

  event(id: number): Promise<EventRow | null> {
    return first<EventRow>(this.db, "SELECT * FROM scheduled_events WHERE id = ?", id);
  }

  async insertEvent(e: NewEvent): Promise<number> {
    const result = await run(
      this.db,
      "INSERT INTO scheduled_events (title, activity_type_id, starts_at, every, unit, duration_minutes, enabled) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      e.title,
      e.activity_type_id,
      e.starts_at,
      e.every,
      e.unit,
      e.duration_minutes,
      e.enabled,
    );
    return result.meta.last_row_id;
  }

  async updateEvent(id: number, e: NewEvent): Promise<void> {
    await run(
      this.db,
      "UPDATE scheduled_events SET title = ?, activity_type_id = ?, starts_at = ?, every = ?, unit = ?, " +
        "duration_minutes = ?, enabled = ? WHERE id = ?",
      e.title,
      e.activity_type_id,
      e.starts_at,
      e.every,
      e.unit,
      e.duration_minutes,
      e.enabled,
      id,
    );
  }

  async deleteEvent(id: number): Promise<boolean> {
    return (await run(this.db, "DELETE FROM scheduled_events WHERE id = ?", id)).meta.changes > 0;
  }

  // ---- event_notifications -------------------------------------------------
  notifications(): Promise<NotificationRow[]> {
    return all<NotificationRow>(this.db, "SELECT * FROM event_notifications ORDER BY id");
  }

  notification(id: number): Promise<NotificationRow | null> {
    return first<NotificationRow>(this.db, "SELECT * FROM event_notifications WHERE id = ?", id);
  }

  async insertNotification(n: NewNotification): Promise<number> {
    const result = await run(
      this.db,
      "INSERT INTO event_notifications (event_id, webhook_id, template_id, role_ids, minutes_before) VALUES (?, ?, ?, ?, ?)",
      n.event_id,
      n.webhook_id,
      n.template_id,
      n.role_ids,
      n.minutes_before,
    );
    return result.meta.last_row_id;
  }

  async updateNotification(id: number, n: Omit<NewNotification, "event_id">): Promise<void> {
    await run(
      this.db,
      "UPDATE event_notifications SET webhook_id = ?, template_id = ?, role_ids = ?, minutes_before = ? WHERE id = ?",
      n.webhook_id,
      n.template_id,
      n.role_ids,
      n.minutes_before,
      id,
    );
  }

  async deleteNotification(id: number): Promise<boolean> {
    return (await run(this.db, "DELETE FROM event_notifications WHERE id = ?", id)).meta.changes > 0;
  }

  // ---- notification_log ----------------------------------------------------
  /** The insert IS the lock: the (notification_id, occurrence_at) PK makes a second claim a no-op, so
   *  an overlapping cron tick cannot double-post. Returns false when someone else already claimed it. */
  async claimFire(notificationId: number, occurrenceAtIso: string): Promise<boolean> {
    const result = await run(
      this.db,
      "INSERT OR IGNORE INTO notification_log (notification_id, occurrence_at, ok) VALUES (?, ?, 0)",
      notificationId,
      occurrenceAtIso,
    );
    return result.meta.changes > 0;
  }

  async markSent(notificationId: number, occurrenceAtIso: string): Promise<void> {
    await run(
      this.db,
      "UPDATE notification_log SET ok = 1 WHERE notification_id = ? AND occurrence_at = ?",
      notificationId,
      occurrenceAtIso,
    );
  }

  /** Latest log row per notification — the "last sent" shown next to each notification in the UI. */
  lastSentByNotification(): Promise<LastSentRow[]> {
    return all<LastSentRow>(
      this.db,
      `SELECT notification_id, sent_at, ok FROM notification_log l
       WHERE sent_at = (SELECT MAX(sent_at) FROM notification_log WHERE notification_id = l.notification_id)
       GROUP BY notification_id`,
    );
  }
}
