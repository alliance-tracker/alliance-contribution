// Pure KvK Prep domain helpers. No D1, no fetch, no Date.now().

export const POSITIONS = ["chief_minister", "noble_advisor"] as const;
export const DAYS = 5;
export const SLOTS = 48;
export const KVK_VISIBILITY = ["all", "filled"] as const;

export type KvkPosition = (typeof POSITIONS)[number];
export type KvkVisibility = (typeof KVK_VISIBILITY)[number];

export class KvkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KvkValidationError";
  }
}

export class KvkConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KvkConflictError";
  }
}

/** Row shape as stored in kvk_appointments. */
export type KvkAppointmentRow = {
  day: number;
  position: KvkPosition;
  slot: number;
  key_id: number | null;
  player_id: string;
  player_name: string;
  created_by: string;
  updated_at: number;
};

/** What a `filled`-visibility caller sees in place of another alliance's row. */
export type KvkRedactedAppointment = { day: number; position: KvkPosition; slot: number; filled: true };

export type KvkBoardAppointment = KvkAppointmentRow | KvkRedactedAppointment;

/** `all` → rows unchanged. `filled` → the caller's own rows unchanged, every other row (including a
 *  NULL key_id "deleted key" row) redacted to just its slot coordinates. */
export function redactForKeyHolder(
  appts: KvkAppointmentRow[],
  ownKeyId: number,
  visibility: KvkVisibility,
): KvkBoardAppointment[] {
  if (visibility === "all") return appts;
  return appts.map((a) =>
    a.key_id === ownKeyId ? a : { day: a.day, position: a.position, slot: a.slot, filled: true },
  );
}

/** Route params arrive as strings, request bodies as numbers — accept either, integers only. */
function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return null;
}

export function parseSlotRef(
  dayRaw: unknown,
  positionRaw: unknown,
  slotRaw: unknown,
): { day: number; position: KvkPosition; slot: number } {
  const day = toInt(dayRaw);
  if (day === null || day < 1 || day > DAYS) {
    throw new KvkValidationError(`day must be an integer between 1 and ${DAYS}`);
  }
  const slot = toInt(slotRaw);
  if (slot === null || slot < 0 || slot >= SLOTS) {
    throw new KvkValidationError(`slot must be an integer between 0 and ${SLOTS - 1}`);
  }
  if (typeof positionRaw !== "string" || !(POSITIONS as readonly string[]).includes(positionRaw)) {
    throw new KvkValidationError(`position must be one of ${POSITIONS.join(", ")}`);
  }
  return { day, position: positionRaw as KvkPosition, slot };
}

/** playerId is stripped to digits only; playerName is trimmed and capped at 40 chars. */
export function normalizePlayer(id: unknown, name: unknown): { playerId: string; playerName: string } {
  if (typeof id !== "string" || typeof name !== "string") {
    throw new KvkValidationError("playerId and playerName must be strings");
  }
  const playerId = id.replace(/\D/g, "");
  const playerName = name.trim();
  if (playerId === "") throw new KvkValidationError("playerId is required");
  if (playerName === "") throw new KvkValidationError("playerName is required");
  if (playerName.length > 40) throw new KvkValidationError("playerName must be 40 characters or fewer");
  return { playerId, playerName };
}

const KEY_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_LEN = 19;
// Reject bytes above the largest multiple of 62 that fits in a byte, so `byte % 62` stays unbiased.
const KEY_BYTE_LIMIT = 256 - (256 % KEY_ALPHABET.length);

/** `kvk_` + 19 random base62 chars, via rejection sampling over crypto.getRandomValues. */
export function generateKey(): string {
  const buf = new Uint8Array(1);
  let out = "";
  while (out.length < KEY_LEN) {
    crypto.getRandomValues(buf);
    if (buf[0] < KEY_BYTE_LIMIT) out += KEY_ALPHABET[buf[0] % KEY_ALPHABET.length];
  }
  return `kvk_${out}`;
}
