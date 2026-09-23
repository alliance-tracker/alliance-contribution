import { describe, expect, it } from "vitest";
import {
  DAYS,
  DEFAULT_DAYS,
  KvkValidationError,
  POSITIONS,
  SLOTS,
  daysFromSetting,
  generateKey,
  normalizePlayer,
  parseDays,
  parseSlotRef,
  redactForKeyHolder,
  type KvkAppointmentRow,
  type KvkDay,
} from "../../src/domain/kvk";

const row = (over: Partial<KvkAppointmentRow> = {}): KvkAppointmentRow => ({
  day: 1,
  position: "chief_minister",
  slot: 0,
  key_id: 1,
  player_id: "12345",
  player_name: "Someone",
  created_by: "admin",
  updated_at: 1000,
  ...over,
});

describe("generateKey", () => {
  it("matches the kvk_ + 19 base62 chars shape", () => {
    expect(generateKey()).toMatch(/^kvk_[0-9A-Za-z]{19}$/);
  });

  it("differs across calls", () => {
    expect(generateKey()).not.toBe(generateKey());
  });
});

describe("redactForKeyHolder", () => {
  const appts = [row({ slot: 0, key_id: 1 }), row({ slot: 1, key_id: 2 }), row({ slot: 2, key_id: null })];

  it("leaves rows unchanged in 'all' visibility", () => {
    expect(redactForKeyHolder(appts, 1, "all")).toEqual(appts);
  });

  it("keeps the caller's own rows and redacts everyone else's in 'filled' visibility", () => {
    const result = redactForKeyHolder(appts, 1, "filled");
    expect(result[0]).toEqual(appts[0]);
    expect(result[1]).toEqual({ day: 1, position: "chief_minister", slot: 1, filled: true });
    expect(result[2]).toEqual({ day: 1, position: "chief_minister", slot: 2, filled: true });
  });
});

describe("parseSlotRef", () => {
  it("accepts string route params", () => {
    expect(parseSlotRef("3", "noble_advisor", "47")).toEqual({ day: 3, position: "noble_advisor", slot: 47 });
  });

  it("accepts numeric body values", () => {
    expect(parseSlotRef(1, "chief_minister", 0)).toEqual({ day: 1, position: "chief_minister", slot: 0 });
  });

  it("rejects a day out of range", () => {
    expect(() => parseSlotRef(0, "chief_minister", 0)).toThrow(KvkValidationError);
    expect(() => parseSlotRef(DAYS + 1, "chief_minister", 0)).toThrow(KvkValidationError);
  });

  it("rejects a slot out of range", () => {
    expect(() => parseSlotRef(1, "chief_minister", -1)).toThrow(KvkValidationError);
    expect(() => parseSlotRef(1, "chief_minister", SLOTS)).toThrow(KvkValidationError);
  });

  it("rejects an unknown position", () => {
    expect(() => parseSlotRef(1, "healer", 0)).toThrow(KvkValidationError);
  });

  it("rejects non-integer values", () => {
    expect(() => parseSlotRef(1.5, "chief_minister", 0)).toThrow(KvkValidationError);
    expect(() => parseSlotRef("1.5", "chief_minister", 0)).toThrow(KvkValidationError);
  });

  it("returns a position from the POSITIONS list", () => {
    for (const p of POSITIONS) {
      expect(parseSlotRef(1, p, 0).position).toBe(p);
    }
  });
});

describe("normalizePlayer", () => {
  it("strips non-digit characters from the id and trims the name", () => {
    expect(normalizePlayer(" 12-34a5 ", "  Someone  ")).toEqual({ playerId: "12345", playerName: "Someone" });
  });

  it("rejects a non-string id or name", () => {
    expect(() => normalizePlayer(12345, "Someone")).toThrow(KvkValidationError);
    expect(() => normalizePlayer("12345", 5 as unknown as string)).toThrow(KvkValidationError);
  });

  it("rejects an empty id after stripping non-digits", () => {
    expect(() => normalizePlayer("abc", "Someone")).toThrow(KvkValidationError);
  });

  it("rejects an id over 20 digits", () => {
    expect(() => normalizePlayer("1".repeat(21), "Someone")).toThrow(KvkValidationError);
  });

  it("accepts an id of exactly 20 digits", () => {
    expect(normalizePlayer("1".repeat(20), "Someone").playerId).toBe("1".repeat(20));
  });

  it("rejects an empty name after trimming", () => {
    expect(() => normalizePlayer("12345", "   ")).toThrow(KvkValidationError);
  });

  it("rejects a name over 40 characters", () => {
    expect(() => normalizePlayer("12345", "a".repeat(41))).toThrow(KvkValidationError);
  });

  it("accepts a name of exactly 40 characters", () => {
    expect(normalizePlayer("12345", "a".repeat(40)).playerName).toBe("a".repeat(40));
  });
});

