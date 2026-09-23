import {
  KVK_VISIBILITY,
  type KvkAlliance,
  type KvkAppointmentRow,
  type KvkBoard,
  type KvkEvent,
  type KvkKey,
  type KvkVisibility,
} from "../../shared/types";
import { KvkValidationError, generateKey, normalizePlayer, parseSlotRef, redactForKeyHolder } from "../domain/kvk";
import type { KvkKeyRow, KvkRepo } from "../repositories/kvk-repo";
import type { SettingsRepo } from "../repositories/settings-repo";

/** Who is calling. Routes (Task 4) only let admin and kvk reach the write methods. */
export type KvkCaller = { role: "admin" | "manager" | "viewer" | "kvk"; keyId: number | null };

export type KvkEventInput = { enabled?: unknown; start_date?: unknown; others_visibility?: unknown };
export type KvkKeyInput = { alliance_name?: unknown; representative?: unknown; color?: unknown };
export type KvkSlotRefInput = { day: unknown; position: unknown; slot: unknown };
export type KvkAppointmentInput = { player_id?: unknown; player_name?: unknown; key_id?: unknown };

const ENABLED_KEY = "kvk_enabled";
const START_KEY = "kvk_start_date";
const VISIBILITY_KEY = "kvk_others_visibility";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function isDate(v: string): boolean {
  // Round-trip catches 2026-02-30, which Date.parse would silently roll over.
  return DATE_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
}

function label(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new KvkValidationError(`${field} is required`);
  const s = v.trim();
  if (s.length > 40) throw new KvkValidationError(`${field} must be 40 characters or fewer`);
  return s;
}

/** A kvk caller without its key id is a wiring bug, not a user error. */
function ownKeyId(caller: KvkCaller): number | null {
  if (caller.role !== "kvk") return null;
  if (caller.keyId === null) throw new Error("kvk caller without keyId");
  return caller.keyId;
}

