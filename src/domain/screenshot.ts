import { EVENT_SENTINEL, ROSTER_SENTINEL } from "../../shared/prompts";
import { DEFAULT_AI_CONFIG, type AiConfig, type AiEnvKey, type ScreenshotKind, type ScreenshotUsage } from "../../shared/types";

// Pure helpers for the screenshot-read flow. No DB, no fetch.

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export function usageSnapshot(
  row: { neurons: number; requests: number },
  now: Date,
  cfg: AiConfig = DEFAULT_AI_CONFIG,
): ScreenshotUsage {
  return {
    used: Math.round(row.neurons),
    limit: cfg.dailyNeuronLimit,
    requests: row.requests,
    resetsAt: nextUtcMidnight(now),
    perRead: cfg.neuronsPerRead,
    reserve: cfg.reserveNeurons,
    requestCap: cfg.dailyRequestCap,
  };
}

/** Worker vars override the defaults one by one. A var that is unset, blank, or not a positive number
 *  falls back to the default for that field rather than breaking the reader. */
export function readAiConfig(env: Partial<Record<AiEnvKey, string>>): AiConfig {
  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const d = DEFAULT_AI_CONFIG;
  return {
    model: env.AI_MODEL?.trim() || d.model,
    dailyNeuronLimit: num(env.AI_DAILY_NEURON_LIMIT, d.dailyNeuronLimit),
    neuronsPerRead: num(env.AI_NEURONS_PER_READ, d.neuronsPerRead),
    reserveNeurons: num(env.AI_RESERVE_NEURONS, d.reserveNeurons),
    dailyRequestCap: num(env.AI_DAILY_REQUEST_CAP, d.dailyRequestCap),
    maxTokens: num(env.AI_MAX_TOKENS, d.maxTokens),
    thinking: /^(1|true|yes|on)$/i.test(env.AI_THINKING?.trim() ?? ""),
  };
}

// Prompts live in shared/prompts.ts so the copyable chat prompt and this per-image one share their
// column rules. Kept under the old names for the service and tests.
export { eventReadPrompt as eventPrompt, rosterReadPrompt as rosterPrompt } from "../../shared/prompts";

export type ParsedModelOutput = { kind: "rows"; lines: string[] } | { kind: "not_a_screen" };

const SENTINEL: Record<ScreenshotKind, string> = { event: EVENT_SENTINEL, roster: ROSTER_SENTINEL };

const RANK_RE = /^R[1-5]$/i;
const POSITION_RE = /^\d{1,3}$/;
const POWER_RE = /^\d{4,}$/;

/** Reassemble a roster line as `Governor<TAB>Rank<TAB>Power<TAB>Position` whatever order the model
 *  emitted the cells in (it puts Position first on some screens, and sometimes repeats it). Cells are
 *  told apart by shape, which is deterministic — no name matching happens here. Returns null when no
 *  governor or no power/rank could be identified.
 *  ponytail: a governor that is 1–3 digits or 4+ digits would be mistaken for a position/power. */
function canonicalRosterLine(cells: string[]): string | null {
  let rank = "", power = "", position = "";
  const rest: string[] = [];
  for (const c of cells) {
    if (c === "") continue;
    if (!rank && RANK_RE.test(c)) rank = c.toUpperCase();
    else if (!position && POSITION_RE.test(c)) position = c;
    else if (!power && POWER_RE.test(c)) power = c;
    else if (POSITION_RE.test(c) && c === position) continue; // repeated position cell
    else rest.push(c);
  }
  const governor = rest.join(" ").trim();
  if (governor === "" || (power === "" && rank === "")) return null;
  return `${governor}\t${rank}\t${power}\t${position}`;
}

/** Keep only lines shaped like rows. Cells are trimmed; names and tags are otherwise untouched so a
 *  screenshot row resolves exactly like the same row pasted. Zero rows is the reliable "wrong screen"
 *  signal — the sentinel is a nicety the model may or may not honour. */
export function parseModelOutput(kind: ScreenshotKind, text: string): ParsedModelOutput {
  if (text.includes(SENTINEL[kind])) return { kind: "not_a_screen" };
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("```")) continue;
    const cells = line.split("\t").map((c) => c.trim());
    if (kind === "roster") {
      const canonical = cells.length >= 3 ? canonicalRosterLine(cells) : null;
      if (canonical) lines.push(canonical);
      continue;
    }
    if (cells.length < 2 || cells[0] === "") continue;
    lines.push(cells.join("\t"));
  }
  return lines.length === 0 ? { kind: "not_a_screen" } : { kind: "rows", lines };
}

/** Workers AI surfaces its error codes in the message ("4006: …"). 4006 = daily allowance gone,
 *  account-wide — our own tally cannot know about other consumers, so no further classification. */
export function isAllowanceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /\b4006\b/.test(message);
}

/** A truncated answer silently loses the last rows — treat it as a failed read, never as fewer rows. */
export function finishReasonOk(reason: string | undefined): boolean {
  return reason !== "length";
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}
