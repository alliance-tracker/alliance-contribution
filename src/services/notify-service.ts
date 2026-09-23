import type { ScheduleStatus } from "../../shared/types";
import { defaultTemplateKey, dueFires, nextOccurrence, renderMessage } from "../domain/schedule";
import type {
  EventRow,
  NotificationRow,
  RoleRow,
  ScheduleRepo,
  TemplateRow,
  TranslationRow,
  WebhookRow,
} from "../repositories/schedule-repo";
import type { SettingsRepo } from "../repositories/settings-repo";
import { ScheduleValidationError, parseRoleIds, textsFor } from "./schedule-service";

const LAST_RUN_KEY = "notify_last_run";
/** Rule order for the "no template chosen" fallback, walked from the computed key downwards. */
const FALLBACK_ORDER = ["ongoing", "starting", "almost_time", "get_ready"] as const;

type Config = {
  events: EventRow[];
  notifications: NotificationRow[];
  webhooks: WebhookRow[];
  roles: RoleRow[];
  templates: TemplateRow[];
  translations: TranslationRow[];
};

export class NotifyService {
  constructor(
    private readonly repo: ScheduleRepo,
    private readonly settings: SettingsRepo,
    // Wrapped, not `globalThis.fetch` itself: a bare reference called as `this.fetchImpl(...)` runs with
    // the service as `this` and workerd throws "Illegal invocation".
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async status(): Promise<ScheduleStatus> {
    return { last_run: await this.settings.get(LAST_RUN_KEY) };
  }

  /** Called once a minute by the cron trigger. Sequential on purpose: a handful of posts per minute at
   *  most, and Discord would rather not be hit in parallel anyway. Returns how many posts were tried.
   *  `now` is the cron's scheduledTime: Cloudflare starts a tick a few hundred ms BEFORE the minute, so
   *  the wall clock would find nothing due yet and every reminder would slip to the next tick. */
  async runDue(languagesResolver: () => Promise<string[]>, windowMs?: number, now = this.now()): Promise<number> {
    const config = await this.load();
    const due = dueFires(
      config.events.filter((e) => e.enabled === 1).map(toRecurrence),
      config.notifications,
      now,
      windowMs,
    );

    let sent = 0;
    if (due.length > 0) {
      const languages = await languagesResolver();
      for (const { notification, occurrence } of due) {
        const occurrenceAt = occurrence.toISOString();
        // Claim first: the log row IS the lock, so an overlapping tick skips instead of double-posting.
        if (!(await this.repo.claimFire(notification.id, occurrenceAt))) continue;
        sent++;
        if (await this.post(notification, occurrence, languages, config)) {
          await this.repo.markSent(notification.id, occurrenceAt);
        }
      }
    }

    await this.settings.set(LAST_RUN_KEY, now.toISOString());
    return sent;
  }

  /** "Send it now so I can see what it looks like." Deliberately NOT logged: a test must never make the
   *  real occurrence look already-sent. */
  async sendTest(notificationId: number, languages: string[]): Promise<boolean | null> {
    const notification = await this.repo.notification(notificationId);
    if (!notification) return null;
    const config = await this.load();
    const event = config.events.find((e) => e.id === notification.event_id);
    if (!event) return null;
    const occurrence = nextOccurrence({ ...toRecurrence(event), enabled: true }, this.now()) ?? this.now();
    if (!(await this.post(notification, occurrence, languages, config))) {
      throw new ScheduleValidationError("Discord rejected the test message");
    }
    return true;
  }

  private async load(): Promise<Config> {
    const [events, notifications, webhooks, roles, templates, translations] = await Promise.all([
      this.repo.events(),
      this.repo.notifications(),
      this.repo.webhooks(),
      this.repo.roles(),
      this.repo.templates(),
      this.repo.translations(),
    ]);
    return { events, notifications, webhooks, roles, templates, translations };
  }

  private async post(
    notification: NotificationRow,
    occurrence: Date,
    languages: string[],
    config: Config,
  ): Promise<boolean> {
    const event = config.events.find((e) => e.id === notification.event_id);
    const webhook = config.webhooks.find((w) => w.id === notification.webhook_id);
    if (!event || !webhook) return false;

    const roleIds = new Set(parseRoleIds(notification.role_ids));
    const snowflakes = config.roles.filter((r) => roleIds.has(r.id)).map((r) => r.role_id);
    const template = resolveTemplate(notification, config.templates);
    const end = event.duration_minutes === null ? null : new Date(occurrence.getTime() + event.duration_minutes * 60_000);

    // No template at all (every default one deleted) still posts something useful: the title.
    const content = template
      ? renderMessage({
          languages,
          texts: textsFor(template.id, config.translations),
          event: event.title,
          occurrence,
          end,
          roleSnowflakes: snowflakes,
        })
      : [...(snowflakes.length ? [snowflakes.map((id) => `<@&${id}>`).join(" ")] : []), event.title].join("\n");

    try {
      const res = await this.fetchImpl(`https://discord.com/api/webhooks/${webhook.webhook_id}/${webhook.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // parse: [] is the explicit allow-list — a template containing "@everyone" as TEXT cannot ping.
        body: JSON.stringify({ content, allowed_mentions: { parse: [], roles: snowflakes } }),
      });
      if (res.ok) return true;
      // No retry, by design: a late reminder is worse than a missed one. The ok=0 row is the record.
      console.error(`discord post failed for notification ${notification.id}: ${res.status}`);
      return false;
    } catch (err) {
      console.error(`discord post failed for notification ${notification.id}:`, err);
      return false;
    }
  }
}

function toRecurrence(row: EventRow) {
  return { id: row.id, starts_at: row.starts_at, every: row.every, unit: row.unit, enabled: row.enabled === 1 };
}

/** Explicit template wins. Otherwise the timing picks one; if that seeded template was deleted, walk
 *  the remaining rules before giving up (the caller then falls back to the event title alone). */
function resolveTemplate(notification: NotificationRow, templates: TemplateRow[]): TemplateRow | null {
  if (notification.template_id !== null) {
    const explicit = templates.find((t) => t.id === notification.template_id);
    if (explicit) return explicit;
  }
  const wanted = defaultTemplateKey(notification.minutes_before);
  for (const key of [wanted, ...FALLBACK_ORDER.filter((k) => k !== wanted)]) {
    const match = templates.find((t) => t.default_key === key);
    if (match) return match;
  }
  return null;
}
