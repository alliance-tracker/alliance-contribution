import { AI_NEURONS_PER_READ, AI_RESERVE_NEURONS, type ScreenshotUsage } from "../../../shared/types";

// Pure state machine for a batch of screenshots read one at a time. The component owns the fetch
// loop and the AbortController; everything decidable from state lives here so it can be unit-tested.

export type ItemStatus = "waiting" | "reading" | "done" | "failed" | "not_read" | "retry_wait";
export type FailReason = "not_a_screen" | "read_failed" | "bad_type";
export type QueueItem = {
  id: string;
  name: string;
  file: File;
  status: ItemStatus;
  rows?: number;
  reason?: FailReason;
};
export type BatchStatus = "idle" | "reading" | "stopped" | "exhausted" | "offline" | "done";
export type QueueState = { items: QueueItem[]; batch: BatchStatus; durations: number[] };

export type QueueAction =
  | { type: "add"; files: File[] }
  | { type: "start" }
  | { type: "began"; id: string }
  | { type: "succeeded"; id: string; rows: number; ms: number }
  | { type: "failed"; id: string; reason: FailReason }
  | { type: "cancel" }
  | { type: "exhausted" }
  | { type: "offline" }
  | { type: "resume" }
  | { type: "remove"; id: string };

export const initialQueue: QueueState = { items: [], batch: "idle", durations: [] };

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
export const isAcceptedType = (file: File): boolean => ACCEPTED.has(file.type);

const SEED_MS = 2000;
let seq = 0;

const isUnread = (i: QueueItem) => i.status === "waiting" || i.status === "retry_wait";
const hasUnread = (items: QueueItem[]) => items.some(isUnread);
const setStatus = (items: QueueItem[], id: string, patch: Partial<QueueItem>) =>
  items.map((i) => (i.id === id ? { ...i, ...patch } : i));
const settle = (s: QueueState): QueueState =>
  hasUnread(s.items) || s.items.some((i) => i.status === "reading") ? s : { ...s, batch: s.items.length ? "done" : "idle" };

export function queueReducer(s: QueueState, a: QueueAction): QueueState {
  switch (a.type) {
    case "add": {
      const items = a.files.map<QueueItem>((file) =>
        isAcceptedType(file)
          ? { id: `f${++seq}`, name: file.name, file, status: "waiting" }
          : { id: `f${++seq}`, name: file.name, file, status: "failed", reason: "bad_type" },
      );
      return { ...s, items: [...s.items, ...items] };
    }
    case "start":
      return hasUnread(s.items) ? { ...s, batch: "reading" } : settle(s);
    case "began":
      return { ...s, items: setStatus(s.items, a.id, { status: "reading" }) };
    case "succeeded":
      return settle({
        ...s,
        items: setStatus(s.items, a.id, { status: "done", rows: a.rows, reason: undefined }),
        durations: [...s.durations, a.ms].slice(-10),
      });
    case "failed":
      return settle({ ...s, items: setStatus(s.items, a.id, { status: "failed", reason: a.reason }) });
    case "cancel":
      return {
        ...s,
        batch: "stopped",
        items: s.items.map((i) => (i.status === "reading" || isUnread(i) ? { ...i, status: "not_read" } : i)),
      };
    case "exhausted":
      return {
        ...s,
        batch: "exhausted",
        items: s.items.map((i) => (i.status === "reading" || isUnread(i) ? { ...i, status: "not_read" } : i)),
      };
    case "offline":
      return {
        ...s,
        batch: "offline",
        items: s.items.map((i) => (i.status === "reading" ? { ...i, status: "retry_wait" } : i)),
      };
    case "resume": {
      const items = s.items.map((i) => (i.status === "not_read" || i.status === "retry_wait" ? { ...i, status: "waiting" as const } : i));
      return hasUnread(items) ? { ...s, items, batch: "reading" } : settle({ ...s, items });
    }
    case "remove": {
      const items = s.items.filter((i) => i.id !== a.id);
      if (items.length === 0) return { ...s, items, batch: "idle" };
      return s.batch === "reading" ? settle({ ...s, items }) : hasUnread(items) ? { ...s, items } : { ...s, items, batch: "done" };
    }
  }
}

/** The next file to send while the batch is reading and nothing is in flight. */
export function nextToRead(s: QueueState): QueueItem | undefined {
  if (s.batch !== "reading" || s.items.some((i) => i.status === "reading")) return undefined;
  return s.items.find(isUnread);
}

export function counts(s: QueueState) {
  const total = s.items.length;
  const done = s.items.filter((i) => i.status === "done").length;
  const failed = s.items.filter((i) => i.status === "failed").length;
  const unread = s.items.filter((i) => isUnread(i) || i.status === "not_read").length;
  const rows = s.items.reduce((n, i) => n + (i.rows ?? 0), 0);
  const settled = total > 0 && unread === 0 && !s.items.some((i) => i.status === "reading");
  return { total, done, failed, unread, rows, settled };
}

export function etaMs(s: QueueState): number {
  const mean = s.durations.length ? s.durations.reduce((a, b) => a + b, 0) / s.durations.length : SEED_MS;
  const pending = s.items.filter((i) => isUnread(i) || i.status === "reading").length;
  return Math.round(pending * mean);
}

export const readsLeft = (u: ScreenshotUsage): number =>
  Math.max(0, Math.floor((u.limit - u.used) / AI_NEURONS_PER_READ));

export function meterState(u: ScreenshotUsage, exhausted: boolean): "plenty" | "low" | "used_up" {
  if (exhausted || u.limit - u.used < AI_RESERVE_NEURONS) return "used_up";
  if (readsLeft(u) < 100 || u.used / u.limit >= 0.8) return "low";
  return "plenty";
}
