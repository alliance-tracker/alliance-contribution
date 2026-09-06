import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { AI_DAILY_NEURON_LIMIT } from "../../shared/types";
import { utcDay } from "../../src/domain/screenshot";
import { ADMIN, MANAGER, VIEWER } from "./keys";

const { DB } = env;
const URL_READ = "https://example.com/api/screenshots/read";
const URL_USAGE = "https://example.com/api/screenshots/usage";

// 1x1 PNG. Never reaches the model in these tests: every case fails validation or the pre-check first.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

function form(fields: Record<string, string | Blob>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) f.append(k, v, "shot.png");
    else f.append(k, v);
  }
  return f;
}
const png = () => new Blob([PNG], { type: "image/png" });

afterEach(async () => {
  await DB.prepare("DELETE FROM ai_usage").run();
});

describe("GET /api/screenshots/usage", () => {
  it("requires a key", async () => {
    expect((await SELF.fetch(URL_USAGE)).status).toBe(401);
  });
  it("is readable by the viewer tier and reports today's tally", async () => {
    await DB.prepare("INSERT INTO ai_usage (day, neurons, requests) VALUES (?, ?, ?)").bind(utcDay(new Date()), 12.4, 3).run();
    const res = await SELF.fetch(URL_USAGE, { headers: VIEWER });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ used: 12, limit: AI_DAILY_NEURON_LIMIT, requests: 3 });
  });
});

describe("POST /api/screenshots/read validation (never calls the model)", () => {
  it("401 without a key, 403 for the viewer", async () => {
    expect((await SELF.fetch(URL_READ, { method: "POST", body: form({ kind: "event", image: png() }) })).status).toBe(401);
    expect((await SELF.fetch(URL_READ, { method: "POST", headers: VIEWER, body: form({ kind: "event", image: png() }) })).status).toBe(403);
  });
  it("400 on a bad kind, a missing image, or an unsupported type", async () => {
    expect((await SELF.fetch(URL_READ, { method: "POST", headers: MANAGER, body: form({ kind: "nope", image: png() }) })).status).toBe(400);
    expect((await SELF.fetch(URL_READ, { method: "POST", headers: MANAGER, body: form({ kind: "event" }) })).status).toBe(400);
    const gif = new Blob([PNG], { type: "image/gif" });
    expect((await SELF.fetch(URL_READ, { method: "POST", headers: MANAGER, body: form({ kind: "event", image: gif }) })).status).toBe(400);
  });
  it("413 when the upload is over 8 MB", async () => {
    const big = new Blob([new Uint8Array(9 * 1024 * 1024)], { type: "image/png" });
    expect((await SELF.fetch(URL_READ, { method: "POST", headers: ADMIN, body: form({ kind: "event", image: big }) })).status).toBe(413);
  });
  it("429 with usage when today's tally is at the limit", async () => {
    await DB.prepare("INSERT INTO ai_usage (day, neurons, requests) VALUES (?, ?, 1)").bind(utcDay(new Date()), AI_DAILY_NEURON_LIMIT).run();
    const res = await SELF.fetch(URL_READ, { method: "POST", headers: MANAGER, body: form({ kind: "roster", image: png() }) });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "exhausted", usage: { used: AI_DAILY_NEURON_LIMIT, requests: 1 } });
  });
});
