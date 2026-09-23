import type { KvkAppointmentRow, KvkKey, KvkPosition } from "../../shared/types";
import { KvkConflictError } from "../domain/kvk";
import { all, first, run } from "./db";

export type KvkKeyRow = Omit<KvkKey, "slot_count">;
export type NewKvkKey = Pick<KvkKey, "alliance_name" | "representative" | "color" | "key" | "created_at">;
export type KvkKeyPatch = Pick<KvkKey, "alliance_name" | "representative" | "color">;
export type SlotRef = { day: number; position: KvkPosition; slot: number };
export type KvkAppointmentPatch = Pick<KvkAppointmentRow, "player_id" | "player_name" | "updated_at"> & {
  /** Only admins may move a slot to another key; undefined leaves key_id as is. */
  key_id?: number;
};

const APPT_COLS = "day, position, slot, key_id, player_id, player_name, created_by, updated_at";
const KEY_THROTTLE_MS = 3_600_000;

export class KvkRepo {
  constructor(private readonly db: D1Database) {}

  // ---- kvk_access_keys -----------------------------------------------------
  listKeys(): Promise<KvkKey[]> {
    return all<KvkKey>(
      this.db,
      `SELECT k.*, (SELECT COUNT(*) FROM kvk_appointments a WHERE a.key_id = k.id) AS slot_count
       FROM kvk_access_keys k ORDER BY k.id`,
    );
  }

  key(id: number): Promise<KvkKeyRow | null> {
    return first<KvkKeyRow>(this.db, "SELECT * FROM kvk_access_keys WHERE id = ?", id);
  }

  keyByValue(key: string): Promise<KvkKeyRow | null> {
    return first<KvkKeyRow>(this.db, "SELECT * FROM kvk_access_keys WHERE key = ?", key);
  }

  async insertKey(k: NewKvkKey): Promise<number> {
    const result = await run(
      this.db,
      "INSERT INTO kvk_access_keys (alliance_name, representative, color, key, created_at) VALUES (?, ?, ?, ?, ?)",
      k.alliance_name,
      k.representative,
      k.color,
      k.key,
      k.created_at,
    );
    return result.meta.last_row_id;
  }

  async updateKey(id: number, k: KvkKeyPatch): Promise<boolean> {
    const result = await run(
      this.db,
      "UPDATE kvk_access_keys SET alliance_name = ?, representative = ?, color = ? WHERE id = ?",
      k.alliance_name,
      k.representative,
      k.color,
      id,
    );
    return result.meta.changes > 0;
  }

  async deleteKey(id: number): Promise<boolean> {
    return (await run(this.db, "DELETE FROM kvk_access_keys WHERE id = ?", id)).meta.changes > 0;
  }

  /** At most one write per key per hour (D1 write budget); the column is deliberately unindexed. */
  async touchKey(id: number, now: number): Promise<void> {
    await run(
      this.db,
      "UPDATE kvk_access_keys SET last_used_at = ?1 WHERE id = ?2 AND (last_used_at IS NULL OR last_used_at < ?1 - ?3)",
      now,
      id,
      KEY_THROTTLE_MS,
    );
  }

  // ---- kvk_appointments ----------------------------------------------------
  listAppointments(): Promise<KvkAppointmentRow[]> {
    return all<KvkAppointmentRow>(
      this.db,
      `SELECT ${APPT_COLS} FROM kvk_appointments ORDER BY day, position, slot`,
    );
  }

  /** The UNIQUE(day, position, slot) constraint is the booking lock: a taken slot → KvkConflictError. */
  async insertAppointment(a: KvkAppointmentRow): Promise<void> {
    try {
      await run(
        this.db,
        `INSERT INTO kvk_appointments (${APPT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        a.day,
        a.position,
        a.slot,
        a.key_id,
        a.player_id,
        a.player_name,
        a.created_by,
        a.updated_at,
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
        throw new KvkConflictError("conflict: slot already taken");
      }
      throw e;
    }
  }

  /** `keyId` non-null restricts the write to that key's own row. Returns the change count. */
  async updateAppointment(ref: SlotRef, p: KvkAppointmentPatch, keyId: number | null): Promise<number> {
    const result = await run(
      this.db,
      `UPDATE kvk_appointments SET player_id = ?1, player_name = ?2, updated_at = ?3, key_id = COALESCE(?4, key_id)
       WHERE day = ?5 AND position = ?6 AND slot = ?7 AND (?8 IS NULL OR key_id = ?8)`,
      p.player_id,
      p.player_name,
      p.updated_at,
      p.key_id ?? null,
      ref.day,
      ref.position,
      ref.slot,
      keyId,
    );
    return result.meta.changes;
  }

  async deleteAppointment(ref: SlotRef, keyId: number | null): Promise<number> {
    const result = await run(
      this.db,
      "DELETE FROM kvk_appointments WHERE day = ?1 AND position = ?2 AND slot = ?3 AND (?4 IS NULL OR key_id = ?4)",
      ref.day,
      ref.position,
      ref.slot,
      keyId,
    );
    return result.meta.changes;
  }

  async clearAppointments(): Promise<number> {
    return (await run(this.db, "DELETE FROM kvk_appointments")).meta.changes;
  }
}