export class KvkService {
  constructor(
    private readonly repo: KvkRepo,
    private readonly settings: SettingsRepo,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // ---- event (settings rows) -----------------------------------------------
  /** Missing or hand-edited values fall back to the code defaults: false / null / "all". */
  async getEvent(): Promise<KvkEvent> {
    const start = await this.settings.get(START_KEY);
    const vis = await this.settings.get(VISIBILITY_KEY);
    return {
      enabled: (await this.settings.get(ENABLED_KEY)) === "true",
      // ponytail: a cleared start date is stored as "" (SettingsRepo has no delete) and reads as null here.
      start_date: start !== null && isDate(start) ? start : null,
      others_visibility: (KVK_VISIBILITY as readonly string[]).includes(vis ?? "") ? (vis as KvkVisibility) : "all",
    };
  }

  async setEvent(input: KvkEventInput): Promise<KvkEvent> {
    const { enabled, start_date, others_visibility } = input;
    if (typeof enabled !== "boolean") throw new KvkValidationError("enabled must be a boolean");
    if (start_date !== null && (typeof start_date !== "string" || !isDate(start_date))) {
      throw new KvkValidationError("start_date must be a YYYY-MM-DD date or null");
    }
    if (typeof others_visibility !== "string" || !(KVK_VISIBILITY as readonly string[]).includes(others_visibility)) {
      throw new KvkValidationError(`others_visibility must be one of ${KVK_VISIBILITY.join(", ")}`);
    }
    await this.settings.set(ENABLED_KEY, String(enabled));
    await this.settings.set(START_KEY, start_date ?? "");
    await this.settings.set(VISIBILITY_KEY, others_visibility);
    return { enabled, start_date, others_visibility: others_visibility as KvkVisibility };
  }

  // ---- board ---------------------------------------------------------------
  async board(caller: KvkCaller): Promise<KvkBoard> {
    const event = await this.getEvent();
    const keys = await this.repo.listKeys();
    const appts = await this.repo.listAppointments();
    let alliances: KvkAlliance[] = keys.map(({ id, alliance_name, color, slot_count }) => ({
      id,
      alliance_name,
      color,
      slot_count,
    }));
    const own = ownKeyId(caller);
    if (own === null) return { event, alliances, appointments: appts };
    if (event.others_visibility === "filled") alliances = alliances.filter((a) => a.id === own);
    return { event, alliances, appointments: redactForKeyHolder(appts, own, event.others_visibility) };
  }

  // ---- keys (admin) --------------------------------------------------------
  listKeys(): Promise<KvkKey[]> {
    return this.repo.listKeys();
  }

  async createKey(input: KvkKeyInput): Promise<KvkKey> {
    const fields = this.keyFields(input);
    const row = { ...fields, key: generateKey(), created_at: this.now() };
    const id = await this.repo.insertKey(row);
    return { id, ...row, last_used_at: null, slot_count: 0 };
  }

  /** null → no such key (404). */
  async updateKey(id: number, input: KvkKeyInput): Promise<KvkKey | null> {
    const fields = this.keyFields(input);
    if (!(await this.repo.updateKey(id, fields))) return null;
    return (await this.repo.listKeys()).find((k) => k.id === id) ?? null;
  }

  deleteKey(id: number): Promise<boolean> {
    return this.repo.deleteKey(id);
  }

  /** Auth middleware lookup (Task 4). */
  keyByValue(key: string): Promise<KvkKeyRow | null> {
    return this.repo.keyByValue(key);
  }

  /** Throttled last_used_at write — at most once per key per hour. */
  touchKey(id: number, now: number): Promise<void> {
    return this.repo.touchKey(id, now);
  }

  private keyFields(input: KvkKeyInput) {
    const alliance_name = label(input.alliance_name, "alliance_name");
    const representative = label(input.representative, "representative");
    if (typeof input.color !== "string" || !COLOR_RE.test(input.color)) {
      throw new KvkValidationError("color must be a #rrggbb hex colour");
    }
    return { alliance_name, representative, color: input.color };
  }

  // ---- appointments (admin, kvk) -------------------------------------------
  /** A kvk caller always books for its own key (body key_id ignored); an admin must name an existing key. */
  async createAppointment(caller: KvkCaller, ref: KvkSlotRefInput, input: KvkAppointmentInput): Promise<KvkAppointmentRow> {
    const { day, position, slot } = parseSlotRef(ref.day, ref.position, ref.slot);
    const { playerId, playerName } = normalizePlayer(input.player_id, input.player_name);
    const own = ownKeyId(caller);
    const key = await this.existingKey(own ?? input.key_id);
    const row: KvkAppointmentRow = {
      day,
      position,
      slot,
      key_id: key.id,
      player_id: playerId,
      player_name: playerName,
      created_by: caller.role === "admin" ? "admin" : key.representative,
      updated_at: this.now(),
    };
    await this.repo.insertAppointment(row);
    return row;
  }

  /** Replaces the player; an admin may also move the slot to another existing key. false → 404. */
  async updateAppointment(caller: KvkCaller, ref: KvkSlotRefInput, input: KvkAppointmentInput): Promise<boolean> {
    const slotRef = parseSlotRef(ref.day, ref.position, ref.slot);
    const { playerId, playerName } = normalizePlayer(input.player_id, input.player_name);
    const own = ownKeyId(caller);
    const keyId = own === null && input.key_id !== undefined ? (await this.existingKey(input.key_id)).id : undefined;
    const changes = await this.repo.updateAppointment(
      slotRef,
      { player_id: playerId, player_name: playerName, updated_at: this.now(), key_id: keyId },
      own,
    );
    return changes > 0;
  }

  /** false → 404 (for a kvk caller that includes another alliance's slot, so existence isn't leaked). */
  async deleteAppointment(caller: KvkCaller, ref: KvkSlotRefInput): Promise<boolean> {
    const slotRef = parseSlotRef(ref.day, ref.position, ref.slot);
    return (await this.repo.deleteAppointment(slotRef, ownKeyId(caller))) > 0;
  }

  clearAppointments(): Promise<number> {
    return this.repo.clearAppointments();
  }

  private async existingKey(id: unknown): Promise<KvkKeyRow> {
    if (typeof id !== "number" || !Number.isInteger(id)) throw new KvkValidationError("key_id must be an integer");
    const key = await this.repo.key(id);
    if (!key) throw new KvkValidationError("key_id does not exist");
    return key;
  }
}
