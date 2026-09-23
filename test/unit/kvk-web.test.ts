import { describe, expect, it } from "vitest";
import type { KvkAppointmentRow, KvkBoardAppointment, KvkDay, KvkRedactedAppointment } from "../../shared/types";
import {
  canToggleShown,
  currentDaySlot,
  dayIso,
  fillCounts,
  firstFreeColor,
  gridStyle,
  holderCanEdit,
  KVK_COLORS,
  maskKey,
  otherSlotsFor,
  setDayKey,
  shownDays,
  signInLink,
  slotLabel,
  slotTotals,
  toggleShown,
} from "../../web/src/lib/kvk";

const DEFAULT_DAYS: KvkDay[] = [
  { key: "chief_minister", shown: ["chief_minister", "noble_advisor"] },
  { key: "chief_minister", shown: ["chief_minister", "noble_advisor"] },
  { key: "noble_advisor", shown: ["chief_minister", "noble_advisor"] },
  { key: null, shown: ["chief_minister", "noble_advisor"] },
  { key: "chief_minister", shown: ["chief_minister", "noble_advisor"] },
];

function row(over: Partial<KvkAppointmentRow> = {}): KvkAppointmentRow {
  return {
    day: 1,
    position: "chief_minister",
    slot: 0,
    key_id: 1,
    player_id: "12345",
    player_name: "Someone",
    created_by: "admin",
    updated_at: 1000,
    ...over,
  };
}

function redacted(over: Partial<KvkRedactedAppointment> = {}): KvkRedactedAppointment {
  return { day: 1, position: "chief_minister", slot: 0, filled: true, ...over };
}

describe("slotLabel", () => {
  it("labels slot 0 as the first half hour", () => {
    expect(slotLabel(0)).toEqual({ start: "00:00", end: "00:30" });
  });

  it("labels slot 29 as 14:30-15:00", () => {
    expect(slotLabel(29)).toEqual({ start: "14:30", end: "15:00" });
  });

  it("wraps the last slot's end to 00:00, not 24:00", () => {
    expect(slotLabel(47)).toEqual({ start: "23:30", end: "00:00" });
  });
});

describe("currentDaySlot", () => {
  const start = "2026-10-01";
  const startMs = Date.UTC(2026, 9, 1);
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("returns null when the event has no start date", () => {
    expect(currentDaySlot(null, startMs)).toBeNull();
  });

  it("returns before with the ceiling of whole days remaining", () => {
    expect(currentDaySlot(start, startMs - 1.5 * DAY_MS)).toEqual({ phase: "before", days: 2 });
  });

  it("is day 1 slot 0 at the first instant", () => {
    expect(currentDaySlot(start, startMs)).toEqual({ phase: "live", day: 1, slot: 0 });
  });

  it("is day 5 slot 47 at the last slot of day 5", () => {
    const lastSlotMs = startMs + 4 * DAY_MS + 47 * 30 * 60 * 1000;
    expect(currentDaySlot(start, lastSlotMs)).toEqual({ phase: "live", day: 5, slot: 47 });
  });

  it("has ended the instant after the last slot of day 5", () => {
    expect(currentDaySlot(start, startMs + 5 * DAY_MS)).toEqual({ phase: "ended" });
  });
});

describe("dayIso", () => {
  it("carries day arithmetic across a month end in UTC", () => {
    expect(dayIso("2026-09-29", 1)).toBe("2026-09-29");
    expect(dayIso("2026-09-29", 3)).toBe("2026-10-01");
    expect(dayIso("2026-09-29", 5)).toBe("2026-10-03");
  });
});

describe("fillCounts", () => {
  it("counts filled slots and focus slots, day 4 never counting toward focus with default days", () => {
    const appts: KvkBoardAppointment[] = [
      row({ day: 1, position: "chief_minister", slot: 0 }), // focus day, matching position
      row({ day: 1, position: "noble_advisor", slot: 1 }), // focus day, non-focus position
      row({ day: 4, position: "chief_minister", slot: 0 }), // no-focus day
      row({ day: 4, position: "noble_advisor", slot: 1 }), // no-focus day
    ];
    expect(fillCounts(appts, DEFAULT_DAYS)).toEqual({ filled: 4, focus: 1 });
  });

  it("counts focus per the day's configured key position", () => {
    const days: KvkDay[] = DEFAULT_DAYS.map((d, i) => (i === 3 ? { ...d, key: "chief_minister" } : d));
    const appts: KvkBoardAppointment[] = [
      row({ day: 4, position: "chief_minister", slot: 0 }), // now a focus day
      row({ day: 4, position: "noble_advisor", slot: 1 }), // still not the key position
    ];
    expect(fillCounts(appts, days)).toEqual({ filled: 2, focus: 1 });
  });
});

