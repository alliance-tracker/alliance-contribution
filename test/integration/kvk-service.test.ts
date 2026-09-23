import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { KvkConflictError, KvkValidationError } from "../../src/domain/kvk";
import { KvkRepo } from "../../src/repositories/kvk-repo";
import { SettingsRepo } from "../../src/repositories/settings-repo";
import { KvkService, type KvkCaller } from "../../src/services/kvk-service";

// Storage persists across `it` blocks within this file (see repos.test.ts), so tests run in order and
// each one uses its own slots.
const repo = new KvkRepo(env.DB);
const svc = new KvkService(repo, new SettingsRepo(env.DB));
const ADMIN: KvkCaller = { role: "admin", keyId: null };
const VIEWER: KvkCaller = { role: "viewer", keyId: null };
const kvk = (keyId: number): KvkCaller => ({ role: "kvk", keyId });
const player = { player_id: "12-345", player_name: "  Ann  " };
const ref = (day: number, slot: number, position = "chief_minister") => ({ day, position, slot });

describe("KvkService event", () => {
  it("reads defaults when nothing is stored", async () => {
    expect(await svc.getEvent()).toEqual({ enabled: false, start_date: null, others_visibility: "all" });
  });

  it("validates and round-trips, clearing start_date with null", async () => {
    await expect(svc.setEvent({ enabled: "yes", start_date: null, others_visibility: "all" })).rejects.toThrow(
      KvkValidationError,
    );
    await expect(svc.setEvent({ enabled: true, start_date: "2026-02-30", others_visibility: "all" })).rejects.toThrow(
      KvkValidationError,
    );
    await expect(svc.setEvent({ enabled: true, start_date: null, others_visibility: "some" })).rejects.toThrow(
      KvkValidationError,
    );
    const set = { enabled: true, start_date: "2026-10-01", others_visibility: "filled" };
    expect(await svc.setEvent(set)).toEqual(set);
    expect(await svc.getEvent()).toEqual(set);
    await svc.setEvent({ ...set, start_date: null, others_visibility: "all" });
    expect(await svc.getEvent()).toEqual({ enabled: true, start_date: null, others_visibility: "all" });
  });

  it("falls back to defaults for garbage stored values", async () => {
    const s = new SettingsRepo(env.DB);
    await s.set("kvk_enabled", "1");
    await s.set("kvk_start_date", "soon");
    await s.set("kvk_others_visibility", "none");
    expect(await svc.getEvent()).toEqual({ enabled: false, start_date: null, others_visibility: "all" });
  });
});

