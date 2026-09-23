// Pure KvK Prep helpers — no path aliases, no JSX (test/unit/ imports this directly). Mirrors the
// shapes and rules of src/domain/kvk.ts, but for the SPA's read-model derivations.

import type { KvkBoardAppointment, KvkPosition, KvkRedactedAppointment } from "../../../shared/types";

export { POSITIONS } from "../../../shared/types";

export const DAY_COUNT = 5;
export const SLOTS = 48;
export const TOTAL_SLOTS = DAY_COUNT * 2 * SLOTS; // 480
export const FOCUS_SLOTS = 4 * SLOTS; // 192 — every day but day 4 has a focus position

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 30 * 60 * 1000;

export type KvkDayTheme = "construction" | "research" | "training" | "none" | "finalPush";

/** `theme` is the i18n suffix (`kvk.days.${theme}`); `focus` is null on day 4 (no focus position). */
export const DAYS: readonly { theme: KvkDayTheme; focus: KvkPosition | null }[] = [
  { theme: "construction", focus: "chief_minister" },
  { theme: "research", focus: "chief_minister" },
  { theme: "training", focus: "noble_advisor" },
  { theme: "none", focus: null },
  { theme: "finalPush", focus: "chief_minister" },
];

// Palette from the design handoff §4 (New/Edit key dialog), in order — first-unused wins new keys.
export const KVK_COLORS: readonly string[] = [
  "#e11d48", "#7c3aed", "#0d9488", "#ca8a04", "#2563eb",
  "#db2777", "#16a34a", "#ea580c", "#0891b2", "#4f46e5",
];
/** Swatch/dot colour for an appointment whose key was deleted (key_id null). */
export const DELETED_COLOR = "#8f9fb1";

export type KvkSlotRef = { day: number; position: KvkPosition; slot: number };

export function slotKey(ref: KvkSlotRef): string {
  return `${ref.day}-${ref.position}-${ref.slot}`;
}

export function isRedacted(a: KvkBoardAppointment): a is KvkRedactedAppointment {
  return "filled" in a;
}

/** Key-holder edit rule (UI side; the server 404s foreign rows): a free slot, or a full row under the
 *  holder's own key. A deleted key's rows (`key_id` null) belong to nobody. */
export function holderCanEdit(appt: KvkBoardAppointment | null, ownKeyId: number): boolean {
  return appt === null || (!isRedacted(appt) && appt.key_id === ownKeyId);
}

export function indexAppointments(appts: readonly KvkBoardAppointment[]): Map<string, KvkBoardAppointment> {
  const out = new Map<string, KvkBoardAppointment>();
  for (const a of appts) out.set(slotKey(a), a);
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** slot 0 = 00:00–00:30 UTC; slot 47 ends at "00:00" (midnight, not "24:00"). */
export function slotLabel(slot: number): { start: string; end: string } {
  const fmt = (totalMin: number) => {
    const m = totalMin % (24 * 60);
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  };
  return { start: fmt(slot * 30), end: fmt(slot * 30 + 30) };
}

function dayStartMs(start: string): number {
  const [y, m, d] = start.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** ISO date (YYYY-MM-DD) of `day` (1..DAY_COUNT), day 1 = `start` itself. */
export function dayIso(start: string, day: number): string {
  const ms = dayStartMs(start) + (day - 1) * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

export type KvkDaySlot =
  | { phase: "before"; days: number }
  | { phase: "live"; day: number; slot: number }
  | { phase: "ended" };

/** Day 1 starts at `start`T00:00Z. Null `start` (event unset) → null. */
export function currentDaySlot(start: string | null, now: number): KvkDaySlot | null {
  if (start === null) return null;
  const diff = now - dayStartMs(start);
  if (diff < 0) return { phase: "before", days: Math.ceil(-diff / DAY_MS) };
  const day = Math.floor(diff / DAY_MS);
  if (day >= DAY_COUNT) return { phase: "ended" };
  const slot = Math.floor((diff - day * DAY_MS) / SLOT_MS);
  return { phase: "live", day: day + 1, slot };
}

/** Focus means the row's position is `DAYS[day-1].focus` (never true on day 4). */
export function fillCounts(appts: readonly KvkBoardAppointment[]): { filled: number; focus: number } {
  let filled = 0;
  let focus = 0;
  for (const a of appts) {
    filled++;
    if (DAYS[a.day - 1]?.focus === a.position) focus++;
  }
  return { filled, focus };
}

/** Non-redacted rows this player holds elsewhere — powers the "also appointed to N other slots" note. */
export function otherSlotsFor(
  appts: readonly KvkBoardAppointment[],
  playerId: string,
  ref: KvkSlotRef,
): number {
  let count = 0;
  for (const a of appts) {
    if (isRedacted(a)) continue;
    if (a.day === ref.day && a.position === ref.position && a.slot === ref.slot) continue;
    if (a.player_id === playerId) count++;
  }
  return count;
}

export function firstFreeColor(used: readonly string[]): string {
  return KVK_COLORS.find((c) => !used.includes(c)) ?? KVK_COLORS[0]!;
}

/** Same masking rule as src/index.ts's /api/auth/me handler: first 8 + •••• + last 4. */
export function maskKey(key: string): string {
  return `${key.slice(0, 8)}••••${key.slice(-4)}`;
}

export function signInLink(key: string, origin: string): string {
  return `${origin}/?key=${encodeURIComponent(key)}`;
}
