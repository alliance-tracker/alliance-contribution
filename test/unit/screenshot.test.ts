import { describe, expect, it } from "vitest";
import {
  eventPrompt,
  finishReasonOk,
  isAllowanceError,
  nextUtcMidnight,
  parseModelOutput,
  readAiConfig,
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
    expect(s).toEqual({ used: 312, limit: 10_000, requests: 60, resetsAt: "2026-09-07T00:00:00.000Z", perRead: 5, reserve: 50, requestCap: 400 });
  });
});

describe("readAiConfig", () => {
  it("returns the defaults when no var is set", () => {
    expect(readAiConfig({})).toEqual({
      model: "@cf/google/gemma-4-26b-a4b-it",
      dailyNeuronLimit: 10_000,
      neuronsPerRead: 5,
      reserveNeurons: 50,
      dailyRequestCap: 400,
      maxTokens: 2500,
      thinking: false,
    });
  });
  it("applies overrides field by field and ignores garbage", () => {
    const cfg = readAiConfig({
      AI_MODEL: " @cf/meta/llama-4-scout-17b-16e-instruct ",
      AI_DAILY_NEURON_LIMIT: "50000",
      AI_NEURONS_PER_READ: "abc",
      AI_RESERVE_NEURONS: "-5",
      AI_DAILY_REQUEST_CAP: "",
      AI_MAX_TOKENS: "4000",
      AI_THINKING: "true",
    });
    expect(cfg).toEqual({
      model: "@cf/meta/llama-4-scout-17b-16e-instruct",
      dailyNeuronLimit: 50_000,
      neuronsPerRead: 5,
      reserveNeurons: 50,
      dailyRequestCap: 400,
      maxTokens: 4000,
      thinking: true,
    });
  });
  it("usageSnapshot follows the config", () => {
    const cfg = readAiConfig({ AI_DAILY_NEURON_LIMIT: "50000", AI_NEURONS_PER_READ: "8", AI_RESERVE_NEURONS: "100", AI_DAILY_REQUEST_CAP: "900" });
    expect(usageSnapshot({ neurons: 1, requests: 1 }, new Date("2026-09-06T10:00:00Z"), cfg)).toMatchObject({ limit: 50_000, perRead: 8, reserve: 100, requestCap: 900 });
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
  it("keeps well-formed roster lines and fills a missing position cell", () => {
    const text = "Aurora\tR5\t164497800\t1\nBlaze\tR4\t120000000\nCorsica\t\t\t3\nJunk";
    expect(parseModelOutput("roster", text)).toEqual({
      kind: "rows",
      lines: ["Aurora\tR5\t164497800\t1", "Blaze\tR4\t120000000\t"],
    });
  });
  it("reorders roster cells by shape when the model puts the position first or repeats it", () => {
    const text = "25\tR3\tYouOweMeAFizzy\t59585617\n65\tR1\tQueen Esme\t38403670\t65\nMr Spiklitz\tR4\t73126320\t10";
    expect(parseModelOutput("roster", text)).toEqual({
      kind: "rows",
      lines: ["YouOweMeAFizzy\tR3\t59585617\t25", "Queen Esme\tR1\t38403670\t65", "Mr Spiklitz\tR4\t73126320\t10"],
    });
  });
  it("keeps CJK and spaced governors intact when reordering", () => {
    expect(parseModelOutput("roster", "56\tR2\t梅利奥达斯 Meliodas\t45790931")).toEqual({
      kind: "rows",
      lines: ["梅利奥达斯 Meliodas\tR2\t45790931\t56"],
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
