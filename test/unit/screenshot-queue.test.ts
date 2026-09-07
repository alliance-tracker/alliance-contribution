import { describe, expect, it } from "vitest";
import {
  counts,
  etaMs,
  initialQueue,
  isAcceptedType,
  meterState,
  nextToRead,
  queueReducer,
  mergeLines,
  readsLeft,
  type QueueState,
} from "../../web/src/lib/screenshot-queue";

const file = (name: string, type = "image/png") => new File([new Uint8Array([1])], name, { type });
const add = (s: QueueState, ...names: string[]) =>
  queueReducer(s, { type: "add", files: names.map((n) => file(n)) });

describe("queueReducer", () => {
  it("adds files as waiting, rejects bad types up front", () => {
    let s = queueReducer(initialQueue, { type: "add", files: [file("a.png"), file("b.heic", "image/heic")] });
    expect(s.items.map((i) => i.status)).toEqual(["waiting", "failed"]);
    expect(s.items[1].reason).toBe("bad_type");
    expect(s.batch).toBe("idle");
    s = queueReducer(s, { type: "start" });
    expect(s.batch).toBe("reading");
    expect(nextToRead(s)?.name).toBe("a.png");
  });

  it("walks began → succeeded and finishes the batch on the last item", () => {
    let s = queueReducer(add(initialQueue, "a.png", "b.png"), { type: "start" });
    const a = s.items[0].id, b = s.items[1].id;
    s = queueReducer(s, { type: "began", id: a });
    expect(nextToRead(s)).toBeUndefined();
    s = queueReducer(s, { type: "succeeded", id: a, rows: 6, ms: 1800 });
    expect(s.items[0]).toMatchObject({ status: "done", rows: 6 });
    expect(s.batch).toBe("reading");
    s = queueReducer(s, { type: "began", id: b });
    s = queueReducer(s, { type: "failed", id: b, reason: "not_a_screen" });
    expect(s.batch).toBe("done");
    expect(counts(s)).toEqual({ total: 2, done: 1, failed: 1, unread: 0, rows: 6 });
  });

  it("rejects a file over 8 MB up front as too_large", () => {
    const big = new File([new Uint8Array(9 * 1024 * 1024)], "big.png", { type: "image/png" });
    const s = queueReducer(initialQueue, { type: "add", files: [big] });
    expect(s.items[0]).toMatchObject({ status: "failed", reason: "too_large" });
  });

  it("cancel marks the in-flight and waiting items not_read and stops; resume re-queues them", () => {
    let s = queueReducer(add(initialQueue, "a.png", "b.png", "c.png"), { type: "start" });
    s = queueReducer(s, { type: "began", id: s.items[0].id });
    s = queueReducer(s, { type: "succeeded", id: s.items[0].id, rows: 5, ms: 2000 });
    s = queueReducer(s, { type: "began", id: s.items[1].id });
    s = queueReducer(s, { type: "cancel" });
    expect(s.batch).toBe("stopped");
    expect(s.items.map((i) => i.status)).toEqual(["done", "not_read", "not_read"]);
    s = queueReducer(s, { type: "resume" });
    expect(s.batch).toBe("reading");
    expect(s.items.map((i) => i.status)).toEqual(["done", "waiting", "waiting"]);
  });

  it("exhausted parks everything unread; offline parks the in-flight item as retry_wait", () => {
    let s = queueReducer(add(initialQueue, "a.png", "b.png"), { type: "start" });
    s = queueReducer(s, { type: "began", id: s.items[0].id });
    const off = queueReducer(s, { type: "offline" });
    expect(off.batch).toBe("offline");
    expect(off.items.map((i) => i.status)).toEqual(["retry_wait", "waiting"]);
    expect(nextToRead(queueReducer(off, { type: "resume" }))?.name).toBe("a.png");
    const ex = queueReducer(s, { type: "exhausted" });
    expect(ex.batch).toBe("exhausted");
    expect(ex.items.map((i) => i.status)).toEqual(["not_read", "not_read"]);
  });

  it("remove drops an item and settles the batch when nothing is left to read", () => {
    let s = queueReducer(add(initialQueue, "a.png", "b.png"), { type: "start" });
    s = queueReducer(s, { type: "began", id: s.items[0].id });
    s = queueReducer(s, { type: "failed", id: s.items[0].id, reason: "read_failed" });
    s = queueReducer(s, { type: "remove", id: s.items[1].id });
    expect(s.items).toHaveLength(1);
    expect(s.batch).toBe("done");
    expect(queueReducer(s, { type: "remove", id: s.items[0].id }).batch).toBe("idle");
  });

  it("remove keeps an exhausted/stopped/offline batch alive while a not_read row remains", () => {
    let s = queueReducer(add(initialQueue, "a.png", "b.png"), { type: "start" });
    s = queueReducer(s, { type: "began", id: s.items[0].id });
    s = queueReducer(s, { type: "exhausted" });
    expect(s.items.map((i) => i.status)).toEqual(["not_read", "not_read"]);
    s = queueReducer(s, { type: "remove", id: s.items[0].id });
    expect(s.batch).toBe("exhausted");
    expect(s.items.map((i) => i.status)).toEqual(["not_read"]);
    s = queueReducer(s, { type: "remove", id: s.items[0].id });
    expect(s.batch).toBe("idle");
    expect(s.items).toHaveLength(0);
  });

  it("eta uses the rolling mean of completed reads, seeded at 2 s", () => {
    let s = queueReducer(add(initialQueue, "a.png", "b.png", "c.png"), { type: "start" });
    expect(etaMs(s)).toBe(6000);
    s = queueReducer(s, { type: "began", id: s.items[0].id });
    s = queueReducer(s, { type: "succeeded", id: s.items[0].id, rows: 6, ms: 3000 });
    expect(etaMs(s)).toBe(6000); // 2 unread × 3000
  });
});

