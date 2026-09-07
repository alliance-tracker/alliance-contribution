// Prompt contracts for turning ranking / roster screenshots into the importers' TSV.
//
// One set of column rules per kind, packaged two ways:
//   *ChatPrompt — the copyable prompt an operator pastes into a chat LLM together with ALL screenshots
//                 of an event: cross-image dedup, a code fence (keeps tabs intact through copy-paste)
//                 and a prose Coverage check the operator reads before pasting.
//   *ReadPrompt — what the Worker sends with ONE image; the answer is parsed by code, so no fence, no
//                 prose, and a sentinel line for the wrong screen.
// Change a column rule here and both flows pick it up.

export const EVENT_SENTINEL = "NOT_A_RANKING_SCREEN";
export const ROSTER_SENTINEL = "NOT_A_ROSTER_SCREEN";

const TAG_RULE = "Remove any leading alliance tag in square brackets (e.g. `[ABC]`).";

/** Add/Edit Event: `Name<TAB>Value<TAB>Notes`. */
function eventRules(unitLabel: string): string {
  return `- Name: the participant's name exactly as written, in any script. ${TAG_RULE}
- Value: the ${unitLabel} as digits only — strip commas and other separators.
- Notes: optional short note (e.g. a mission count like "47/48"); leave the cell empty if none.
- Skip anyone whose value is 0 or shown as "Unranked". The rank numbers beside each row are NOT part of the output.
- Separate columns with a literal TAB character, not spaces. One participant per line.`;
}

/** Import Roster: `Governor<TAB>Rank<TAB>Power<TAB>Position`, all four cells always present. */
function rosterRules(): string {
  return `- Governor: the member's name exactly as written, in any script. ${TAG_RULE}
- Rank: the R-level badge on the member's avatar — one of R5, R4, R3, R2, R1. Leave the cell empty if no badge is visible.
- Power: the power value as digits only — strip the thousand separators (e.g. 164,497,800 -> 164497800) and expand abbreviations (12.5M -> 12500000). Leave empty if not shown.
- Position: the leaderboard number shown to the LEFT of the row (1, 2, 3 …). This is the member's place on the power ranking, not their R-level. Leave empty if not shown.
- Governor is ALWAYS the first cell and Position is ALWAYS the last cell. Never repeat a cell.
- Separate columns with a literal TAB character, not spaces. Keep all four column positions on every line even when a value is empty (empty cell, still tab-separated). One member per line.`;
}

const FENCE_RULE =
  "- Put ONLY the tab-separated rows inside a single fenced code block (```), with no header and nothing else inside the fence.";
const NO_PROSE_RULE = "- No header, no code fence, no explanation — nothing but the rows.";

export function eventChatPrompt(activityName: string, unitLabel: string): string {
  return `You will be given screenshots of a ${activityName} ranking. For EVERY participant whose value is greater than 0, output one line of tab-separated values with EXACTLY these columns, and NO header row:

Name<TAB>Value<TAB>Notes

Rules:
${eventRules(unitLabel)}
- Output each participant exactly ONCE. Screenshots overlap when scrolling, and the screen pins the viewer's own row in a separate panel below the list on every capture — repeating that player's rank badge and value. So the same name appears repeatedly across the images: emit its first occurrence and drop every later repeat of the same Name.
${FENCE_RULE}

After the closing fence — never inside it — add a short "Coverage check:" note in plain prose:
- Use the rank numbers shown beside each row (they are NOT part of the output) to verify coverage: they must run 1, 2, 3 … with no gaps. List every missing rank number. Ignore the pinned viewer panel below the list — its rank number is a repeat, not a position in the sequence.
- State the highest rank number you saw in the list itself and how many unique participants you output. If those two numbers differ, the screenshots are missing people.
- Call out any screenshot that is a duplicate of another, and any point where consecutive screenshots neither overlap nor continue the ranking (a jump means rows were skipped between captures).
- Values should descend down the ranking. Flag anywhere they do not — that means rows are out of order or missing.
- If everything lines up, say "Coverage check: ranks 1-N complete, no gaps."`;
}

export function rosterChatPrompt(): string {
  return `You will be given screenshots of the in-game Alliance Ranking screen (the Power tab). For EVERY member row, output one line of tab-separated values with EXACTLY these 4 columns, in this order, and NO header row:

Governor<TAB>Rank<TAB>Power<TAB>Position

Rules:
${rosterRules()}
- Output each member exactly ONCE. Screenshots overlap when scrolling, and the screen pins the viewer's own row at the bottom of every capture, so the same row appears repeatedly across the images — emit its first occurrence and drop every later repeat of the same Governor.
${FENCE_RULE}

After the closing fence — never inside it — add a short "Coverage check:" note in plain prose:
- The Position numbers must run 1, 2, 3 … with no gaps. List every missing Position number.
- State the highest Position you saw and how many unique members you output. If those two numbers differ, the screenshots are missing people.
- Call out any screenshot that is a duplicate of another, and any point where consecutive screenshots neither overlap nor continue the sequence (a jump means rows were skipped between captures).
- If everything lines up, say "Coverage check: positions 1-N complete, no gaps."`;
}

/** Notes stay a third cell so Mobilization mission counts survive; the pinned row is included because
 *  its value is right and the client merges rows keeping the first occurrence of a name. */
export function eventReadPrompt(unitLabel: string): string {
  return `You are reading ONE screenshot of a ranking screen from a mobile game. Output one line per player row visible in the image, tab-separated, with EXACTLY these cells:

Name<TAB>Value<TAB>Notes

Rules:
${eventRules(unitLabel)}
- Include the highlighted row pinned at the bottom of the screen if it shows a value above 0.
${NO_PROSE_RULE}
- If the image is not a ranking screen of this kind, output exactly: ${EVENT_SENTINEL}`;
}

/** The pinned own-row panel is asked to be skipped (its position is a repeat and sometimes missing);
 *  the model does not always comply, which is harmless — the client merges rows keeping the first
 *  occurrence of a name. */
export function rosterReadPrompt(): string {
  return `You are reading ONE screenshot of the in-game Alliance Ranking screen (the Power tab). Output one line per member row in the scrolling list, tab-separated, with EXACTLY these 4 cells in this order:

Governor<TAB>Rank<TAB>Power<TAB>Position

Rules:
${rosterRules()}
- Skip the viewer's own row pinned in a separate panel at the bottom of the screen; only rows in the list itself.
${NO_PROSE_RULE}
- If the image is not the Alliance Ranking screen, output exactly: ${ROSTER_SENTINEL}`;
}
