import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  defaultTemplateKey,
  dueFires,
  isSnowflake,
  nextOccurrence,
  occurrencesBetween,
  parseLanguageList,
  parseWebhookUrl,
  placeholdersMatch,
  renderMessage,
  type Recurrence,
} from "../../src/domain/schedule";
import { schedulerGuard } from "../../src/routes/schedule";

const ev = (over: Partial<Recurrence> = {}): Recurrence => ({
  starts_at: "2026-09-17T12:00:00.000Z",
  every: 1,
  unit: "day",
  enabled: true,
  ...over,
});

const at = (iso: string) => new Date(iso);

describe("nextOccurrence", () => {
  it("returns the anchor itself when it is still in the future", () => {
    expect(nextOccurrence(ev(), at("2026-09-10T00:00:00Z"))?.toISOString()).toBe("2026-09-17T12:00:00.000Z");
  });

  it("returns the anchor when now is exactly on it (>= now, not > now)", () => {
    expect(nextOccurrence(ev(), at("2026-09-17T12:00:00Z"))?.toISOString()).toBe("2026-09-17T12:00:00.000Z");
  });

  it("steps every-other-day forward without drifting across a DST change", () => {
    // Europe/US clocks shift between these dates; UTC instants must not move with them.
    const e = ev({ starts_at: "2026-10-18T12:00:00.000Z", every: 2 });
    expect(nextOccurrence(e, at("2026-11-07T13:00:00Z"))?.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(nextOccurrence(e, at("2026-11-09T11:59:59Z"))?.toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });

  it("steps by whole weeks for every-4-weeks", () => {
    const e = ev({ every: 4, unit: "week" });
    expect(nextOccurrence(e, at("2026-09-18T00:00:00Z"))?.toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(nextOccurrence(e, at("2026-10-16T00:00:00Z"))?.toISOString()).toBe("2026-11-12T12:00:00.000Z");
  });

  it("returns null for a disabled event", () => {
    expect(nextOccurrence(ev({ enabled: false }), at("2026-09-10T00:00:00Z"))).toBeNull();
  });

  it("returns null for an unparseable anchor", () => {
    expect(nextOccurrence(ev({ starts_at: "whenever" }), at("2026-09-10T00:00:00Z"))).toBeNull();
  });
});

describe("occurrencesBetween", () => {
  it("includes `from` and excludes `to`", () => {
    const got = occurrencesBetween(ev(), at("2026-09-17T12:00:00Z"), at("2026-09-19T12:00:00Z"));
    expect(got.map((d) => d.toISOString())).toEqual(["2026-09-17T12:00:00.000Z", "2026-09-18T12:00:00.000Z"]);
  });

  it("returns nothing for a window entirely before the anchor", () => {
    expect(occurrencesBetween(ev(), at("2026-09-01T00:00:00Z"), at("2026-09-02T00:00:00Z"))).toEqual([]);
  });

  it("returns nothing for an empty or inverted window", () => {
    expect(occurrencesBetween(ev(), at("2026-09-20T00:00:00Z"), at("2026-09-19T00:00:00Z"))).toEqual([]);
  });
});

describe("dueFires", () => {
  const event = { id: 1, ...ev({ starts_at: "2026-09-17T12:00:00.000Z", every: 2 }) };
  const notification = { id: 7, event_id: 1, minutes_before: 15 };

  it("fires exactly once inside the window, at the fire minute", () => {
    // Occurrence 2026-09-19T12:00Z, 15 minutes before = 11:45Z.
    const got = dueFires([event], [notification], at("2026-09-19T11:45:00Z"));
    expect(got).toHaveLength(1);
    expect(got[0].occurrence.toISOString()).toBe("2026-09-19T12:00:00.000Z");
    expect(got[0].notification).toBe(notification);
  });

  it("still fires one tick late (the window tolerates a skipped cron minute)", () => {
    expect(dueFires([event], [notification], at("2026-09-19T11:46:30Z"))).toHaveLength(1);
  });

  it("does not fire before the fire time or after the window closes", () => {
    expect(dueFires([event], [notification], at("2026-09-19T11:44:00Z"))).toEqual([]);
    expect(dueFires([event], [notification], at("2026-09-19T11:47:30Z"))).toEqual([]);
  });

  it("fires a negative offset DURING an all-day event", () => {
    const allDay = { id: 2, ...ev({ starts_at: "2026-09-17T00:00:00.000Z", every: 1 }) };
    const midday = { id: 8, event_id: 2, minutes_before: -720 }; // 12 hours after start
    expect(dueFires([allDay], [midday], at("2026-09-20T12:00:00Z"))).toHaveLength(1);
    expect(dueFires([allDay], [midday], at("2026-09-20T13:00:00Z"))).toEqual([]);
  });

  it("skips a disabled event and an orphaned notification", () => {
    expect(dueFires([{ ...event, enabled: false }], [notification], at("2026-09-19T11:45:00Z"))).toEqual([]);
    expect(dueFires([], [notification], at("2026-09-19T11:45:00Z"))).toEqual([]);
  });
});

describe("renderMessage", () => {
  const base = {
    languages: ["en", "fr"],
    texts: { en: "Get ready! {event} starts {time}.", fr: "{event} commence {time} !" },
    event: "Bear Trap",
    occurrence: at("2026-09-17T12:00:00Z"),
    end: null as Date | null,
    roleSnowflakes: [] as string[],
  };
  const unix = Math.floor(Date.parse("2026-09-17T12:00:00Z") / 1000);

  it("substitutes the placeholders and prefixes each language with its flag", () => {
    expect(renderMessage(base)).toBe(
      `🇬🇧 Get ready! Bear Trap starts <t:${unix}:R>.\n🇫🇷 Bear Trap commence <t:${unix}:R> !`,
    );
  });

  it("keeps the configured language order", () => {
    const out = renderMessage({ ...base, languages: ["fr", "en"] });
    expect(out.startsWith("🇫🇷")).toBe(true);
  });

  it("renders {end} from the duration, and falls back to {time} without one", () => {
    const texts = { en: "{event} is live! Ends {end}." };
    const endUnix = Math.floor(Date.parse("2026-09-17T18:00:00Z") / 1000);
    expect(renderMessage({ ...base, languages: ["en"], texts, end: at("2026-09-17T18:00:00Z") })).toBe(
      `🇬🇧 Bear Trap is live! Ends <t:${endUnix}:R>.`,
    );
    expect(renderMessage({ ...base, languages: ["en"], texts, end: null })).toBe(
      `🇬🇧 Bear Trap is live! Ends <t:${unix}:R>.`,
    );
  });

  it("falls back to the bold upper-cased code for a language with no flag", () => {
    const out = renderMessage({ ...base, languages: ["xx"], texts: { xx: "hi {event}" } });
    expect(out).toBe("**XX** hi Bear Trap");
  });

  it("skips a configured language with no translation instead of emitting a blank line", () => {
    const out = renderMessage({ ...base, languages: ["en", "de", "fr"] });
    expect(out.split("\n")).toHaveLength(2);
    expect(out).not.toContain("🇩🇪");
  });

  it("omits the mention line when no roles are pinged, and leads with it when there are", () => {
    expect(renderMessage(base).startsWith("🇬🇧")).toBe(true);
    const pinged = renderMessage({ ...base, roleSnowflakes: ["123", "456"] });
    expect(pinged.split("\n")[0]).toBe("<@&123> <@&456>");
  });

  it("truncates below Discord's 2000-character cap", () => {
    const out = renderMessage({ ...base, languages: ["en"], texts: { en: "x".repeat(5000) } });
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("defaultTemplateKey", () => {
  it("maps the timing to the seeded template", () => {
    expect(defaultTemplateKey(-720)).toBe("ongoing");
    expect(defaultTemplateKey(0)).toBe("starting");
    expect(defaultTemplateKey(1)).toBe("almost_time");
    expect(defaultTemplateKey(5)).toBe("almost_time");
    expect(defaultTemplateKey(6)).toBe("get_ready");
    expect(defaultTemplateKey(1440)).toBe("get_ready");
  });
});

describe("placeholdersMatch", () => {
  it("accepts a translation that carries exactly the source's placeholders", () => {
    expect(placeholdersMatch("{event} at {time}", "{event} à {time}")).toBe(true);
    expect(placeholdersMatch("no placeholders", "aucun")).toBe(true);
  });

  it("rejects a dropped, translated or invented placeholder", () => {
    expect(placeholdersMatch("{event} at {time}", "{event} bientôt")).toBe(false);
    expect(placeholdersMatch("{event} at {time}", "{evenement} à {time}")).toBe(false);
    expect(placeholdersMatch("{event}", "{event} {end}")).toBe(false);
  });
});

describe("parseWebhookUrl", () => {
  it("parses the id and token out of a pasted URL", () => {
    expect(parseWebhookUrl("https://discord.com/api/webhooks/12345678901234567/abcDEF-_123")).toEqual({
      webhook_id: "12345678901234567",
      token: "abcDEF-_123",
    });
  });

  it("accepts discordapp.com, a trailing slash and a query string", () => {
    expect(parseWebhookUrl("https://discordapp.com/api/webhooks/12345678901234567/tok/")?.token).toBe("tok");
    expect(parseWebhookUrl("https://discord.com/api/webhooks/12345678901234567/tok?wait=true")?.token).toBe("tok");
  });

  it("rejects anything else", () => {
    for (const url of [
      "http://discord.com/api/webhooks/12345678901234567/tok",
      "https://evil.example/api/webhooks/12345678901234567/tok",
      "https://discord.com/api/webhooks/123/tok",
      "not a url",
    ]) {
      expect(parseWebhookUrl(url), url).toBeNull();
    }
  });
});

describe("parseLanguageList", () => {
  it("parses, lower-cases, dedupes and puts en first", () => {
    expect(parseLanguageList("FR, es ,fr,en")).toEqual(["en", "fr", "es"]);
    expect(parseLanguageList("es")).toEqual(["en", "es"]);
  });

  it("returns null for an empty or malformed value", () => {
    for (const raw of [undefined, null, "", "   ", ",,", "en,eng", "en,f1"]) {
      expect(parseLanguageList(raw), String(raw)).toBeNull();
    }
  });
});

describe("isSnowflake", () => {
  it("accepts 17-20 digits only", () => {
    expect(isSnowflake("12345678901234567")).toBe(true);
    expect(isSnowflake("12345678901234567890")).toBe(true);
    expect(isSnowflake("1234567890123456")).toBe(false);
    expect(isSnowflake("123456789012345678901")).toBe(false);
    expect(isSnowflake("1234567890123456a")).toBe(false);
    expect(isSnowflake(12345678901234567)).toBe(false);
  });
});

describe("schedulerGuard", () => {
  const app = new Hono().use("*", schedulerGuard).get("/x", (c) => c.json({ ok: true }));

  it("404s when SCHEDULER_ENABLED is not exactly \"true\"", async () => {
    for (const SCHEDULER_ENABLED of [undefined, "", "false", "1", "TRUE"]) {
      const res = await app.request("/x", {}, { SCHEDULER_ENABLED });
      expect(res.status, String(SCHEDULER_ENABLED)).toBe(404);
      expect(await res.json()).toEqual({ error: "scheduler disabled" });
    }
  });

  it("passes through when the var is set", async () => {
    const res = await app.request("/x", {}, { SCHEDULER_ENABLED: "true" });
    expect(res.status).toBe(200);
  });
});

