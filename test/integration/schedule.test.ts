import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { DiscordRole, MessageTemplate, ScheduleReadModel, ScheduledEventWithNotifications } from "../../shared/types";
import { ScheduleRepo } from "../../src/repositories/schedule-repo";
import { ADMIN, MANAGER, VIEWER } from "./keys";

const { DB } = env;
const ADMIN_URL = "https://example.com/api/admin/schedule";

// The webhook is inserted straight through the repo: POST /webhooks calls Discord to verify the token,
// and these tests never talk to Discord.
let webhookId: number;

function req(path: string, method: string, body?: unknown, headers: Record<string, string> = ADMIN) {
  return SELF.fetch(`${ADMIN_URL}${path}`, {
    method,
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const get = (path: string, headers = ADMIN) => req(path, "GET", undefined, headers);
const post = (path: string, body: unknown, headers = ADMIN) => req(path, "POST", body, headers);

beforeAll(async () => {
  webhookId = await new ScheduleRepo(DB).insertWebhook({
    name: "#announcements",
    webhook_id: "12345678901234567",
    token: "verysecrettoken",
    channel_id: "22345678901234567",
  });
});

describe("authorization", () => {
  it("rejects the viewer and manager keys on every admin route", async () => {
    // Viewer is blocked by the /api/admin prefix (403); manager reaches it but requireAdmin says no.
    for (const headers of [VIEWER, MANAGER]) {
      expect((await get("/events", headers)).status).toBe(403);
      expect((await post("/roles", { name: "x", role_id: "12345678901234567" }, headers)).status).toBe(403);
    }
  });

  it("serves the read-only view to the viewer key", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule", { headers: VIEWER });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScheduleReadModel;
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.languages).toContain("en");
    expect(body.status).toHaveProperty("last_run");
  });
});

describe("roles", () => {
  it("round-trips a role and rejects a non-snowflake", async () => {
    const created = (await (await post("/roles", { name: "R4", role_id: "99999999999999999" })).json()) as DiscordRole;
    expect(created).toMatchObject({ name: "R4", role_id: "99999999999999999" });

    expect((await (await get("/roles")).json() as DiscordRole[]).some((r) => r.id === created.id)).toBe(true);
    expect((await post("/roles", { name: "Bad", role_id: "123" })).status).toBe(400);
    expect((await post("/roles", { name: "  ", role_id: "99999999999999998" })).status).toBe(400);

    expect((await req(`/roles/${created.id}`, "DELETE")).status).toBe(200);
    expect((await req(`/roles/${created.id}`, "DELETE")).status).toBe(404);
  });
});

describe("templates", () => {
  it("seeds the four defaults in six languages", async () => {
    const templates = (await (await get("/templates")).json()) as MessageTemplate[];
    const defaults = templates.filter((t) => t.is_default);
    expect(defaults.map((t) => t.name)).toEqual(["Get ready", "Almost time", "Starting", "Ongoing"]);
    for (const t of defaults) {
      expect(Object.keys(t.texts).sort()).toEqual(["ar", "de", "en", "es", "fr", "ko"]);
    }
    expect(defaults[0].texts.en).toBe("Get ready! {event} starts {time}.");
  });

  it("refuses to delete a default template", async () => {
    const templates = (await (await get("/templates")).json()) as MessageTemplate[];
    const seeded = templates.find((t) => t.is_default)!;
    const res = await req(`/templates/${seeded.id}`, "DELETE");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "a default template cannot be deleted" });
  });

  it("creates, edits and deletes a custom template", async () => {
    expect((await post("/templates", { name: "No english", texts: { fr: "salut" } })).status).toBe(400);
    expect((await post("/templates", { name: "", texts: { en: "hi" } })).status).toBe(400);
    expect((await post("/templates", { name: "Bad code", texts: { eng: "hi" } })).status).toBe(400);

    const created = (await (await post("/templates", { name: "Custom", texts: { en: "{event} soon" } })).json()) as MessageTemplate;
    expect(created).toMatchObject({ name: "Custom", is_default: false, texts: { en: "{event} soon" } });

    const updated = (await (await req(`/templates/${created.id}`, "PUT", {
      name: "Custom v2",
      texts: { fr: "{event} bientôt" },
    })).json()) as MessageTemplate;
    expect(updated.name).toBe("Custom v2");
    expect(updated.texts).toEqual({ en: "{event} soon", fr: "{event} bientôt" });

    expect((await req(`/templates/${created.id}`, "DELETE")).status).toBe(200);
    expect((await req(`/templates/${created.id}`, "PUT", { name: "x" })).status).toBe(404);
  });
});

