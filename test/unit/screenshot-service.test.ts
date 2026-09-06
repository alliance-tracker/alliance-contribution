import { describe, expect, it } from "vitest";
import { AI_DAILY_REQUEST_CAP, AI_NEURONS_PER_READ, DEFAULT_AI_CONFIG } from "../../shared/types";
import { ScreenshotError, ScreenshotService, type AiChatOutput } from "../../src/services/screenshot-service";

class FakeRepo {
  rows = new Map<string, { neurons: number; requests: number }>();
  async get(day: string) { return this.rows.get(day) ?? { neurons: 0, requests: 0 }; }
  async add(day: string, neurons: number) {
    const r = await this.get(day);
    this.rows.set(day, { neurons: r.neurons + neurons, requests: r.requests + 1 });
  }
}

const NOW = () => new Date("2026-09-06T12:00:00Z");
const DAY = "2026-09-06";
const image = new Uint8Array([137, 80, 78, 71]).buffer;
const ok = (content: string, extra: Partial<AiChatOutput> = {}): AiChatOutput => ({
  choices: [{ message: { content }, finish_reason: "stop" }],
  usage: { neurons: 4.8 },
  ...extra,
});

async function failing(p: Promise<unknown>): Promise<ScreenshotError> {
  try { await p; } catch (e) { return e as ScreenshotError; }
  throw new Error("expected rejection");
}

describe("ScreenshotService.read", () => {
  it("returns parsed lines and tallies the reported neurons", async () => {
    const repo = new FakeRepo();
    const calls: string[] = [];
    const svc = new ScreenshotService(repo, async (prompt, uri) => { calls.push(prompt, uri); return ok("Aurora\t120000\nBlaze\t95000\t47/48"); }, undefined, NOW);
    const r = await svc.read({ kind: "event", unitLabel: "Damage", image, mime: "image/png" });
    expect(r.lines).toEqual(["Aurora\t120000", "Blaze\t95000\t47/48"]);
    expect(r.rowCount).toBe(2);
    expect(r.neurons).toBe(4.8);
    expect(r.usage).toMatchObject({ used: 5, requests: 1, limit: 10_000 });
    expect(calls[0]).toContain("Damage");
    expect(calls[1].startsWith("data:image/png;base64,")).toBe(true);
    expect(await repo.get(DAY)).toEqual({ neurons: 4.8, requests: 1 });
  });

  it("tallies the fallback constant when the response has no neurons", async () => {
    const repo = new FakeRepo();
    const svc = new ScreenshotService(repo, async () => ok("A\t1", { usage: undefined }), undefined, NOW);
    await svc.read({ kind: "event", image, mime: "image/png" });
    expect(await repo.get(DAY)).toEqual({ neurons: AI_NEURONS_PER_READ, requests: 1 });
  });

  it("refuses before calling the model when the neuron reserve is gone", async () => {
    const repo = new FakeRepo();
    repo.rows.set(DAY, { neurons: 9_960, requests: 3 });
    let called = false;
    const svc = new ScreenshotService(repo, async () => { called = true; return ok("A\t1"); }, undefined, NOW);
    const err = await failing(svc.read({ kind: "event", image, mime: "image/png" }));
    expect(err.code).toBe("exhausted");
    expect(err.usage.used).toBe(9_960);
    expect(called).toBe(false);
  });

  it("refuses before calling the model at the daily request cap", async () => {
    const repo = new FakeRepo();
    repo.rows.set(DAY, { neurons: 100, requests: AI_DAILY_REQUEST_CAP });
    const svc = new ScreenshotService(repo, async () => ok("A\t1"), undefined, NOW);
    expect((await failing(svc.read({ kind: "roster", image, mime: "image/png" }))).code).toBe("exhausted");
  });

  it("maps a 4006 model error to exhausted and anything else to read_failed", async () => {
    const repo = new FakeRepo();
    const a = new ScreenshotService(repo, async () => { throw new Error("4006: daily free allocation exhausted"); }, undefined, NOW);
    expect((await failing(a.read({ kind: "event", image, mime: "image/png" }))).code).toBe("exhausted");
    const b = new ScreenshotService(repo, async () => { throw new Error("upstream timeout"); }, undefined, NOW);
    expect((await failing(b.read({ kind: "event", image, mime: "image/png" }))).code).toBe("read_failed");
    expect(await repo.get(DAY)).toEqual({ neurons: 0, requests: 0 });
  });

  it("still tallies when the model says it is not a screen, then reports not_a_screen", async () => {
    const repo = new FakeRepo();
    const svc = new ScreenshotService(repo, async () => ok("NOT_A_RANKING_SCREEN"), undefined, NOW);
    const err = await failing(svc.read({ kind: "event", image, mime: "image/png" }));
    expect(err.code).toBe("not_a_screen");
    expect(err.usage.requests).toBe(1);
  });

  it("treats a truncated answer as read_failed after tallying", async () => {
    const repo = new FakeRepo();
    const svc = new ScreenshotService(repo, async () => ({ choices: [{ message: { content: "A\t1" }, finish_reason: "length" }], usage: { neurons: 6 } }), undefined, NOW);
    const err = await failing(svc.read({ kind: "event", image, mime: "image/png" }));
    expect(err.code).toBe("read_failed");
    expect(await repo.get(DAY)).toEqual({ neurons: 6, requests: 1 });
  });
});

describe("ScreenshotService with an overridden config", () => {
  it("uses the configured caps and fallback cost", async () => {
    const repo = new FakeRepo();
    repo.rows.set(DAY, { neurons: 0, requests: 2 });
    const cfg = { ...DEFAULT_AI_CONFIG, dailyRequestCap: 2, neuronsPerRead: 9 };
    let called = false;
    const capped = new ScreenshotService(repo, async () => { called = true; return ok("A\t1"); }, cfg, NOW);
    expect((await failing(capped.read({ kind: "event", image, mime: "image/png" }))).code).toBe("exhausted");
    expect(called).toBe(false);
    const roomy = new ScreenshotService(repo, async () => ok("A\t1", { usage: undefined }), { ...cfg, dailyRequestCap: 10 }, NOW);
    const r = await roomy.read({ kind: "event", image, mime: "image/png" });
    expect(r.usage).toMatchObject({ requestCap: 10, perRead: 9, requests: 3 });
    expect(await repo.get(DAY)).toEqual({ neurons: 9, requests: 3 });
  });
});

describe("ScreenshotService.usage", () => {
  it("snapshots today's row", async () => {
    const repo = new FakeRepo();
    repo.rows.set(DAY, { neurons: 42.6, requests: 9 });
    const svc = new ScreenshotService(repo, async () => ok(""), undefined, NOW);
    expect(await svc.usage()).toEqual({ used: 43, limit: 10_000, requests: 9, resetsAt: "2026-09-07T00:00:00.000Z", perRead: 5, reserve: 50, requestCap: 400 });
  });
});