describe("slotTotals", () => {
  it("returns 480/192 for the defaults", () => {
    expect(slotTotals(DEFAULT_DAYS)).toEqual({ total: 480, focusTotal: 192 });
  });

  it("drops a day's total when a position is hidden, and its focus total when key is null", () => {
    const days: KvkDay[] = [{ key: null, shown: ["chief_minister"] }, ...DEFAULT_DAYS.slice(1)];
    expect(slotTotals(days)).toEqual({ total: 432, focusTotal: 144 });
  });

  it("a hidden day (empty shown) contributes 0 to both totals", () => {
    const days: KvkDay[] = [{ key: null, shown: [] }, ...DEFAULT_DAYS.slice(1)];
    expect(slotTotals(days)).toEqual({ total: 384, focusTotal: 144 });
  });
});

describe("shownDays", () => {
  it("returns all 5 days for the defaults", () => {
    expect(shownDays(DEFAULT_DAYS)).toEqual([1, 2, 3, 4, 5]);
  });

  it("omits a day with an empty shown", () => {
    const days: KvkDay[] = [{ key: null, shown: [] }, ...DEFAULT_DAYS.slice(1)];
    expect(shownDays(days)).toEqual([2, 3, 4, 5]);
  });

  it("is empty when every day is hidden", () => {
    const days: KvkDay[] = DEFAULT_DAYS.map(() => ({ key: null, shown: [] }));
    expect(shownDays(days)).toEqual([]);
  });
});

describe("gridStyle", () => {
  it("builds today's desktop 10-column layout", () => {
    expect(gridStyle(10, false)).toEqual({
      gridTemplateColumns: "84px repeat(10,minmax(118px,1fr))",
      minWidth: "1264px",
    });
  });

  it("builds a compact single-column layout with no minWidth", () => {
    expect(gridStyle(1, true)).toEqual({ gridTemplateColumns: "58px repeat(1,1fr)" });
  });
});

describe("setDayKey", () => {
  it("choosing NA on a CM-only day adds NA to shown, in POSITIONS order", () => {
    const days: KvkDay[] = [{ key: "chief_minister", shown: ["chief_minister"] }, ...DEFAULT_DAYS.slice(1)];
    const next = setDayKey(days, 1, "noble_advisor");
    expect(next[0]).toEqual({ key: "noble_advisor", shown: ["chief_minister", "noble_advisor"] });
    expect(next.slice(1)).toEqual(days.slice(1));
  });

  it("setting null leaves shown as it is", () => {
    const next = setDayKey(DEFAULT_DAYS, 1, null);
    expect(next[0]).toEqual({ key: null, shown: ["chief_minister", "noble_advisor"] });
  });

  it("a key already in shown doesn't reorder shown", () => {
    const days: KvkDay[] = [{ key: null, shown: ["noble_advisor", "chief_minister"] }, ...DEFAULT_DAYS.slice(1)];
    const next = setDayKey(days, 1, "chief_minister");
    expect(next[0]).toEqual({ key: "chief_minister", shown: ["noble_advisor", "chief_minister"] });
  });
});

describe("toggleShown", () => {
  it("removes a shown position", () => {
    const next = toggleShown(DEFAULT_DAYS, 4, "noble_advisor");
    expect(next[3]).toEqual({ key: null, shown: ["chief_minister"] });
  });

  it("adds a hidden position back in POSITIONS order regardless of prior order", () => {
    const days: KvkDay[] = [{ key: null, shown: ["noble_advisor"] }, ...DEFAULT_DAYS.slice(1)];
    const next = toggleShown(days, 1, "chief_minister");
    expect(next[0]).toEqual({ key: null, shown: ["chief_minister", "noble_advisor"] });
  });

  it("only touches the targeted day", () => {
    const next = toggleShown(DEFAULT_DAYS, 1, "noble_advisor");
    expect(next.slice(1)).toEqual(DEFAULT_DAYS.slice(1));
  });
});