describe("KvkService keys + appointments", () => {
  let a: number;
  let b: number;

  it("creates, validates and lists keys with slot_count", async () => {
    await expect(svc.createKey({ alliance_name: " ", representative: "x", color: "#aabbcc" })).rejects.toThrow(
      KvkValidationError,
    );
    await expect(svc.createKey({ alliance_name: "A", representative: "x", color: "red" })).rejects.toThrow(
      KvkValidationError,
    );
    await expect(
      svc.createKey({ alliance_name: "x".repeat(41), representative: "x", color: "#aabbcc" }),
    ).rejects.toThrow(KvkValidationError);

    const ka = await svc.createKey({ alliance_name: " Alpha ", representative: "Rep A", color: "#AABBCC" });
    expect(ka).toMatchObject({ alliance_name: "Alpha", representative: "Rep A", last_used_at: null, slot_count: 0 });
    expect(ka.key).toMatch(/^kvk_[0-9A-Za-z]{19}$/);
    a = ka.id;
    b = (await svc.createKey({ alliance_name: "Beta", representative: "Rep B", color: "#112233" })).id;
    expect((await svc.listKeys()).map((k) => k.id)).toEqual([a, b]);
    expect((await svc.keyByValue(ka.key))?.id).toBe(a);
    expect(await svc.keyByValue("kvk_nope")).toBeNull();
  });

  it("updates a key; unknown id → null", async () => {
    const k = await svc.updateKey(b, { alliance_name: "Beta2", representative: "Rep B", color: "#112233" });
    expect(k?.alliance_name).toBe("Beta2");
    expect(await svc.updateKey(9999, { alliance_name: "x", representative: "x", color: "#112233" })).toBeNull();
  });

  it("admin create needs an existing key; created_by is admin", async () => {
    await expect(svc.createAppointment(ADMIN, ref(1, 0), player)).rejects.toThrow(KvkValidationError);
    await expect(svc.createAppointment(ADMIN, ref(1, 0), { ...player, key_id: 9999 })).rejects.toThrow(
      KvkValidationError,
    );
    const row = await svc.createAppointment(ADMIN, ref(1, 0), { ...player, key_id: a });
    expect(row).toMatchObject({ key_id: a, player_id: "12345", player_name: "Ann", created_by: "admin" });
  });

  it("kvk create forces its own key and records the representative", async () => {
    const row = await svc.createAppointment(kvk(b), ref(1, 1), { ...player, key_id: a });
    expect(row).toMatchObject({ key_id: b, created_by: "Rep B" });
    await expect(svc.createAppointment({ role: "kvk", keyId: null }, ref(1, 2), player)).rejects.toThrow("without keyId");
  });

  it("a taken slot → KvkConflictError", async () => {
    await expect(svc.createAppointment(kvk(b), ref(1, 0), player)).rejects.toThrow(KvkConflictError);
  });

  it("slot_count counts each key's appointments", async () => {
    const counts = Object.fromEntries((await svc.listKeys()).map((k) => [k.id, k.slot_count]));
    expect(counts).toEqual({ [a]: 1, [b]: 1 });
  });

  it("kvk update/delete of another alliance's slot is not found", async () => {
    expect(await svc.updateAppointment(kvk(b), ref(1, 0), player)).toBe(false);
    expect(await svc.deleteAppointment(kvk(b), ref(1, 0))).toBe(false);
    expect(await svc.updateAppointment(kvk(b), ref(1, 1), { player_id: "9", player_name: "Bo", key_id: a })).toBe(true);
    const row = (await repo.listAppointments()).find((r) => r.slot === 1);
    expect(row).toMatchObject({ key_id: b, player_id: "9", player_name: "Bo" }); // body key_id ignored
  });

  it("admin update may move a slot to another existing key", async () => {
    await expect(svc.updateAppointment(ADMIN, ref(1, 1), { ...player, key_id: 9999 })).rejects.toThrow(
      KvkValidationError,
    );
    expect(await svc.updateAppointment(ADMIN, ref(1, 1), { ...player, key_id: a })).toBe(true);
    expect((await repo.listAppointments()).find((r) => r.slot === 1)?.key_id).toBe(a);
    expect(await svc.updateAppointment(ADMIN, ref(1, 1), { ...player, key_id: b })).toBe(true);
    expect(await svc.updateAppointment(ADMIN, ref(2, 5), player)).toBe(false);
  });

  it("board: full rows for staff and for kvk in all mode, never a key field", async () => {
    await svc.setEvent({ enabled: true, start_date: null, others_visibility: "all" });
    for (const caller of [ADMIN, VIEWER, kvk(b)]) {
      const board = await svc.board(caller);
      expect(board.alliances).toHaveLength(2);
      expect(board.alliances[0]).not.toHaveProperty("key");
      expect(board.appointments.every((x) => "player_id" in x)).toBe(true);
    }
  });

  it("board: filled mode redacts others and keeps only the caller's alliance", async () => {
    await svc.setEvent({ enabled: true, start_date: null, others_visibility: "filled" });
    const board = await svc.board(kvk(b));
    expect(board.alliances).toEqual([{ id: b, alliance_name: "Beta2", color: "#112233", slot_count: 1 }]);
    expect(board.appointments).toEqual([
      { day: 1, position: "chief_minister", slot: 0, filled: true },
      expect.objectContaining({ slot: 1, key_id: b, player_name: "Ann" }),
    ]);
    expect((await svc.board(ADMIN)).alliances).toHaveLength(2);
  });

  it("kvk delete of its own slot succeeds", async () => {
    await svc.createAppointment(kvk(b), ref(3, 7, "noble_advisor"), player);
    expect(await svc.deleteAppointment(kvk(b), ref(3, 7, "noble_advisor"))).toBe(true);
  });

  it("deleting a key keeps its appointments with key_id NULL", async () => {
    expect(await svc.deleteKey(a)).toBe(true);
    expect(await svc.deleteKey(a)).toBe(false);
    expect((await repo.listAppointments()).find((r) => r.slot === 0)?.key_id).toBeNull();
  });

  it("touchKey writes at most once per hour", async () => {
    const t0 = 1_700_000_000_000;
    await svc.touchKey(b, t0);
    await svc.touchKey(b, t0 + 30 * 60_000);
    expect((await repo.key(b))?.last_used_at).toBe(t0);
    await svc.touchKey(b, t0 + 3_600_001);
    expect((await repo.key(b))?.last_used_at).toBe(t0 + 3_600_001);
  });

  it("clearAppointments deletes every appointment", async () => {
    expect(await svc.clearAppointments()).toBe(2);
    expect(await repo.listAppointments()).toEqual([]);
  });
});
