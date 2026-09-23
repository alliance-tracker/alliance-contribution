// Pure KvK Prep helpers — no path aliases, no JSX (test/unit/ imports this directly). Mirrors the
// shapes and rules of src/domain/kvk.ts, but for the SPA's read-model derivations.

import type { KvkBoardAppointment, KvkDay, KvkPosition, KvkRedactedAppointment } from "../../../shared/types";
import { POSITIONS } from "../../../shared/types";

export { POSITIONS } from "../../../shared/types";

export const DAY_COUNT = 5;
export const SLOTS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 30 * 60 * 1000;

export type KvkDayTheme = "construction" | "research" | "training" | "none" | "finalPush";

/** Day themes (Construction, Research, …) are fixed game facts, not configuration — unlike key/shown
 *  positions, which come from `event.days` (`shared/types.ts`'s `KvkDay`). */
export const DAYS: readonly { theme: KvkDayTheme }[] = [
  { theme: "construction" },
  { theme: "research" },
  { theme: "training" },
  { theme: "none" },
  { theme: "finalPush" },
];

/** Header totals from the per-day config: `total` = every shown column's 48 slots, `focusTotal` =
 *  only the days with a key position. Defaults: 480 / 192. */
export function slotTotals(days: readonly KvkDay[]): { total: number; focusTotal: number } {
  let total = 0;
  let focusTotal = 0;
  for (const d of days) {
    total += d.shown.length * SLOTS;
    if (d.key !== null) focusTotal += SLOTS;
  }
  return { total, focusTotal };
}

/** Grid column template as an inline style — Tailwind statically scans class names, so it can't see a
 *  runtime-built `grid-cols-[...]`, and a fixed map of 1-10 columns would just be ten literals for the
 *  same thing. Desktop keeps today's 84px time column / 118px min day columns; compact (mobile day
 *  view) drops the min-width and shrinks the time column to 58px. */
export function gridStyle(columns: number, compact: boolean): { gridTemplateColumns: string; minWidth?: string } {
  if (compact) return { gridTemplateColumns: `58px repeat(${columns},1fr)` };
  return { gridTemplateColumns: `84px repeat(${columns},minmax(118px,1fr))`, minWidth: `${84 + 118 * columns}px` };
}

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

/** Focus means the row's position is that day's key position (`days[day-1].key`). */
export function fillCounts(
  appts: readonly KvkBoardAppointment[],
  days: readonly KvkDay[],
): { filled: number; focus: number } {
  let filled = 0;
  let focus = 0;
  for (const a of appts) {
    filled++;
    if (days[a.day - 1]?.key === a.position) focus++;
  }
  return { filled, focus };
}

/** Sets day `day`'s (1-indexed) key position. A non-null key not already in `shown` is added, kept in
 *  `POSITIONS` order; `null` leaves `shown` as it is. Event settings' key picker. */
export function setDayKey(days: readonly KvkDay[], day: number, key: KvkPosition | null): KvkDay[] {
  return days.map((d, i) => {
    if (i !== day - 1) return d;
    const shown = key !== null && !d.shown.includes(key) ? POSITIONS.filter((p) => d.shown.includes(p) || p === key) : d.shown;
    return { key, shown };
  });
}

/** Adds or removes `position` from day `day`'s (1-indexed) `shown`, kept in `POSITIONS` order. Event
 *  settings' show/hide toggles; callers gate this on `canToggleShown`. */
export function toggleShown(days: readonly KvkDay[], day: number, position: KvkPosition): KvkDay[] {
  return days.map((d, i) => {
    if (i !== day - 1) return d;
    const shown = d.shown.includes(position)
      ? d.shown.filter((p) => p !== position)
      : POSITIONS.filter((p) => d.shown.includes(p) || p === position);
    return { ...d, shown };
  });
}

/** A show toggle is disabled for the day's key position (can't hide it) and for the last shown
 *  position (a day always shows at least one column). */
export function canToggleShown(d: KvkDay, position: KvkPosition): boolean {
  if (position === d.key) return false;
  return !(d.shown.length === 1 && d.shown[0] === position);
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
