import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { createServices } from "../services";

export type Role = "admin" | "manager" | "viewer" | "kvk";
/** kvkKeyId is the caller's kvk_access_keys.id when role is "kvk", null on every other request. */
export type AuthVariables = { role: Role | null; kvkKeyId: number | null };

// Reachable without any key: the uptime probe, and the endpoint the SPA uses to discover what tier its
// stored key resolves to (it must be able to report "your key is not valid" rather than 401).
const PUBLIC_PATHS = new Set(["/api/health", "/api/auth/me"]);

// Constant-time string compare (portable XOR-loop over UTF-8 bytes) so key comparisons don't leak
// timing information. Length mismatch returns false early since the loop can't run over mismatched
// lengths anyway.
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Explicitly fails closed on an unset binding. Without these guards it still fails closed, but only by
// way of a subtle detail: TextEncoder.encode(input = "") treats an explicit undefined as the default "",
// so safeEqual's length check rejects it. Stating the intent here keeps that from silently regressing.
export function resolveRole(key: string | undefined, env: Env): Role | null {
  if (!key) return null;
  if (env.ADMIN_API_KEY && safeEqual(key, env.ADMIN_API_KEY)) return "admin";
  if (env.API_KEY && safeEqual(key, env.API_KEY)) return "manager";
  if (env.VIEWER_API_KEY && safeEqual(key, env.VIEWER_API_KEY)) return "viewer";
  return null;
}

export const isKvkPath = (path: string) => path === "/api/kvk" || path.startsWith("/api/kvk/");

// Resolves X-Api-Key to a role and stores it on context for downstream middleware/handlers. Gating rule:
// every /api route outside PUBLIC_PATHS needs a key that resolves to some role (401 otherwise), and the
// viewer tier is read-only — it may not touch /api/admin or any non-GET method (403).
// KvK keys (external alliances) are looked up in D1 only on /api/kvk* and /api/auth/me, so everywhere
// else a kvk key is just an unknown key (401) and costs no query.
export const apiKeyAuth: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  const key = c.req.header("X-Api-Key");
  const path = c.req.path;
  let role = resolveRole(key, c.env);
  c.set("kvkKeyId", null);

  if (role === null && key?.startsWith("kvk_") && (isKvkPath(path) || path === "/api/auth/me")) {
    const { kvkService } = createServices(c.env.DB);
    const row = await kvkService.keyByValue(key);
    if (row) {
      if (isKvkPath(path) && !(await kvkService.getEvent()).enabled) {
        return c.json({ error: "kvk closed" }, 401);
      }
      role = "kvk";
      c.set("kvkKeyId", row.id);
      c.executionCtx.waitUntil(kvkService.touchKey(row.id, Date.now()));
    }
  }
  c.set("role", role);

  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  if (role === null) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Fence: the lookup above is already path-gated; this keeps a kvk role off every other route regardless.
  if (role === "kvk" && !isKvkPath(path)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const isAdminRoute = c.req.path === "/api/admin" || c.req.path.startsWith("/api/admin/");
  const needsWriteTier = isAdminRoute || c.req.method !== "GET";
  if (needsWriteTier && role === "viewer") {
    return c.json({ error: "forbidden" }, 403);
  }

  await next();
};

// Gates destructive endpoints on top of apiKeyAuth: the admin key is required, the manager key is not enough.
export const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  if (c.get("role") !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  await next();
};
