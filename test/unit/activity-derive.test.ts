import { describe, expect, it } from "vitest";
import type { ActivityDetail, ActivityEventRow, ActivityType } from "../../shared/types";
import { dayRows, instanceStats, memberRows, valueSeries } from "../../web/src/lib/activity-derive";

const bear: ActivityType = {
  id: 1, key: "bear_trap", name: "Bear Trap", unit_label: "damage", weight: 1,
  max_instance: 4, // deliberately > 2: nothing may assume two traps
  min_value: 0, active: 1, sort: 1, color: "amber",
};

function ev(partial: Partial<ActivityEventRow> & Pick<ActivityEventRow, "id" | "date" | "instance">): ActivityEventRow {
  return { week: "2028-W09", participants: 0, unmapped: 0, total_value: 0, total_points: 0, ...partial };
}

const detail: ActivityDetail = {
  activity: bear,
  event_days: 2,
  events: [
    ev({ id: 1, date: "2028-03-01", instance: 1, participants: 10, unmapped: 1, total_value: 100, total_points: 10 }),
    ev({ id: 2, date: "2028-03-01", instance: 2, participants: 8, total_value: 80, total_points: 8 }),
    ev({ id: 3, date: "2028-03-03", instance: 2, participants: 6, total_value: 60, total_points: 6 }),
  ],
  members: [
    { member_id: 7, governor: "Alice", alliance_rank: "R3", appearances: 2, total_value: 120, total_points: 12 },
    { member_id: 8, governor: "Bob", alliance_rank: null, appearances: 1, total_value: 40, total_points: 4 },
  ],
};

describe("dayRows", () => {
  it("collapses instances into one row per date, newest first, summing across instances", () => {
    const rows = dayRows(detail);
    expect(rows.map((r) => r.date)).toEqual(["2028-03-03", "2028-03-01"]);
    expect(rows[1]).toMatchObject({ participants: 18, unmapped: 1, total_value: 180, total_points: 18 });
    expect(rows[1].byInstance[0]?.id).toBe(1);
    expect(rows[1].byInstance[1]?.id).toBe(2);
  });

  it("leaves a missing instance undefined and pads byInstance to max_instance", () => {
    const day = dayRows(detail)[0]; // 2028-03-03, only instance 2
    expect(day.byInstance).toHaveLength(4);
    expect(day.byInstance[0]).toBeUndefined();
    expect(day.byInstance[1]?.id).toBe(3);
    expect(day.byInstance[2]).toBeUndefined();
  });
});

describe("instanceStats", () => {
  it("zero-fills every instance up to max_instance and averages over events logged", () => {
    const stats = instanceStats(detail);
    expect(stats.map((s) => s.instance)).toEqual([1, 2, 3, 4]);
    expect(stats[0]).toEqual({ instance: 1, events: 1, avg_participants: 10, avg_value: 100, total_value: 100 });
    expect(stats[1]).toEqual({ instance: 2, events: 2, avg_participants: 7, avg_value: 70, total_value: 140 });
    expect(stats[3]).toEqual({ instance: 4, events: 0, avg_participants: 0, avg_value: 0, total_value: 0 });
  });
});

describe("valueSeries", () => {
  it("is ascending by date with null for an instance not logged that day", () => {
    const series = valueSeries(detail);
    expect(series.map((p) => p.date)).toEqual(["2028-03-01", "2028-03-03"]);
    expect(series[0]).toMatchObject({ total: 180, i1: 100, i2: 80, i3: null, i4: null });
    expect(series[1]).toMatchObject({ total: 60, i1: null, i2: 60 });
  });
});

describe("memberRows", () => {
  it("adds attendance pct and average value per appearance", () => {
    const rows = memberRows(detail);
    expect(rows[0]).toMatchObject({ governor: "Alice", pct: 1, avg_value: 60 });
    expect(rows[1]).toMatchObject({ governor: "Bob", pct: 0.5, avg_value: 40 });
  });

  it("returns pct 0 when there are no event days", () => {
    const rows = memberRows({ ...detail, event_days: 0 });
    expect(rows.every((r) => r.pct === 0)).toBe(true);
  });
});
