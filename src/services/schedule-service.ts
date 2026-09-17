import {
  DEFAULT_NOTIFY_LANGUAGES,
  LANGUAGE_NAMES,
  type AiConfig,
  type DiscordRole,
  type DiscordWebhook,
  type EventNotification,
  type MessageTemplate,
  type NotificationInput,
  type ScheduleEventInput,
  type ScheduleLanguages,
  type ScheduleUnit,
  type ScheduledEventWithNotifications,
} from "../../shared/types";
import { usageSnapshot, utcDay } from "../domain/screenshot";
import { isSnowflake, nextOccurrence, parseLanguageList, parseWebhookUrl, placeholdersMatch } from "../domain/schedule";
import type {
  EventRow,
  LastSentRow,
  NotificationRow,
  ScheduleRepo,
  TemplateRow,
  TranslationRow,
  WebhookRow,
} from "../repositories/schedule-repo";
import type { SettingsRepo } from "../repositories/settings-repo";
import type { AiChatOutput } from "./screenshot-service";

/** Routes map this to 400. */
export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleValidationError";
  }
}

/** "exhausted" → 429, "read_failed" → 502. Same two outcomes the screenshot reader has. */
export class ScheduleAiError extends Error {
  constructor(public readonly code: "exhausted" | "read_failed") {
    super(code);
    this.name = "ScheduleAiError";
  }
}

const LANGUAGES_KEY = "notify_languages";
const LNG_RE = /^[a-z]{2}$/;

export type TextRunner = (prompt: string) => Promise<AiChatOutput>;
type UsageRepo = { get(day: string): Promise<{ neurons: number; requests: number }>; add(day: string, neurons: number): Promise<void> };
/** Built per request by the route (the AI binding lives on env, not on the composition root). */
export type TranslateAi = { run: TextRunner; usage: UsageRepo; cfg: AiConfig };

type EnvLike = { NOTIFY_LANGUAGES?: string };

