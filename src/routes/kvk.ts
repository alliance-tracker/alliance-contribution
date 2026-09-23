import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { KvkConflictError, KvkValidationError } from "../domain/kvk";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { requireAdmin } from "../middleware/auth";
import { createServices } from "../services";
import type { KvkAppointmentInput, KvkCaller, KvkEventInput, KvkKeyInput } from "../services/kvk-service";

type Ctx = { Bindings: Env; Variables: AuthVariables };

/** Every kvk write needs admin or a kvk key: the manager tier is read-only here (viewer already is). */
const requireKvkWriter: MiddlewareHandler<Ctx> = async (c, next) => {
  const role = c.get("role");
  if (c.req.method !== "GET" && role !== "admin" && role !== "kvk") return c.json({ error: "forbidden" }, 403);
  await next();
};

async function respond(c: Context, fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof KvkValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof KvkConflictError) return c.json({ error: "conflict: slot already taken" }, 409);
    throw err;
  }
}

async function jsonBody<T>(c: Context): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    throw new KvkValidationError("invalid JSON body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new KvkValidationError("body must be a JSON object");
  }
  return parsed as T;
}

function idParam(c: Context): number {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new KvkValidationError("invalid id");
  return id;
}

const caller = (c: Context<Ctx>): KvkCaller => ({ role: c.get("role")!, keyId: c.get("kvkKeyId") });
const slotRef = (c: Context) => ({ day: c.req.param("day"), position: c.req.param("position"), slot: c.req.param("slot") });
const notFound = (c: Context) => c.json({ error: "not found" }, 404);

const kvkRoutes = new Hono<Ctx>();
kvkRoutes.use("*", requireKvkWriter);

kvkRoutes.get("/", async (c) => c.json(await createServices(c.env.DB).kvkService.board(caller(c))));

// ---- admin ------------------------------------------------------------------

kvkRoutes.put("/event", requireAdmin, async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    return c.json(await kvkService.setEvent(await jsonBody<KvkEventInput>(c)));
  }),
);

kvkRoutes.delete("/appointments", requireAdmin, async (c) => {
  const deleted = await createServices(c.env.DB).kvkService.clearAppointments();
  return c.json({ ok: true, deleted });
});

kvkRoutes.get("/keys", requireAdmin, async (c) => c.json(await createServices(c.env.DB).kvkService.listKeys()));

kvkRoutes.post("/keys", requireAdmin, async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    return c.json(await kvkService.createKey(await jsonBody<KvkKeyInput>(c)));
  }),
);

kvkRoutes.patch("/keys/:id", requireAdmin, async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    const updated = await kvkService.updateKey(idParam(c), await jsonBody<KvkKeyInput>(c));
    return updated ? c.json(updated) : notFound(c);
  }),
);

kvkRoutes.delete("/keys/:id", requireAdmin, async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    return (await kvkService.deleteKey(idParam(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

// ---- appointments (admin, kvk) -----------------------------------------------

kvkRoutes.post("/appointments", async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    const body = await jsonBody<KvkAppointmentInput & { day?: unknown; position?: unknown; slot?: unknown }>(c);
    const ref = { day: body.day, position: body.position, slot: body.slot };
    return c.json(await kvkService.createAppointment(caller(c), ref, body));
  }),
);

kvkRoutes.patch("/appointments/:day/:position/:slot", async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    const ok = await kvkService.updateAppointment(caller(c), slotRef(c), await jsonBody<KvkAppointmentInput>(c));
    return ok ? c.json({ ok: true }) : notFound(c);
  }),
);

kvkRoutes.delete("/appointments/:day/:position/:slot", async (c) =>
  respond(c, async () => {
    const { kvkService } = createServices(c.env.DB);
    return (await kvkService.deleteAppointment(caller(c), slotRef(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

export default kvkRoutes;
