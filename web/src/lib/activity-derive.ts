import type { ActivityDetail, ActivityEventRow, ActivityMemberRow } from "../../../shared/types";

// Pure derivations for the Activity page. The API returns flat per-event and per-member rows; the
// date grouping, per-instance stats, and chart series live here so they are unit-tested without D1.
// Instances are 1..max_instance from the activity row — never a hard-coded 2.

export type DayRow = {
  date: string;
  week: string;
  byInstance: (ActivityEventRow | undefined)[]; // index 0 = instance 1; undefined = not logged that day
  participants: number;
  unmapped: number;
  total_value: number;
  total_points: number;
};

export type InstanceStat = {
  instance: number;
  events: number;
  avg_participants: number; // over events logged, not over event days
  avg_value: number;
  total_value: number;
};

export type SeriesPoint = { date: string; total: number } & Record<`i${number}`, number | null>;

export type MemberRow = ActivityMemberRow & { pct: number; avg_value: number };

function groupByDate(detail: ActivityDetail): Map<string, ActivityEventRow[]> {
  const groups = new Map<string, ActivityEventRow[]>();
  for (const e of detail.events) {
    const list = groups.get(e.date) ?? [];
    list.push(e);
    groups.set(e.date, list);
  }
  return groups; // insertion order = ascending date (API sorts by date, instance)
}

/** One row per date, newest first; totals summed across instances. */
export function dayRows(detail: ActivityDetail): DayRow[] {
  const max = detail.activity.max_instance;
  const rows: DayRow[] = [];
  for (const [date, events] of groupByDate(detail)) {
    const byInstance: (ActivityEventRow | undefined)[] = Array.from({ length: max }, () => undefined);
    for (const e of events) if (e.instance >= 1 && e.instance <= max) byInstance[e.instance - 1] = e;
    rows.push({
      date,
      week: events[0].week,
      byInstance,
      participants: events.reduce((s, e) => s + e.participants, 0),
      unmapped: events.reduce((s, e) => s + e.unmapped, 0),
      total_value: events.reduce((s, e) => s + e.total_value, 0),
      total_points: events.reduce((s, e) => s + e.total_points, 0),
    });
  }
  return rows.reverse();
}

/** Per-instance summary for 1..max_instance, zero-filled when an instance was never logged. */
export function instanceStats(detail: ActivityDetail): InstanceStat[] {
  return Array.from({ length: detail.activity.max_instance }, (_, i) => {
    const instance = i + 1;
    const events = detail.events.filter((e) => e.instance === instance);
    const n = events.length;
    const total_value = events.reduce((s, e) => s + e.total_value, 0);
    const participants = events.reduce((s, e) => s + e.participants, 0);
    return {
      instance,
      events: n,
      avg_participants: n ? participants / n : 0,
      avg_value: n ? total_value / n : 0,
      total_value,
    };
  });
}

/** Chart input, ascending by date. `i<n>` is null when instance n wasn't logged that day (chart gap). */
export function valueSeries(detail: ActivityDetail): SeriesPoint[] {
  const max = detail.activity.max_instance;
  const out: SeriesPoint[] = [];
  for (const [date, events] of groupByDate(detail)) {
    const point = { date, total: 0 } as SeriesPoint;
    for (let n = 1; n <= max; n++) point[`i${n}`] = null;
    for (const e of events) {
      point[`i${e.instance}`] = e.total_value;
      point.total += e.total_value;
    }
    out.push(point);
  }
  return out;
}

/** Member totals with attendance pct (appearances / event days) and average value per appearance. */
export function memberRows(detail: ActivityDetail): MemberRow[] {
  return detail.members.map((m) => ({
    ...m,
    pct: detail.event_days > 0 ? m.appearances / detail.event_days : 0,
    avg_value: m.appearances > 0 ? m.total_value / m.appearances : 0,
  }));
}
