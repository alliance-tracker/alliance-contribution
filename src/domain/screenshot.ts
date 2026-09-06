import { AI_DAILY_NEURON_LIMIT, type ScreenshotKind, type ScreenshotUsage } from "../../shared/types";

// Pure helpers for the screenshot-read flow. No DB, no fetch.

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export function usageSnapshot(row: { neurons: number; requests: number }, now: Date): ScreenshotUsage {
  return {
    used: Math.round(row.neurons),
    limit: AI_DAILY_NEURON_LIMIT,
    requests: row.requests,
    resetsAt: nextUtcMidnight(now),
  };
}

const EVENT_SENTINEL = "NOT_A_RANKING_SCREEN";
const ROSTER_SENTINEL = "NOT_A_ROSTER_SCREEN";

/** Per-image variant of the paste prompt (web/src/pages/Events.tsx): no fence, no coverage check,
 *  a sentinel for the wrong screen. Notes stay a third cell so Mobilization mission counts survive. */
export function eventPrompt(unitLabel: string): string {
  return `You are reading ONE screenshot of a ranking screen from a mobile game. Output one line per player row visible in the image, tab-separated, with EXACTLY these cells:

Name<TAB>Value<TAB>Notes

Rules:
- Name: the player's name exactly as written, in any script. Remove a leading alliance tag in square brackets such as [ABC].
- Value: the ${unitLabel} shown for that row, digits only, no thousands separators.
- Notes: optional, e.g. a mission count like 47/48 when one is shown; otherwise leave the cell empty.
- Include the highlighted row pinned at the bottom of the screen if it shows a value above 0.
- Skip rows whose value is 0 or shown as Unranked. Do not output the rank numbers.
- Separate cells with a literal TAB character. One row per line.
- No header, no code fence, no explanation — nothing but the rows.
- If the image is not a ranking screen of this kind, output exactly: ${EVENT_SENTINEL}`;
}

/** Per-image variant of ROSTER_PROMPT (web/src/pages/Roster.tsx). The pinned own-row panel is skipped:
 *  its position is a repeat and often missing, and the client keeps the first occurrence of a name. */
export function rosterPrompt(): string {
  return `You are reading ONE screenshot of the in-game Alliance Ranking screen (the Power tab). Output one line per member row in the scrolling list, tab-separated, with EXACTLY these 4 cells in this order:

Governor<TAB>Rank<TAB>Power<TAB>Position

Rules:
- Governor: the member's name exactly as written, in any script. Remove a leading alliance tag in square brackets such as [ABC].
- Rank: the R-level badge on the avatar — one of R5, R4, R3, R2, R1. Leave empty if no badge is visible.
- Power: digits only, no separators; expand abbreviations (12.5M -> 12500000, 980K -> 980000). Leave empty if not shown.
- Position: the number shown to the LEFT of the row (1, 2, 3 …). Leave empty if not shown.
- Governor is ALWAYS the first cell and Position is ALWAYS the last cell. Never repeat a cell.
- Always output all 4 cells, separated by 3 literal TAB characters, even when some cells are empty.
- Skip the viewer's own row pinned in a separate panel at the bottom of the screen; only rows in the list itself.
- No header, no code fence, no explanation — nothing but the rows.
- If the image is not the Alliance Ranking screen, output exactly: ${ROSTER_SENTINEL}`;
}

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
