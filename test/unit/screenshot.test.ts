import { describe, expect, it } from "vitest";
import {
  eventPrompt,
  finishReasonOk,
  isAllowanceError,
  nextUtcMidnight,
  parseModelOutput,
  rosterPrompt,
  toBase64,
  usageSnapshot,
  utcDay,
} from "../../src/domain/screenshot";

describe("utc day helpers", () => {
  it("utcDay uses the UTC date, not local", () => {
    expect(utcDay(new Date("2026-09-06T23:30:00Z"))).toBe("2026-09-06");
    expect(utcDay(new Date("2026-09-07T00:00:00Z"))).toBe("2026-09-07");
  });
  it("nextUtcMidnight is the following 00:00Z", () => {
    expect(nextUtcMidnight(new Date("2026-09-06T23:59:59Z"))).toBe("2026-09-07T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-12-31T10:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
  it("usageSnapshot rounds neurons and carries the limit and reset", () => {
    const s = usageSnapshot({ neurons: 312.4, requests: 60 }, new Date("2026-09-06T10:00:00Z"));
    expect(s).toEqual({ used: 312, limit: 10_000, requests: 60, resetsAt: "2026-09-07T00:00:00.000Z" });
  });
});

describe("prompts", () => {
  it("event prompt names the unit and the sentinel", () => {
    const p = eventPrompt("Damage");
    expect(p).toContain("Damage");
    expect(p).toContain("NOT_A_RANKING_SCREEN");
    expect(p).toContain("Name<TAB>Value<TAB>Notes");
  });
  it("roster prompt asks for four cells and skips the pinned row", () => {
    const p = rosterPrompt();
    expect(p).toContain("Governor<TAB>Rank<TAB>Power<TAB>Position");
    expect(p).toContain("NOT_A_ROSTER_SCREEN");
    expect(p.toLowerCase()).toContain("pinned");
  });
});

describe("parseModelOutput", () => {
  it("strips fences and blank lines, keeps event rows with 2+ cells (notes pass through)", () => {
    const text = "```\nAurora\t120000\n\nBlaze\t95000\t47/48\nJunk\n```";
    expect(parseModelOutput("event", text)).toEqual({
      kind: "rows",
      lines: ["Aurora\t120000", "Blaze\t95000\t47/48"],
    });
  });
  it("trims cells but does not touch tags or names", () => {
    expect(parseModelOutput("event", "[iCEJkoyoterock cl \t 217470843 ")).toEqual({
      kind: "rows",
      lines: ["[iCEJkoyoterock cl\t217470843"],
    });
  });
  it("drops roster lines with fewer than 4 cells", () => {
    const text = "Aurora\tR5\t164497800\t1\nBlaze\tR4\t120000000\nCorsica\t\t\t3";
    expect(parseModelOutput("roster", text)).toEqual({
      kind: "rows",
      lines: ["Aurora\tR5\t164497800\t1", "Corsica\t\t\t3"],
    });
  });
  it("returns not_a_screen on the sentinel or on zero surviving lines", () => {
    expect(parseModelOutput("event", "NOT_A_RANKING_SCREEN")).toEqual({ kind: "not_a_screen" });
    expect(parseModelOutput("roster", "This image shows a castle.")).toEqual({ kind: "not_a_screen" });
    expect(parseModelOutput("event", "")).toEqual({ kind: "not_a_screen" });
  });
  it("drops lines with an empty first cell", () => {
    expect(parseModelOutput("event", "\t123\nAurora\t1")).toEqual({ kind: "rows", lines: ["Aurora\t1"] });
  });
});

describe("error helpers", () => {
  it("recognises the 4006 allowance error by code in the message", () => {
    expect(isAllowanceError(new Error("4006: daily free allocation exhausted"))).toBe(true);
    expect(isAllowanceError(new Error("5016: agree to the licence"))).toBe(false);
    expect(isAllowanceError("boom")).toBe(false);
  });
  it("finishReasonOk rejects truncation only", () => {
    expect(finishReasonOk("stop")).toBe(true);
    expect(finishReasonOk(undefined)).toBe(true);
    expect(finishReasonOk("length")).toBe(false);
  });
  it("toBase64 encodes bytes", () => {
    expect(toBase64(Uint8Array.from([104, 105]).buffer as ArrayBuffer)).toBe("aGk=");
  });
});