describe("canToggleShown", () => {
  it("is false for the key position", () => {
    expect(canToggleShown({ key: "chief_minister", shown: ["chief_minister", "noble_advisor"] }, "chief_minister")).toBe(false);
  });

  it("is true for the last shown position when it isn't the key (hiding it hides the day)", () => {
    expect(canToggleShown({ key: null, shown: ["noble_advisor"] }, "noble_advisor")).toBe(true);
  });

  it("is true otherwise", () => {
    expect(canToggleShown({ key: "chief_minister", shown: ["chief_minister", "noble_advisor"] }, "noble_advisor")).toBe(true);
  });

  it("acceptance sequence: key CM locks CM; key None + hide NA + hide CM empties shown; re-showing un-hides", () => {
    let days: KvkDay[] = [{ key: "chief_minister", shown: ["chief_minister", "noble_advisor"] }, ...DEFAULT_DAYS.slice(1)];
    expect(canToggleShown(days[0]!, "chief_minister")).toBe(false); // 1. key CM → hiding CM disabled

    days = setDayKey(days, 1, null);
    days = toggleShown(days, 1, "noble_advisor"); // hide NA
    expect(canToggleShown(days[0]!, "chief_minister")).toBe(true);
    days = toggleShown(days, 1, "chief_minister"); // hide CM
    expect(days[0]).toEqual({ key: null, shown: [] }); // 2. shown = [], day hidden

    days = toggleShown(days, 1, "chief_minister"); // 3. re-showing un-hides
    expect(days[0]).toEqual({ key: null, shown: ["chief_minister"] });
  });
});

describe("otherSlotsFor", () => {
  it("counts non-redacted rows with the same player, excluding the ref slot and redacted rows", () => {
    const appts: KvkBoardAppointment[] = [
      row({ day: 1, position: "chief_minister", slot: 0, player_id: "12345" }), // this is ref
      row({ day: 1, position: "chief_minister", slot: 1, player_id: "12345" }), // counts
      row({ day: 1, position: "noble_advisor", slot: 2, player_id: "12345" }), // counts
      row({ day: 1, position: "noble_advisor", slot: 3, player_id: "99999" }), // different player
      redacted({ day: 1, position: "chief_minister", slot: 4 }), // redacted, ignored even if it matched
    ];
    const ref = { day: 1, position: "chief_minister" as const, slot: 0 };
    expect(otherSlotsFor(appts, "12345", ref)).toBe(2);
  });
});

describe("firstFreeColor", () => {
  it("returns the first palette colour not already used", () => {
    expect(firstFreeColor([KVK_COLORS[0]!, KVK_COLORS[1]!])).toBe(KVK_COLORS[2]);
  });

  it("falls back to the first colour when every colour is taken", () => {
    expect(firstFreeColor(KVK_COLORS)).toBe(KVK_COLORS[0]);
  });
});

describe("maskKey", () => {
  it("keeps the first 8 and last 4 characters, masking the middle", () => {
    expect(maskKey("kvk_7Q2mABCDEFGHIJc9Xf")).toBe("kvk_7Q2m••••c9Xf");
  });
});

describe("signInLink", () => {
  it("builds a key-prefilled sign-in URL", () => {
    expect(signInLink("kvk_abc def", "https://tracker.example")).toBe(
      "https://tracker.example/?key=kvk_abc%20def",
    );
  });
});

describe("holderCanEdit", () => {
  it("allows a free slot and the holder's own row", () => {
    expect(holderCanEdit(null, 1)).toBe(true);
    expect(holderCanEdit(row({ key_id: 1 }), 1)).toBe(true);
  });

  it("refuses another alliance's row, a redacted row and a deleted key's row", () => {
    expect(holderCanEdit(row({ key_id: 2 }), 1)).toBe(false);
    expect(holderCanEdit(redacted(), 1)).toBe(false);
    expect(holderCanEdit(row({ key_id: null }), 1)).toBe(false);
  });
});