describe("events and notifications", () => {
  let pointEvent: ScheduledEventWithNotifications;
  let allDayEvent: ScheduledEventWithNotifications;
  let roleId: number;

  beforeAll(async () => {
    roleId = ((await (await post("/roles", { name: "Bear squad", role_id: "77777777777777777" })).json()) as DiscordRole).id;
    pointEvent = (await (await post("/events", {
      title: "Bear Trap",
      starts_at: "2026-09-17T12:00:00.000Z",
      every: 2,
      unit: "day",
    })).json()) as ScheduledEventWithNotifications;
    allDayEvent = (await (await post("/events", {
      title: "Alliance Mobilization",
      starts_at: "2026-09-21T00:00:00.000Z",
      every: 1,
      unit: "week",
      duration_minutes: 1440,
    })).json()) as ScheduledEventWithNotifications;
  });

  it("stores the recurrence and computes next_at", () => {
    expect(pointEvent).toMatchObject({ title: "Bear Trap", every: 2, unit: "day", duration_minutes: null, enabled: true });
    expect(pointEvent.next_at).not.toBeNull();
    expect(Date.parse(pointEvent.next_at!)).toBeGreaterThanOrEqual(Date.parse("2026-09-17T12:00:00.000Z"));
  });

  it("rejects invalid recurrences", async () => {
    const bad = [
      { title: "x", starts_at: "2026-09-17T12:00:00Z", every: 0, unit: "day" },
      { title: "x", starts_at: "2026-09-17T12:00:00Z", every: 1.5, unit: "day" },
      { title: "x", starts_at: "not a date", every: 1, unit: "day" },
      { title: "x", starts_at: "2026-09-17T12:00:00Z", every: 1, unit: "fortnight" },
      { title: "", starts_at: "2026-09-17T12:00:00Z", every: 1, unit: "day" },
      { title: "x", starts_at: "2026-09-17T12:00:00Z", every: 1, unit: "day", duration_minutes: 0 },
    ];
    for (const body of bad) {
      expect((await post("/events", body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("updates an event without resupplying every field, and deletes it", async () => {
    const created = (await (await post("/events", {
      title: "Temporary", starts_at: "2026-09-17T12:00:00.000Z", every: 1, unit: "day",
    })).json()) as ScheduledEventWithNotifications;

    const updated = (await (await req(`/events/${created.id}`, "PUT", { enabled: false })).json()) as ScheduledEventWithNotifications;
    expect(updated).toMatchObject({ title: "Temporary", every: 1, enabled: false });
    expect(updated.next_at).toBeNull(); // disabled events have no next occurrence

    expect((await req(`/events/${created.id}`, "DELETE")).status).toBe(200);
    expect((await req(`/events/${created.id}`, "PUT", { title: "gone" })).status).toBe(404);
  });

  it("attaches a notification and returns it nested under the event", async () => {
    const created = await (await post(`/events/${pointEvent.id}/notifications`, {
      webhook_id: webhookId,
      role_ids: [roleId],
      minutes_before: 15,
    })).json();
    expect(created).toMatchObject({ event_id: pointEvent.id, role_ids: [roleId], minutes_before: 15, template_id: null, last_sent: null });

    const events = (await (await get("/events")).json()) as ScheduledEventWithNotifications[];
    const reloaded = events.find((e) => e.id === pointEvent.id)!;
    expect(reloaded.notifications).toHaveLength(1);
    expect(reloaded.notifications[0].role_ids).toEqual([roleId]);
  });

  it("rejects a notification with an unknown role, webhook, template or event", async () => {
    const base = { webhook_id: webhookId, role_ids: [], minutes_before: 15 };
    expect((await post(`/events/${pointEvent.id}/notifications`, { ...base, role_ids: [99999] })).status).toBe(400);
    expect((await post(`/events/${pointEvent.id}/notifications`, { ...base, webhook_id: 99999 })).status).toBe(400);
    expect((await post(`/events/${pointEvent.id}/notifications`, { ...base, template_id: 99999 })).status).toBe(400);
    expect((await post(`/events/${pointEvent.id}/notifications`, { ...base, minutes_before: 1.5 })).status).toBe(400);
    expect((await post("/events/99999/notifications", base)).status).toBe(404);
  });

  it("allows a negative offset only inside an event that lasts", async () => {
    const base = { webhook_id: webhookId, role_ids: [] };
    // Point event: nothing to fire "during".
    expect((await post(`/events/${pointEvent.id}/notifications`, { ...base, minutes_before: -30 })).status).toBe(400);
    // All-day event: midday nudge is fine, but not one past the end.
    expect((await post(`/events/${allDayEvent.id}/notifications`, { ...base, minutes_before: -720 })).status).toBe(200);
    expect((await post(`/events/${allDayEvent.id}/notifications`, { ...base, minutes_before: -1440 })).status).toBe(400);
  });

  it("updates and deletes a notification", async () => {
    const created = (await (await post(`/events/${allDayEvent.id}/notifications`, {
      webhook_id: webhookId, role_ids: [], minutes_before: 60,
    })).json()) as { id: number };

    const updated = await (await req(`/notifications/${created.id}`, "PUT", {
      webhook_id: webhookId, role_ids: [roleId], minutes_before: 30, template_id: 3,
    })).json();
    expect(updated).toMatchObject({ minutes_before: 30, template_id: 3, role_ids: [roleId] });

    expect((await req(`/notifications/${created.id}`, "DELETE")).status).toBe(200);
    expect((await req(`/notifications/${created.id}`, "DELETE")).status).toBe(404);
  });

  it("cascades notifications when the event goes", async () => {
    const doomed = (await (await post("/events", {
      title: "Doomed", starts_at: "2026-09-17T12:00:00.000Z", every: 1, unit: "day",
    })).json()) as ScheduledEventWithNotifications;
    await post(`/events/${doomed.id}/notifications`, { webhook_id: webhookId, role_ids: [], minutes_before: 5 });
    await req(`/events/${doomed.id}`, "DELETE");

    const events = (await (await get("/events")).json()) as ScheduledEventWithNotifications[];
    expect(events.some((e) => e.id === doomed.id)).toBe(false);
  });
});

// Last: the PUT writes a settings row that changes what every later read resolves to.
describe("languages", () => {
  it("falls back to the default list, then reports the stored one", async () => {
    expect(await (await get("/languages")).json()).toEqual({
      languages: ["en", "es", "fr", "de", "ko", "ar"],
      source: "default",
    });

    for (const languages of [[], ["es"], ["en", "en"], ["en", "eng"], ["en", 4], "en"]) {
      expect((await req("/languages", "PUT", { languages })).status, JSON.stringify(languages)).toBe(400);
    }

    expect(await (await req("/languages", "PUT", { languages: ["en", "ko"] })).json()).toEqual({
      languages: ["en", "ko"],
      source: "settings",
    });
    expect(await (await get("/languages")).json()).toEqual({ languages: ["en", "ko"], source: "settings" });
  });
});

describe("status", () => {
  it("reports no cron run yet", async () => {
    expect(await (await get("/status")).json()).toEqual({ last_run: null });
  });
});
