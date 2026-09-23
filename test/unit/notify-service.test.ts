import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventRow,
  NotificationRow,
  RoleRow,
  ScheduleRepo,
  TemplateRow,
  TranslationRow,
  WebhookRow,
} from "../../src/repositories/schedule-repo";
import type { SettingsRepo } from "../../src/repositories/settings-repo";
import { NotifyService } from "../../src/services/notify-service";

// In-memory stand-ins: the point of these tests is the firing/dedupe logic, not SQL.
class FakeRepo {
  eventRows: EventRow[] = [];
  notificationRows: NotificationRow[] = [];
  webhookRows: WebhookRow[] = [];
  roleRows: RoleRow[] = [];
  templateRows: TemplateRow[] = [];
  translationRows: TranslationRow[] = [];
  log = new Map<string, { ok: number }>();

  async events() { return this.eventRows; }
  async notifications() { return this.notificationRows; }
  async notification(id: number) { return this.notificationRows.find((n) => n.id === id) ?? null; }
  async webhooks() { return this.webhookRows; }
  async roles() { return this.roleRows; }
  async templates() { return this.templateRows; }
  async translations() { return this.translationRows; }

  async claimFire(notificationId: number, occurrenceAt: string) {
    const key = `${notificationId}|${occurrenceAt}`;
    if (this.log.has(key)) return false;
    this.log.set(key, { ok: 0 });
    return true;
  }

  async markSent(notificationId: number, occurrenceAt: string) {
    this.log.set(`${notificationId}|${occurrenceAt}`, { ok: 1 });
  }
}

class FakeSettings {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
}

const OCCURRENCE = "2026-09-19T12:00:00.000Z";
const FIRE_TIME = new Date("2026-09-19T11:45:00Z"); // 15 minutes before the occurrence
const LANGS = async () => ["en"];

function fixture() {
  const repo = new FakeRepo();
  repo.eventRows = [
    { id: 1, title: "Bear Trap", activity_type_id: null, starts_at: "2026-09-17T12:00:00.000Z", every: 2, unit: "day", duration_minutes: null, enabled: 1 },
  ];
  repo.notificationRows = [
    { id: 7, event_id: 1, webhook_id: 3, template_id: null, role_ids: "[11]", minutes_before: 15 },
  ];
  repo.webhookRows = [{ id: 3, name: "#announcements", webhook_id: "12345678901234567", token: "s3cret", channel_id: null }];
  repo.roleRows = [
    { id: 11, name: "R4", role_id: "99999999999999999" },
    { id: 12, name: "Unpinged", role_id: "88888888888888888" },
  ];
  repo.templateRows = [
    { id: 1, name: "Get ready", default_key: "get_ready" },
    { id: 3, name: "Starting", default_key: "starting" },
  ];
  repo.translationRows = [
    { template_id: 1, lng: "en", text: "Get ready! {event} starts {time}." },
    { template_id: 3, lng: "en", text: "{event} is starting now!" },
  ];
  return repo;
}

function service(repo: FakeRepo, settings: FakeSettings, fetchImpl: typeof fetch, now = FIRE_TIME) {
  return new NotifyService(
    repo as unknown as ScheduleRepo,
    settings as unknown as SettingsRepo,
    fetchImpl,
    () => now,
  );
}

let posts: { url: string; body: Record<string, unknown> }[];

function recordingFetch(status = 204): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  posts = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("NotifyService.runDue", () => {
  it("posts once and dedupes on a second run in the same minute", async () => {
    const repo = fixture();
    const settings = new FakeSettings();
    const svc = service(repo, settings, recordingFetch());

    expect(await svc.runDue(LANGS)).toBe(1);
    expect(await svc.runDue(LANGS)).toBe(0); // the log row is the lock
    expect(posts).toHaveLength(1);
    expect(repo.log.get(`7|${OCCURRENCE}`)).toEqual({ ok: 1 });
  });

  it("posts to the webhook URL with the rendered content", async () => {
    const repo = fixture();
    await service(repo, new FakeSettings(), recordingFetch()).runDue(LANGS);
    expect(posts[0].url).toBe("https://discord.com/api/webhooks/12345678901234567/s3cret");
    expect(String(posts[0].body.content)).toContain("Get ready! Bear Trap starts <t:");
  });

  it("allows only the roles the notification pings, and never a bare @everyone", async () => {
    const repo = fixture();
    await service(repo, new FakeSettings(), recordingFetch()).runDue(LANGS);
    expect(posts[0].body.allowed_mentions).toEqual({ parse: [], roles: ["99999999999999999"] });
    expect(String(posts[0].body.content).split("\n")[0]).toBe("<@&99999999999999999>");
  });

  it("leaves ok = 0 on a Discord 500 and does not retry that occurrence", async () => {
    const repo = fixture();
    const settings = new FakeSettings();
    const svc = service(repo, settings, recordingFetch(500));

    expect(await svc.runDue(LANGS)).toBe(1);
    expect(repo.log.get(`7|${OCCURRENCE}`)).toEqual({ ok: 0 });
    expect(await svc.runDue(LANGS)).toBe(0);
    expect(posts).toHaveLength(1);
  });

  it("picks the default template from the timing, and the event title when none survives", async () => {
    const repo = fixture();
    repo.notificationRows[0].minutes_before = 0; // -> "starting"
    await service(repo, new FakeSettings(), recordingFetch(), new Date(OCCURRENCE)).runDue(LANGS);
    expect(String(posts[0].body.content)).toContain("Bear Trap is starting now!");

    posts = [];
    const bare = fixture();
    bare.templateRows = [];
    bare.translationRows = [];
    await service(bare, new FakeSettings(), recordingFetch()).runDue(LANGS);
    expect(posts[0].body.content).toBe("<@&99999999999999999>\nBear Trap");
  });

  it("writes notify_last_run even when nothing was due", async () => {
    const settings = new FakeSettings();
    const quiet = new Date("2026-09-19T03:00:00Z");
    expect(await service(fixture(), settings, recordingFetch(), quiet).runDue(LANGS)).toBe(0);
    expect(posts).toHaveLength(0);
    expect(settings.values.get("notify_last_run")).toBe(quiet.toISOString());
  });

  it("fires on the cron's scheduled minute even when the wall clock reads a hair early", async () => {
    // Cloudflare starts the tick ~300 ms before the boundary; the wall clock alone would slip it a minute.
    const early = new Date(FIRE_TIME.getTime() - 300);
    const svc = service(fixture(), new FakeSettings(), recordingFetch(), early);
    expect(await svc.runDue(LANGS, undefined, FIRE_TIME)).toBe(1);
  });

  it("skips a disabled event", async () => {
    const repo = fixture();
    repo.eventRows[0].enabled = 0;
    expect(await service(repo, new FakeSettings(), recordingFetch()).runDue(LANGS)).toBe(0);
  });
});

describe("NotifyService.sendTest", () => {
  it("posts the next occurrence now without touching the log", async () => {
    const repo = fixture();
    const svc = service(repo, new FakeSettings(), recordingFetch(), new Date("2026-09-19T08:00:00Z"));
    expect(await svc.sendTest(7, ["en"])).toBe(true);
    expect(posts).toHaveLength(1);
    expect(repo.log.size).toBe(0);
  });

  it("throws when Discord refuses, and returns null for an unknown notification", async () => {
    const repo = fixture();
    await expect(service(repo, new FakeSettings(), recordingFetch(403)).sendTest(7, ["en"])).rejects.toThrow(/Discord/);
    expect(await service(repo, new FakeSettings(), recordingFetch()).sendTest(999, ["en"])).toBeNull();
  });
});
