import { LANGUAGE_FLAGS, TEMPLATE_PLACEHOLDERS, type ScheduleUnit } from "../../shared/types";

// Pure scheduling maths + message rendering. No D1, no fetch, no Date.now().

const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;
/** Discord's hard limit is 2000 characters; leave room for the ellipsis. */
const MAX_CONTENT = 1990;
/** Safety valve on occurrencesBetween: a caller asking for a decade of every-minute events is a bug. */
const MAX_OCCURRENCES = 1000;

export type Recurrence = {
  starts_at: string;
  every: number;
  unit: ScheduleUnit;
  enabled: boolean;
};

/** All occurrences are UTC instants derived from the anchor, so DST never shifts one. */
function stepMs(ev: Pick<Recurrence, "every" | "unit">): number {
  return ev.every * (ev.unit === "week" ? WEEK_MS : DAY_MS);
}

function anchor(ev: Recurrence): number | null {
  const start = Date.parse(ev.starts_at);
  if (!Number.isFinite(start)) return null;
  return stepMs(ev) > 0 ? start : null;
}

/** First occurrence at or after `now`. null when the event is disabled or its recurrence is unusable. */
export function nextOccurrence(ev: Recurrence, now: Date): Date | null {
  if (!ev.enabled) return null;
  const start = anchor(ev);
  if (start === null) return null;
  const t = now.getTime();
  if (start >= t) return new Date(start);
  const step = stepMs(ev);
  return new Date(start + Math.ceil((t - start) / step) * step);
}

/** Occurrences with `from <= t < to`. Ignores `enabled` — callers filter events, this is pure maths. */
export function occurrencesBetween(ev: Recurrence, from: Date, to: Date): Date[] {
  const start = anchor(ev);
  if (start === null) return [];
  const step = stepMs(ev);
  const f = from.getTime();
  const t = to.getTime();
  const out: Date[] = [];
  const k = Math.max(0, Math.ceil((f - start) / step));
  for (let time = start + k * step; time < t && out.length < MAX_OCCURRENCES; time += step) {
    if (time >= f) out.push(new Date(time));
  }
  return out;
}

export type EventLike = Recurrence & { id: number };
export type NotificationLike = { event_id: number; minutes_before: number };
export type DueFire<N extends NotificationLike> = { notification: N; occurrence: Date };

/** Notifications whose fire time `f = occurrence − minutes_before` lands in `(now − window, now]`.
 *  A window wider than the cron period tolerates a skipped tick; the notification_log PK stops the
 *  resulting overlap from double-posting. The occurrence range is derived per notification, so a
 *  negative `minutes_before` (fire DURING the event) finds its occurrence just as well. */
export function dueFires<E extends EventLike, N extends NotificationLike>(
  events: E[],
  notifications: N[],
  now: Date,
  windowMs = 120_000,
): DueFire<N>[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const t = now.getTime();
  const out: DueFire<N>[] = [];
  for (const notification of notifications) {
    const ev = byId.get(notification.event_id);
    if (!ev || !ev.enabled) continue;
    const offset = notification.minutes_before * 60_000;
    const from = new Date(t - windowMs + offset + 1);
    const to = new Date(t + offset + 1);
    for (const occurrence of occurrencesBetween(ev, from, to)) {
      const fire = occurrence.getTime() - offset;
      if (t - windowMs < fire && fire <= t) out.push({ notification, occurrence });
    }
  }
  return out;
}

/** Discord renders `<t:UNIX:R>` as "in 15 minutes" in each reader's own locale and clock. */
function stamp(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

export type RenderInput = {
  languages: string[];
  texts: Record<string, string>;
  event: string;
  occurrence: Date;
  /** null = point event; `{end}` then renders identically to `{time}` rather than leaking a literal. */
  end: Date | null;
  roleSnowflakes: string[];
};

export function renderMessage(input: RenderInput): string {
  const time = stamp(input.occurrence);
  const end = input.end ? stamp(input.end) : time;

  const lines: string[] = [];
  if (input.roleSnowflakes.length > 0) {
    lines.push(input.roleSnowflakes.map((id) => `<@&${id}>`).join(" "));
  }
  for (const lng of input.languages) {
    const text = input.texts[lng];
    if (!text) continue; // language configured but not translated — skip, never a blank line
    const body = text.replaceAll("{event}", input.event).replaceAll("{time}", time).replaceAll("{end}", end);
    lines.push(`${LANGUAGE_FLAGS[lng] ?? `**${lng.toUpperCase()}**`} ${body}`);
  }

  const content = lines.join("\n");
  return content.length > MAX_CONTENT ? `${content.slice(0, MAX_CONTENT)}…` : content;
}

export type DefaultTemplateKey = "get_ready" | "almost_time" | "starting" | "ongoing";

/** Template picked when a notification names none. Order matters: negative first (fires after start). */
export function defaultTemplateKey(minutesBefore: number): DefaultTemplateKey {
  if (minutesBefore < 0) return "ongoing";
  if (minutesBefore === 0) return "starting";
  if (minutesBefore <= 5) return "almost_time";
  return "get_ready";
}

const TOKEN_RE = /\{[^{}]*\}/g;

/** A translation must carry every placeholder the English source used, and invent none. Guards against
 *  a model that "helpfully" localises `{time}` into `{tiempo}` or drops it entirely. */
export function placeholdersMatch(source: string, translated: string): boolean {
  const allowed = new Set<string>(TEMPLATE_PLACEHOLDERS.filter((p) => source.includes(p)));
  const found = new Set(translated.match(TOKEN_RE) ?? []);
  for (const p of allowed) if (!found.has(p)) return false;
  for (const f of found) if (!allowed.has(f)) return false;
  return true;
}

const WEBHOOK_URL_RE =
  /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{17,20})\/([A-Za-z0-9_.-]+)\/?$/;

/** Admins paste the whole webhook URL out of Discord rather than splitting it by hand. */
export function parseWebhookUrl(url: string): { webhook_id: string; token: string } | null {
  const m = WEBHOOK_URL_RE.exec(url.trim().split("?")[0]);
  return m ? { webhook_id: m[1], token: m[2] } : null;
}

/** Parses the `NOTIFY_LANGUAGES` var. Any malformed entry rejects the whole value (null → caller falls
 *  back to the default list) rather than silently posting in a subset the operator did not choose. */
export function parseLanguageList(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "");
  if (parts.length === 0 || !parts.every((p) => /^[a-z]{2}$/.test(p))) return null;
  const unique = [...new Set(parts)];
  return ["en", ...unique.filter((c) => c !== "en")]; // en is always present and always first
}

export function isSnowflake(s: unknown): s is string {
  return typeof s === "string" && /^\d{17,20}$/.test(s);
}