describe("parseDays", () => {
  it("accepts DEFAULT_DAYS", () => {
    expect(parseDays(DEFAULT_DAYS)).toEqual(DEFAULT_DAYS);
  });

  it("rejects a non-array", () => {
    expect(() => parseDays("nope")).toThrow(KvkValidationError);
    expect(() => parseDays(null)).toThrow(KvkValidationError);
  });

  it("rejects fewer than 5 entries", () => {
    expect(() => parseDays(DEFAULT_DAYS.slice(0, 4))).toThrow(KvkValidationError);
  });

  it("rejects more than 5 entries", () => {
    expect(() => parseDays([...DEFAULT_DAYS, DEFAULT_DAYS[0]])).toThrow(KvkValidationError);
  });

  it("rejects an unknown key", () => {
    const days = DEFAULT_DAYS.map((d, i) => (i === 0 ? { key: "healer", shown: d.shown } : d));
    expect(() => parseDays(days)).toThrow(KvkValidationError);
  });

  it("accepts an empty shown when key is null (hides the day)", () => {
    const days = DEFAULT_DAYS.map((d, i) => (i === 0 ? { key: null, shown: [] } : d));
    expect(parseDays(days)[0]).toEqual({ key: null, shown: [] });
  });

  it("rejects an empty shown with a non-null key", () => {
    const days = DEFAULT_DAYS.map((d, i) => (i === 0 ? { key: "chief_minister", shown: [] } : d));
    expect(() => parseDays(days)).toThrow(KvkValidationError);
  });

  it("rejects a duplicate in shown", () => {
    const days = DEFAULT_DAYS.map((d, i) =>
      i === 0 ? { key: null, shown: ["chief_minister", "chief_minister"] } : d,
    );
    expect(() => parseDays(days)).toThrow(KvkValidationError);
  });

  it("rejects an unknown position in shown", () => {
    const days = DEFAULT_DAYS.map((d, i) => (i === 0 ? { key: null, shown: ["healer"] } : d));
    expect(() => parseDays(days)).toThrow(KvkValidationError);
  });

  it("rejects a key that isn't in shown", () => {
    const days = DEFAULT_DAYS.map((d, i) => (i === 0 ? { key: "chief_minister", shown: ["noble_advisor"] } : d));
    expect(() => parseDays(days)).toThrow(KvkValidationError);
  });

  it("reorders shown to POSITIONS order and drops extra fields", () => {
    const days = DEFAULT_DAYS.map((d, i) =>
      i === 0 ? { key: null, shown: ["noble_advisor", "chief_minister"], extra: "drop me" } : d,
    );
    const parsed = parseDays(days);
    expect(parsed[0]).toEqual({ key: null, shown: ["chief_minister", "noble_advisor"] });
  });
});

describe("daysFromSetting", () => {
  const defaultCopy: KvkDay[] = DEFAULT_DAYS.map((d) => ({ key: d.key, shown: [...d.shown] }));

  it("falls back to DEFAULT_DAYS for null, bad JSON, and a valid-JSON-but-invalid shape", () => {
    expect(daysFromSetting(null)).toEqual(defaultCopy);
    expect(daysFromSetting("{")).toEqual(defaultCopy);
    expect(daysFromSetting("[]")).toEqual(defaultCopy);
  });

  it("round-trips a valid string", () => {
    const days: KvkDay[] = [
      { key: "noble_advisor", shown: ["noble_advisor"] },
      ...DEFAULT_DAYS.slice(1),
    ];
    expect(daysFromSetting(JSON.stringify(days))).toEqual(days);
  });
});
