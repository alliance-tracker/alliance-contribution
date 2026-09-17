import type { TFunction } from "i18next";
import type { ScheduleUnit } from "@shared/types";
import { localeTag } from "./format";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * D1 writes `datetime('now')` as "YYYY-MM-DD HH:MM:SS" — UTC, but without the marker `Date` needs,
 * so a bare stamp would otherwise be read as local time. Already-marked ISO strings pass through.
 */
export function toDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
}

/** "45 min" · "3 h" · "2 h 30 min" · "3 d" — coarsest unit that divides evenly. */
export function formatDuration(minutes: number, t: TFunction): string {
  if (minutes < 60) return t("schedule.format.minutes", { count: minutes });
  if (minutes % 1440 === 0) return t("schedule.format.days", { count: minutes / 1440 });
  if (minutes % 60 === 0) return t("schedule.format.hours", { count: minutes / 60 });
  return t("schedule.format.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** "every day" · "every 2 days" · "every week" · "every 3 weeks". */
export function formatRepeat(every: number, unit: ScheduleUnit, t: TFunction): string {
  if (every === 1) return unit === "week" ? t("schedule.format.everyWeek") : t("schedule.format.everyDay");
  return unit === "week"
    ? t("schedule.format.everyWeeks", { count: every })
    : t("schedule.format.everyDays", { count: every });
}

/** "in 2 d" · "15 min ago". Deliberately coarse — the exact instant is in the column beside it. */
export function relativeTime(iso: string, t: TFunction, now: number = Date.now()): string {
  const diff = toDate(iso).getTime() - now;
  const abs = Math.abs(diff);
  const value =
    abs < HOUR
      ? t("schedule.format.minutes", { count: Math.round(abs / MINUTE) })
      : abs < DAY
        ? t("schedule.format.hours", { count: Math.round(abs / HOUR) })
        : t("schedule.format.days", { count: Math.round(abs / DAY) });
  return diff < 0 ? t("schedule.format.ago", { value }) : t("schedule.format.in", { value });
}

/** "at start" · "15 min before" · "2 h after start". `minutes_before` is negative for after-start. */
export function whenLabel(minutesBefore: number, t: TFunction): string {
  if (minutesBefore === 0) return t("schedule.format.atStart");
  const duration = formatDuration(Math.abs(minutesBefore), t);
  return minutesBefore > 0
    ? t("schedule.format.beforeStart", { duration })
    : t("schedule.format.afterStart", { duration });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO UTC instant → the `<input type="date">` / `<input type="time">` pair in the browser's zone. */
export function toLocalInputs(iso: string): { date: string; time: string } {
  const d = toDate(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** The pair back to an ISO UTC instant; "" when the inputs don't parse (empty date, mid-typing). */
export function fromLocalInputs(date: string, time: string): string {
  const d = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Local-time display of an occurrence; all-day events drop the clock. */
export function formatLocal(iso: string, allDay: boolean): string {
  return toDate(iso).toLocaleString(
    localeTag(),
    allDay
      ? { weekday: "short", day: "numeric", month: "short" }
      : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  );
}

/** The browser's IANA zone, shown beside every local time so "local" is never ambiguous. */
export const localZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
