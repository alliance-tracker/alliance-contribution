import { describe, expect, it } from "vitest";
import type { KvkAppointmentRow, KvkBoardAppointment, KvkRedactedAppointment } from "../../shared/types";
import {
  currentDaySlot,
  dayIso,
  fillCounts,
  firstFreeColor,
  holderCanEdit,
  KVK_COLORS,
  maskKey,
  otherSlotsFor,
  signInLink,
  slotLabel,
} from "../../web/src/lib/kvk";

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
  it("counts filled slots and focus slots, day 4 never counting toward focus", () => {
    const appts: KvkBoardAppointment[] = [
      row({ day: 1, position: "chief_minister", slot: 0 }), // focus day, matching position
      row({ day: 1, position: "noble_advisor", slot: 1 }), // focus day, non-focus position
      row({ day: 4, position: "chief_minister", slot: 0 }), // no-focus day
      row({ day: 4, position: "noble_advisor", slot: 1 }), // no-focus day
    ];
    expect(fillCounts(appts)).toEqual({ filled: 4, focus: 1 });
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