describe("meter helpers", () => {
  const usage = (used: number, requests = 0) => ({ used, limit: 10_000, requests, resetsAt: "2026-09-07T00:00:00.000Z", perRead: 5, reserve: 50, requestCap: 400 });
  it("readsLeft divides the remainder by the per-read cost", () => {
    expect(readsLeft(usage(9_800))).toBe(40);
    expect(readsLeft(usage(10_000))).toBe(0);
  });
  it("readsLeft is capped by the daily request quota when that is the binding term", () => {
    expect(readsLeft(usage(0, 350))).toBe(50);
  });
  it("meterState: plenty, low under 100 reads or 80 % used, used_up on exhausted or inside the reserve", () => {
    expect(meterState(usage(312), false)).toBe("plenty");
    expect(meterState(usage(9_600), false)).toBe("low");
    expect(meterState(usage(8_000), false)).toBe("low");
    expect(meterState(usage(9_960), false)).toBe("used_up");
    expect(meterState(usage(0), true)).toBe("used_up");
  });
  it("meterState: used_up once the daily request cap is hit", () => {
    expect(meterState(usage(0, 400), false)).toBe("used_up");
  });
  it("isAcceptedType allows png/jpeg/webp only", () => {
    expect(isAcceptedType(file("a.png"))).toBe(true);
    expect(isAcceptedType(file("a.jpg", "image/jpeg"))).toBe(true);
    expect(isAcceptedType(file("a.heic", "image/heic"))).toBe(false);
  });
});

describe("mergeLines", () => {
  it("keeps the first occurrence of a name across screenshots and ignores the alliance tag", () => {
    const first = mergeLines("", ["Alice\t100\t", "Mr Spiklitz\t50\t"]);
    expect(first).toBe("Alice\t100\t\nMr Spiklitz\t50\t");
    const second = mergeLines(first, ["Bob\t90\t", "[ABC]Mr Spiklitz\t50\t", "alice\t1\t"]);
    expect(second.split("\n")).toEqual(["Alice\t100\t", "Mr Spiklitz\t50\t", "Bob\t90\t", "alice\t1\t"]);
  });

  it("respects rows the operator already typed and drops blank lines", () => {
    expect(mergeLines("Alice\t1\n\n", ["Alice\t2", "\t3", "Cara\t4"])).toBe("Alice\t1\nCara\t4");
  });
});