export class ScheduleService {
  constructor(
    private readonly repo: ScheduleRepo,
    private readonly settings: SettingsRepo,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- languages -----------------------------------------------------------
  /** settings row → `NOTIFY_LANGUAGES` var → code default. A malformed var is ignored, not obeyed. */
  async getLanguages(env: EnvLike): Promise<ScheduleLanguages> {
    const stored = await this.settings.get(LANGUAGES_KEY);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((c) => typeof c === "string" && LNG_RE.test(c))) {
          return { languages: parsed as string[], source: "settings" };
        }
      } catch {
        // fall through to env/default: a hand-edited settings row must not break every post
      }
    }
    const fromEnv = parseLanguageList(env.NOTIFY_LANGUAGES);
    if (fromEnv) return { languages: fromEnv, source: "env" };
    return { languages: [...DEFAULT_NOTIFY_LANGUAGES], source: "default" };
  }

  async setLanguages(input: { languages?: unknown }): Promise<ScheduleLanguages> {
    const { languages } = input;
    if (!Array.isArray(languages) || languages.length === 0) {
      throw new ScheduleValidationError("languages must be a non-empty array");
    }
    if (!languages.every((c) => typeof c === "string" && LNG_RE.test(c))) {
      throw new ScheduleValidationError("each language must be a two-letter code");
    }
    if (new Set(languages).size !== languages.length) throw new ScheduleValidationError("languages must be unique");
    if (!languages.includes("en")) throw new ScheduleValidationError("languages must include en");
    await this.settings.set(LANGUAGES_KEY, JSON.stringify(languages));
    return { languages: languages as string[], source: "settings" };
  }

  // ---- status --------------------------------------------------------------
  async status(): Promise<{ last_run: string | null }> {
    return { last_run: await this.settings.get("notify_last_run") };
  }

  // ---- webhooks ------------------------------------------------------------
  async webhooks(): Promise<DiscordWebhook[]> {
    return (await this.repo.webhooks()).map(toWebhook);
  }

  /** Verifies against Discord before inserting: a typo'd token would otherwise only surface as a
   *  silently failed reminder days later. The GET posts no message. */
  async createWebhook(input: { name?: unknown; url?: unknown; webhook_id?: unknown; token?: unknown }): Promise<DiscordWebhook> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name === "") throw new ScheduleValidationError("name is required");

    let webhookId: string;
    let token: string;
    if (typeof input.url === "string" && input.url.trim() !== "") {
      const parsed = parseWebhookUrl(input.url);
      if (!parsed) throw new ScheduleValidationError("not a Discord webhook URL");
      webhookId = parsed.webhook_id;
      token = parsed.token;
    } else {
      if (!isSnowflake(input.webhook_id)) throw new ScheduleValidationError("webhook_id must be a Discord snowflake");
      if (typeof input.token !== "string" || input.token.trim() === "") {
        throw new ScheduleValidationError("token is required");
      }
      webhookId = input.webhook_id;
      token = input.token.trim();
    }

    // Two failure modes, two messages: "could not reach" is the operator's network/runtime, "rejected"
    // is the webhook itself (Discord says why: Unknown Webhook, Invalid Webhook Token, ...).
    let res: Response;
    try {
      res = await this.fetchImpl(`https://discord.com/api/webhooks/${webhookId}/${token}`);
    } catch (err) {
      throw new ScheduleValidationError(`could not reach Discord: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = (await res.json().catch(() => ({}))) as { channel_id?: unknown; message?: unknown };
    if (!res.ok) {
      const why = typeof body.message === "string" ? body.message : `HTTP ${res.status}`;
      throw new ScheduleValidationError(`webhook rejected by Discord: ${why}`);
    }
    const channelId = typeof body.channel_id === "string" ? body.channel_id : null;

    const id = await this.repo.insertWebhook({ name, webhook_id: webhookId, token, channel_id: channelId });
    return toWebhook({ id, name, webhook_id: webhookId, token, channel_id: channelId });
  }

  async deleteWebhook(id: number): Promise<boolean> {
    return this.repo.deleteWebhook(id);
  }

  // ---- roles ---------------------------------------------------------------
  async roles(): Promise<DiscordRole[]> {
    return this.repo.roles();
  }

  async createRole(input: { name?: unknown; role_id?: unknown }): Promise<DiscordRole> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name === "") throw new ScheduleValidationError("name is required");
    if (!isSnowflake(input.role_id)) throw new ScheduleValidationError("role_id must be a Discord snowflake");
    const id = await this.repo.insertRole(name, input.role_id);
    return { id, name, role_id: input.role_id };
  }

  async deleteRole(id: number): Promise<boolean> {
    return this.repo.deleteRole(id);
  }

  // ---- templates -----------------------------------------------------------
  async templates(): Promise<MessageTemplate[]> {
    const [rows, translations] = await Promise.all([this.repo.templates(), this.repo.translations()]);
    return rows.map((row) => toTemplate(row, translations));
  }

  async createTemplate(input: { name?: unknown; texts?: unknown }): Promise<MessageTemplate> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name === "") throw new ScheduleValidationError("name is required");
    const texts = readTexts(input.texts);
    if (!texts.en || texts.en.trim() === "") throw new ScheduleValidationError("the English text is required");

    const id = await this.repo.insertTemplate(name);
    for (const [lng, text] of Object.entries(texts)) await this.repo.setTranslation(id, lng, text.trim());
    return this.requireTemplate(id);
  }

  async updateTemplate(id: number, input: { name?: unknown; texts?: unknown }): Promise<MessageTemplate | null> {
    if (!(await this.repo.template(id))) return null;
    if (input.name !== undefined) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (name === "") throw new ScheduleValidationError("name is required");
      await this.repo.renameTemplate(id, name);
    }
    if (input.texts !== undefined) {
      for (const [lng, text] of Object.entries(readTexts(input.texts))) {
        await this.repo.setTranslation(id, lng, text.trim());
      }
    }
    return this.requireTemplate(id);
  }

  /** The four seeded templates are the fallback rule's targets in the UI; deleting one is a 400, not a
   *  silent degradation. (A template an admin created can go — notifications fall back to default.) */
  async deleteTemplate(id: number): Promise<boolean> {
    const row = await this.repo.template(id);
    if (!row) return false;
    if (row.default_key !== null) throw new ScheduleValidationError("a default template cannot be deleted");
    return this.repo.deleteTemplate(id);
  }

  /** One text-only AI call per configured non-English language that has no text yet. Same daily neuron
   *  and request budget as the screenshot reader — this is the same free allowance. */
  async translate(templateId: number, languages: string[], ai: TranslateAi): Promise<MessageTemplate | null> {
    const template = await this.repo.template(templateId);
    if (!template) return null;
    const texts = textsFor(templateId, await this.repo.translations());
    const source = texts.en?.trim();
    if (!source) throw new ScheduleValidationError("the English text is required before translating");

    const missing = languages.filter((lng) => lng !== "en" && !texts[lng]?.trim());
    const now = this.now();
    const day = utcDay(now);

    for (const lng of missing) {
      const before = usageSnapshot(await ai.usage.get(day), now, ai.cfg);
      if (before.used + ai.cfg.reserveNeurons > before.limit || before.requests >= ai.cfg.dailyRequestCap) {
        throw new ScheduleAiError("exhausted");
      }

      let out: AiChatOutput;
      try {
        out = await ai.run(translatePrompt(source, lng));
      } catch {
        throw new ScheduleAiError("read_failed");
      }
      // Tally first: the neurons are spent whatever the answer looks like.
      const reported = Number(out.usage?.neurons);
      await ai.usage.add(day, Number.isFinite(reported) && reported > 0 ? reported : ai.cfg.neuronsPerRead);

      const candidate = (out.choices?.[0]?.message?.content ?? "").trim();
      // A translation that dropped or invented a placeholder is worse than none: leave the row empty
      // so the Messages tab still flags it and the admin can write it by hand.
      if (candidate !== "" && placeholdersMatch(source, candidate)) {
        await this.repo.setTranslation(templateId, lng, candidate);
      }
    }

    return this.requireTemplate(templateId);
  }

  private async requireTemplate(id: number): Promise<MessageTemplate> {
    const row = await this.repo.template(id);
    if (!row) throw new Error(`template ${id} vanished`);
    return toTemplate(row, await this.repo.translations());
  }

  // ---- events + notifications ----------------------------------------------
  async events(): Promise<ScheduledEventWithNotifications[]> {
    const [events, notifications, lastSent] = await Promise.all([
      this.repo.events(),
      this.repo.notifications(),
      this.repo.lastSentByNotification(),
    ]);
    const now = this.now();
    return events.map((row) => toEventWithNotifications(row, notifications, lastSent, now));
  }

  async createEvent(input: ScheduleEventInput): Promise<ScheduledEventWithNotifications> {
    const id = await this.repo.insertEvent(await this.validateEvent(input, null));
    return this.requireEvent(id);
  }

  async updateEvent(id: number, input: Partial<ScheduleEventInput>): Promise<ScheduledEventWithNotifications | null> {
    const existing = await this.repo.event(id);
    if (!existing) return null;
    await this.repo.updateEvent(id, await this.validateEvent(input, existing));
    return this.requireEvent(id);
  }

  async deleteEvent(id: number): Promise<boolean> {
    return this.repo.deleteEvent(id);
  }

  async createNotification(eventId: number, input: NotificationInput): Promise<EventNotification | null> {
    const event = await this.repo.event(eventId);
    if (!event) return null;
    const row = await this.validateNotification(input, event);
    const id = await this.repo.insertNotification({ ...row, event_id: eventId });
    return this.requireNotification(id);
  }

  async updateNotification(id: number, input: NotificationInput): Promise<EventNotification | null> {
    const existing = await this.repo.notification(id);
    if (!existing) return null;
    const event = await this.repo.event(existing.event_id);
    if (!event) return null;
    await this.repo.updateNotification(id, await this.validateNotification(input, event));
    return this.requireNotification(id);
  }

  async deleteNotification(id: number): Promise<boolean> {
    return this.repo.deleteNotification(id);
  }

  private async requireEvent(id: number): Promise<ScheduledEventWithNotifications> {
    const row = await this.repo.event(id);
    if (!row) throw new Error(`scheduled event ${id} vanished`);
    const [notifications, lastSent] = await Promise.all([this.repo.notifications(), this.repo.lastSentByNotification()]);
    return toEventWithNotifications(row, notifications, lastSent, this.now());
  }

  private async requireNotification(id: number): Promise<EventNotification> {
    const row = await this.repo.notification(id);
    if (!row) throw new Error(`notification ${id} vanished`);
    const lastSent = await this.repo.lastSentByNotification();
    return toNotification(row, lastSent);
  }

  /** `existing` non-null = PUT: unsupplied fields keep their stored value. */
  private async validateEvent(input: Partial<ScheduleEventInput>, existing: EventRow | null): Promise<Omit<EventRow, "id">> {
    const title = input.title !== undefined ? String(input.title ?? "").trim() : existing?.title ?? "";
    if (title === "") throw new ScheduleValidationError("title is required");

    const startsAt = input.starts_at !== undefined ? input.starts_at : existing?.starts_at;
    if (typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt))) {
      throw new ScheduleValidationError("starts_at must be an ISO 8601 timestamp");
    }

    const every = input.every !== undefined ? input.every : existing?.every;
    if (typeof every !== "number" || !Number.isInteger(every) || every < 1) {
      throw new ScheduleValidationError("every must be an integer >= 1");
    }

    const unit = input.unit !== undefined ? input.unit : existing?.unit;
    if (unit !== "day" && unit !== "week") throw new ScheduleValidationError("unit must be day or week");

    const duration = input.duration_minutes !== undefined ? input.duration_minutes : existing?.duration_minutes ?? null;
    if (duration !== null && duration !== undefined && (!Number.isInteger(duration) || duration <= 0)) {
      throw new ScheduleValidationError("duration_minutes must be a positive integer or null");
    }

    const activityTypeId = input.activity_type_id !== undefined ? input.activity_type_id : existing?.activity_type_id ?? null;
    if (activityTypeId !== null && activityTypeId !== undefined && !Number.isInteger(activityTypeId)) {
      throw new ScheduleValidationError("activity_type_id must be an integer or null");
    }

    const enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing ? existing.enabled === 1 : true;

    return {
      title,
      activity_type_id: activityTypeId ?? null,
      starts_at: new Date(startsAt).toISOString(),
      every,
      unit: unit as ScheduleUnit,
      duration_minutes: duration ?? null,
      enabled: enabled ? 1 : 0,
    };
  }

  private async validateNotification(input: NotificationInput, event: EventRow): Promise<Omit<NotificationRow, "id" | "event_id">> {
    if (!Number.isInteger(input.webhook_id) || !(await this.repo.webhook(input.webhook_id))) {
      throw new ScheduleValidationError("unknown webhook");
    }
    const templateId = input.template_id ?? null;
    if (templateId !== null) {
      if (!Number.isInteger(templateId) || !(await this.repo.template(templateId))) {
        throw new ScheduleValidationError("unknown template");
      }
    }
    if (!Array.isArray(input.role_ids) || !input.role_ids.every((id) => Number.isInteger(id))) {
      throw new ScheduleValidationError("role_ids must be an array of integers");
    }
    const known = new Set((await this.repo.roles()).map((r) => r.id));
    for (const id of input.role_ids) {
      if (!known.has(id)) throw new ScheduleValidationError(`unknown role ${id}`);
    }

    const minutes = input.minutes_before;
    if (typeof minutes !== "number" || !Number.isInteger(minutes)) {
      throw new ScheduleValidationError("minutes_before must be an integer");
    }
    // A negative offset fires DURING the event, so it needs an event that lasts, and it must land
    // before the end — a reminder after the event finished is noise.
    if (minutes < 0) {
      if (event.duration_minutes === null) {
        throw new ScheduleValidationError("minutes_before may only be negative on an event with a duration");
      }
      if (-minutes >= event.duration_minutes) {
        throw new ScheduleValidationError("minutes_before would fire after the event ends");
      }
    }

    return {
      webhook_id: input.webhook_id,
      template_id: templateId,
      role_ids: JSON.stringify([...new Set(input.role_ids)]),
      minutes_before: minutes,
    };
  }
}

// ---- row → API shape --------------------------------------------------------

function toWebhook(row: WebhookRow): DiscordWebhook {
  return { id: row.id, name: row.name, webhook_id: row.webhook_id, channel_id: row.channel_id, token_tail: row.token.slice(-4) };
}

export function textsFor(templateId: number, translations: TranslationRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of translations) if (t.template_id === templateId) out[t.lng] = t.text;
  return out;
}

function toTemplate(row: TemplateRow, translations: TranslationRow[]): MessageTemplate {
  return { id: row.id, name: row.name, is_default: row.default_key !== null, texts: textsFor(row.id, translations) };
}

function toNotification(row: NotificationRow, lastSent: LastSentRow[]): EventNotification {
  const last = lastSent.find((l) => l.notification_id === row.id);
  return {
    id: row.id,
    event_id: row.event_id,
    webhook_id: row.webhook_id,
    template_id: row.template_id,
    role_ids: parseRoleIds(row.role_ids),
    minutes_before: row.minutes_before,
    last_sent: last ? { at: last.sent_at, ok: last.ok === 1 } : null,
  };
}

export function parseRoleIds(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function toEventWithNotifications(
  row: EventRow,
  notifications: NotificationRow[],
  lastSent: LastSentRow[],
  now: Date,
): ScheduledEventWithNotifications {
  const event = {
    id: row.id,
    title: row.title,
    activity_type_id: row.activity_type_id,
    starts_at: row.starts_at,
    every: row.every,
    unit: row.unit,
    duration_minutes: row.duration_minutes,
    enabled: row.enabled === 1,
  };
  return {
    ...event,
    next_at: nextOccurrence(event, now)?.toISOString() ?? null,
    notifications: notifications.filter((n) => n.event_id === row.id).map((n) => toNotification(n, lastSent)),
  };
}

function readTexts(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ScheduleValidationError("texts must be an object");
  const out: Record<string, string> = {};
  for (const [lng, text] of Object.entries(raw as Record<string, unknown>)) {
    if (!LNG_RE.test(lng)) throw new ScheduleValidationError(`"${lng}" is not a two-letter language code`);
    if (typeof text !== "string") throw new ScheduleValidationError(`text for "${lng}" must be a string`);
    out[lng] = text;
  }
  return out;
}

function translatePrompt(source: string, lng: string): string {
  return [
    `Translate the following text to ${LANGUAGE_NAMES[lng] ?? lng} (ISO 639-1 code "${lng}").`,
    "It is a reminder posted to a Discord channel for a video-game alliance.",
    "Keep the placeholders {event}, {time} and {end} exactly as they are — do not translate or reword them.",
    "Reply with the translation only: no quotes, no notes, no explanation.",
    "",
    source,
  ].join("\n");
}
