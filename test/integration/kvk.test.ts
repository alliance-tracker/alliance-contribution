import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEFAULT_DAYS, type KvkDay } from "../../src/domain/kvk";
import { ADMIN, MANAGER, VIEWER } from "./keys";

// Storage persists across `it` blocks within this file, so tests run in order: keys A and B are created
// first and every later test presents their plaintext as its X-Api-Key.
const BASE = "https://example.com/api";
const keys: Record<"A" | "B", { id: number; key: string }> = {} as never;
const as = (k: "A" | "B") => ({ "X-Api-Key": keys[k].key });

function call(path: string, headers: Record<string, string>, method = "GET", body?: unknown) {
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const setEvent = (enabled: boolean, others_visibility = "all", days: KvkDay[] = DEFAULT_DAYS as KvkDay[]) =>
  call("/kvk/event", ADMIN, "PUT", { enabled, start_date: "2026-10-01", others_visibility, days });
const player = (name: string) => ({ player_id: "123", player_name: name });

async function lastUsed(id: number): Promise<number | null> {
  const row = await env.DB.prepare("SELECT last_used_at FROM kvk_access_keys WHERE id = ?").bind(id).first<{
    last_used_at: number | null;
  }>();
  return row?.last_used_at ?? null;
}

// touchKey runs in waitUntil, so the write may land just after the response.
async function waitForLastUsed(id: number): Promise<number | null> {
  for (let i = 0; i < 50; i++) {
    const v = await lastUsed(id);
    if (v !== null) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
}

describe("/api/kvk", () => {
  it("admin creates keys A and B", async () => {
    for (const [name, color] of [["A", "#ff0000"], ["B", "#00ff00"]] as const) {
      const res = await call("/kvk/keys", ADMIN, "POST", { alliance_name: `Alliance ${name}`, representative: `Rep ${name}`, color });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: number; key: string };
      expect(body.key).toMatch(/^kvk_/);
      keys[name] = body;
    }
  });

  it("closed: a kvk key gets 401 on /api/kvk and auth/me reports enabled=false", async () => {
    const res = await call("/kvk", as("A"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "kvk closed" });

    const me = await call("/auth/me", as("A"));
    expect(me.status).toBe(200);
    const k = keys.A.key;
    expect(await me.json()).toEqual({
      role: "kvk",
      scheduler: true,
      kvk: {
        enabled: false,
        key_id: keys.A.id,
        alliance_name: "Alliance A",
        representative: "Rep A",
        color: "#ff0000",
        masked_key: `${k.slice(0, 8)}••••${k.slice(-4)}`,
      },
    });
  });

  it("auth/me: staff get { enabled }, no key gets { enabled: false } and no leak", async () => {
    await setEvent(true);
    expect(await (await call("/auth/me", MANAGER)).json()).toEqual({ role: "manager", scheduler: true, kvk: { enabled: true } });
    expect(await (await call("/auth/me", {})).json()).toEqual({ role: null, scheduler: true, kvk: { enabled: false } });
    const bogus = await call("/auth/me", { "X-Api-Key": "kvk_bogus" });
    expect(await bogus.json()).toEqual({ role: null, scheduler: true, kvk: { enabled: false } });

    const meB = await call("/auth/me", as("B"));
    const bodyB = (await meB.json()) as { kvk: { key_id: number; enabled: boolean } };
    expect(bodyB.kvk.key_id).toBe(keys.B.id);
    expect(bodyB.kvk.enabled).toBe(true);
  });

  it("fence: a kvk key never resolves outside /api/kvk and /api/auth/me (401), bogus kvk key is 401", async () => {
    // The kvk lookup is path-gated, so outside its paths a real kvk key is simply an unknown key.
    expect((await call("/members", as("A"))).status).toBe(401);
    expect((await call("/admin/export", as("A"))).status).toBe(401);
    expect((await call("/kvkx", as("A"))).status).toBe(401);
    expect((await call("/members", { "X-Api-Key": "kvk_bogus" })).status).toBe(401);
    expect((await call("/kvk", { "X-Api-Key": "kvk_bogus" })).status).toBe(401);
  });

  it("kvk key cannot reach admin-only kvk routes", async () => {
    expect((await call("/kvk/keys", as("A"))).status).toBe(403);
    expect((await call("/kvk/keys", as("A"), "POST", { alliance_name: "x", representative: "y", color: "#000000" })).status).toBe(403);
    expect((await call(`/kvk/keys/${keys.B.id}`, as("A"), "DELETE")).status).toBe(403);
    expect((await call("/kvk/event", as("A"), "PUT", { enabled: false, start_date: null, others_visibility: "all" })).status).toBe(403);
  });

  it("create as A stores A's key id even when the body names B; duplicate slot is 409", async () => {
    const res = await call("/kvk/appointments", as("A"), "POST", { day: 1, position: "chief_minister", slot: 0, ...player("Ann"), key_id: keys.B.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key_id: keys.A.id, created_by: "Rep A" });

    const dup = await call("/kvk/appointments", as("B"), "POST", { day: 1, position: "chief_minister", slot: 0, ...player("Bob") });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: "conflict: slot already taken" });

    const bad = await call("/kvk/appointments", as("A"), "POST", { day: 9, position: "chief_minister", slot: 0, ...player("Ann") });
    expect(bad.status).toBe(400);

    const b = await call("/kvk/appointments", as("B"), "POST", { day: 1, position: "chief_minister", slot: 1, ...player("Bob") });
    expect(b.status).toBe(200);
  });

  it("A cannot PATCH or DELETE B's slot (404); admin can edit and delete any slot", async () => {
    const bSlot = "/kvk/appointments/1/chief_minister/1";
    expect((await call(bSlot, as("A"), "PATCH", player("Hax"))).status).toBe(404);
    expect((await call(bSlot, as("A"), "DELETE")).status).toBe(404);

    expect((await call("/kvk/appointments/1/chief_minister/0", as("A"), "PATCH", player("Ann2"))).status).toBe(200);

    const adminSlot = await call("/kvk/appointments", ADMIN, "POST", { day: 2, position: "chief_minister", slot: 0, ...player("Zed"), key_id: keys.B.id });
    expect(adminSlot.status).toBe(200);
    expect((await call("/kvk/appointments/2/chief_minister/0", ADMIN, "PATCH", { ...player("Zed2"), key_id: keys.A.id })).status).toBe(200);
    expect((await call("/kvk/appointments/2/chief_minister/0", ADMIN, "DELETE")).status).toBe(200);
    expect((await call("/kvk/appointments/2/chief_minister/0", ADMIN, "DELETE")).status).toBe(404);
  });

  it("holder PATCHing its own slot ignores an attempted key_id move to another alliance", async () => {
    const res = await call("/kvk/appointments/1/chief_minister/0", as("A"), "PATCH", { ...player("Ann2"), key_id: keys.B.id });
    expect(res.status).toBe(200);
    const body = (await (await call("/kvk", ADMIN)).json()) as { appointments: Record<string, unknown>[] };
    expect(body.appointments.find((a) => a.day === 1 && a.slot === 0)).toMatchObject({ key_id: keys.A.id, player_name: "Ann2" });
  });

  it("filled mode hides B's detail from A; all mode shows full rows and never a key field", async () => {
    await setEvent(true, "filled");
    const filled = (await (await call("/kvk", as("A"))).json()) as {
      alliances: { id: number }[];
      appointments: Record<string, unknown>[];
    };
    expect(filled.alliances.map((a) => a.id)).toEqual([keys.A.id]);
    const other = filled.appointments.find((a) => a.slot === 1)!;
    expect(other).toEqual({ day: 1, position: "chief_minister", slot: 1, filled: true });
    expect(filled.appointments.find((a) => a.slot === 0)).toMatchObject({ key_id: keys.A.id, player_name: "Ann2" });

    await setEvent(true, "all");
    const res = await call("/kvk", as("A"));
    const text = await res.text();
    // Board responses never carry a plaintext access key — days[].key (a KvkPosition or null) is a
    // different, non-secret field that happens to share the name.
    expect(text).not.toContain(keys.A.key);
    expect(text).not.toContain(keys.B.key);
    const all = JSON.parse(text) as { alliances: unknown[]; appointments: Record<string, unknown>[] };
    expect(all.alliances).toHaveLength(2);
    expect(all.appointments.find((a) => a.slot === 1)).toMatchObject({ key_id: keys.B.id, player_name: "Bob" });
  });

  it("manager writes are 403; viewer GET is 200 with full detail", async () => {
    expect((await call("/kvk/appointments", MANAGER, "POST", { day: 3, position: "chief_minister", slot: 0, ...player("M"), key_id: keys.A.id })).status).toBe(403);
    expect((await call("/kvk/appointments/1/chief_minister/0", MANAGER, "DELETE")).status).toBe(403);
    expect((await call("/kvk/appointments", VIEWER, "POST", { day: 3, position: "chief_minister", slot: 0, ...player("V"), key_id: keys.A.id })).status).toBe(403);
    expect((await call("/kvk/keys", MANAGER)).status).toBe(403);

    await setEvent(true, "filled");
    const res = await call("/kvk", VIEWER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alliances: unknown[]; appointments: Record<string, unknown>[] };
    expect(body.alliances).toHaveLength(2);
    expect(body.appointments.find((a) => a.slot === 1)).toMatchObject({ key_id: keys.B.id, player_name: "Bob" });
    await setEvent(true, "all");
  });

  it("last_used_at is set on first use and throttled on the next", async () => {
    expect((await call("/kvk", as("A"))).status).toBe(200);
    const first = await waitForLastUsed(keys.A.id);
    expect(first).not.toBeNull();
    expect((await call("/kvk", as("A"))).status).toBe(200);
    // A further request gives any pending waitUntil write time to land before re-reading.
    await call("/kvk", VIEWER);
    expect(await lastUsed(keys.A.id)).toBe(first);
  });

  it("deleting key B leaves B's appointments with key_id NULL", async () => {
    expect((await call(`/kvk/keys/${keys.B.id}`, ADMIN, "DELETE")).status).toBe(200);
    expect((await call(`/kvk/keys/${keys.B.id}`, ADMIN, "DELETE")).status).toBe(404);
    expect((await call("/kvk", as("B"))).status).toBe(401);
    const body = (await (await call("/kvk", ADMIN)).json()) as { appointments: Record<string, unknown>[] };
    expect(body.appointments.find((a) => a.slot === 1)).toMatchObject({ key_id: null, player_name: "Bob" });
  });

  it("a holder cannot PATCH or DELETE a NULL-key_id orphan row left by a deleted key", async () => {
    const orphan = "/kvk/appointments/1/chief_minister/1";
    expect((await call(orphan, as("A"), "PATCH", player("Hax"))).status).toBe(404);
    expect((await call(orphan, as("A"), "DELETE")).status).toBe(404);
  });

  it("clear schedule is admin-only and empties the table", async () => {
    expect((await call("/kvk/appointments", as("A"), "DELETE")).status).toBe(403);
    expect((await call("/kvk/appointments", MANAGER, "DELETE")).status).toBe(403);
    const res = await call("/kvk/appointments", ADMIN, "DELETE");
    expect(res.status).toBe(200);
    const body = (await (await call("/kvk", ADMIN)).json()) as { appointments: unknown[] };
    expect(body.appointments).toEqual([]);
  });

  it("PUT rejects invalid days; hidden positions reject writes and hidden_count is admin-only", async () => {
    const bad = await call("/kvk/event", ADMIN, "PUT", { enabled: true, start_date: "2026-10-01", others_visibility: "all", days: [] });
    expect(bad.status).toBe(400);

    const hideDay2NA: KvkDay[] = [DEFAULT_DAYS[0]!, { key: "chief_minister", shown: ["chief_minister"] }, ...DEFAULT_DAYS.slice(2)];
    expect((await setEvent(true, "all", hideDay2NA)).status).toBe(200);

    const post = await call("/kvk/appointments", as("A"), "POST", { day: 2, position: "noble_advisor", slot: 0, ...player("Hidden") });
    expect(post.status).toBe(400);

    const adminBody = (await (await call("/kvk", ADMIN)).json()) as { hidden_count?: number };
    expect(typeof adminBody.hidden_count).toBe("number");
    const viewerBody = (await (await call("/kvk", VIEWER)).json()) as { hidden_count?: number };
    expect(viewerBody.hidden_count).toBeUndefined();

    await setEvent(true, "all");
  });

  it("admin key CRUD: list includes plaintext key, patch validates and 404s", async () => {
    const list = (await (await call("/kvk/keys", ADMIN)).json()) as { id: number; key: string }[];
    expect(list.find((k) => k.id === keys.A.id)?.key).toBe(keys.A.key);
    const patch = await call(`/kvk/keys/${keys.A.id}`, ADMIN, "PATCH", { alliance_name: "A2", representative: "R", color: "#123456" });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ alliance_name: "A2" });
    expect((await call(`/kvk/keys/${keys.A.id}`, ADMIN, "PATCH", { alliance_name: "A2", representative: "R", color: "red" })).status).toBe(400);
    expect((await call("/kvk/keys/9999", ADMIN, "PATCH", { alliance_name: "A2", representative: "R", color: "#123456" })).status).toBe(404);
    expect((await call("/kvk/keys/abc", ADMIN, "DELETE")).status).toBe(400);
  });
});
