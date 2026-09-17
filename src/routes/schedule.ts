import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import type { NotificationInput, ScheduleEventInput, WebhookInput } from "../../shared/types";
import { readAiConfig } from "../domain/screenshot";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { requireAdmin } from "../middleware/auth";
import { AiUsageRepo } from "../repositories/ai-usage-repo";
import { createServices } from "../services";
import { ScheduleAiError, ScheduleValidationError, type TranslateAi } from "../services/schedule-service";
import type { AiChatOutput } from "../services/screenshot-service";

type Ctx = { Bindings: Env; Variables: AuthVariables };

/** Opt-in per deployment: without the var the whole feature is invisible, not merely unauthorized —
 *  a 404 is the honest answer for a deployment that has no scheduler. */
export const schedulerGuard: MiddlewareHandler<Ctx> = async (c, next) => {
  if (c.env.SCHEDULER_ENABLED !== "true") return c.json({ error: "scheduler disabled" }, 404);
  await next();
};

async function respond(c: Context, fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ScheduleValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof ScheduleAiError) return c.json({ error: err.code }, err.code === "exhausted" ? 429 : 502);
    throw err;
  }
}

async function jsonBody<T>(c: Context): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    throw new ScheduleValidationError("invalid JSON body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ScheduleValidationError("body must be a JSON object");
  }
  return parsed as T;
}

function idParam(c: Context): number {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new ScheduleValidationError("invalid id");
  return id;
}

const notFound = (c: Context) => c.json({ error: "not found" }, 404);

// ---- read-only view, any tier ----------------------------------------------

export const scheduleReadRoutes = new Hono<Ctx>();
scheduleReadRoutes.use("*", schedulerGuard);

scheduleReadRoutes.get("/", async (c) => {
  const { scheduleService } = createServices(c.env.DB);
  const [events, languages, status, webhooks, roles, templates] = await Promise.all([
    scheduleService.events(),
    scheduleService.getLanguages(c.env),
    scheduleService.status(),
    scheduleService.webhooks(),
    scheduleService.roles(),
    scheduleService.templates(),
  ]);
  const names = (rows: { id: number; name: string }[]) => rows.map(({ id, name }) => ({ id, name }));
  return c.json({
    events,
    languages: languages.languages,
    status,
    names: { channels: names(webhooks), roles: names(roles), templates: names(templates) },
  });
});

// ---- admin ------------------------------------------------------------------

const scheduleAdminRoutes = new Hono<Ctx>();
scheduleAdminRoutes.use("*", schedulerGuard);
// requireAdmin on everything: the /api/admin prefix alone only excludes the viewer key.
scheduleAdminRoutes.use("*", requireAdmin);

scheduleAdminRoutes.get("/status", async (c) => c.json(await createServices(c.env.DB).scheduleService.status()));

scheduleAdminRoutes.get("/languages", async (c) =>
  c.json(await createServices(c.env.DB).scheduleService.getLanguages(c.env)),
);

scheduleAdminRoutes.put("/languages", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return c.json(await scheduleService.setLanguages(await jsonBody<{ languages?: unknown }>(c)));
  }),
);

scheduleAdminRoutes.get("/webhooks", async (c) => c.json(await createServices(c.env.DB).scheduleService.webhooks()));

scheduleAdminRoutes.post("/webhooks", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return c.json(await scheduleService.createWebhook(await jsonBody<WebhookInput>(c)));
  }),
);

scheduleAdminRoutes.delete("/webhooks/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return (await scheduleService.deleteWebhook(idParam(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

scheduleAdminRoutes.get("/roles", async (c) => c.json(await createServices(c.env.DB).scheduleService.roles()));

scheduleAdminRoutes.post("/roles", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return c.json(await scheduleService.createRole(await jsonBody<{ name?: unknown; role_id?: unknown }>(c)));
  }),
);

scheduleAdminRoutes.delete("/roles/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return (await scheduleService.deleteRole(idParam(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

scheduleAdminRoutes.get("/templates", async (c) => c.json(await createServices(c.env.DB).scheduleService.templates()));

scheduleAdminRoutes.post("/templates", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return c.json(await scheduleService.createTemplate(await jsonBody<{ name?: unknown; texts?: unknown }>(c)));
  }),
);

scheduleAdminRoutes.put("/templates/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    const updated = await scheduleService.updateTemplate(idParam(c), await jsonBody<{ name?: unknown; texts?: unknown }>(c));
    return updated ? c.json(updated) : notFound(c);
  }),
);

scheduleAdminRoutes.post("/templates/:id/translate", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    const { languages } = await scheduleService.getLanguages(c.env);
    const updated = await scheduleService.translate(idParam(c), languages, translateAi(c.env));
    return updated ? c.json(updated) : notFound(c);
  }),
);

scheduleAdminRoutes.delete("/templates/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return (await scheduleService.deleteTemplate(idParam(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

scheduleAdminRoutes.get("/events", async (c) => c.json(await createServices(c.env.DB).scheduleService.events()));

scheduleAdminRoutes.post("/events", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return c.json(await scheduleService.createEvent(await jsonBody<ScheduleEventInput>(c)));
  }),
);

scheduleAdminRoutes.put("/events/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    const updated = await scheduleService.updateEvent(idParam(c), await jsonBody<Partial<ScheduleEventInput>>(c));
    return updated ? c.json(updated) : notFound(c);
  }),
);

scheduleAdminRoutes.delete("/events/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return (await scheduleService.deleteEvent(idParam(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

scheduleAdminRoutes.post("/events/:id/notifications", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    const created = await scheduleService.createNotification(idParam(c), await jsonBody<NotificationInput>(c));
    return created ? c.json(created) : notFound(c);
  }),
);

scheduleAdminRoutes.put("/notifications/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    const updated = await scheduleService.updateNotification(idParam(c), await jsonBody<NotificationInput>(c));
    return updated ? c.json(updated) : notFound(c);
  }),
);

scheduleAdminRoutes.delete("/notifications/:id", async (c) =>
  respond(c, async () => {
    const { scheduleService } = createServices(c.env.DB);
    return (await scheduleService.deleteNotification(idParam(c))) ? c.json({ ok: true }) : notFound(c);
  }),
);

scheduleAdminRoutes.post("/notifications/:id/test", async (c) =>
  respond(c, async () => {
    const { scheduleService, notifyService } = createServices(c.env.DB);
    const { languages } = await scheduleService.getLanguages(c.env);
    const id = idParam(c);
    try {
      const ok = await notifyService.sendTest(id, languages);
      return ok ? c.json({ ok: true }) : notFound(c);
    } catch (err) {
      // A Discord refusal is an upstream failure, not a bad request.
      if (err instanceof ScheduleValidationError) return c.json({ error: err.message }, 502);
      throw err;
    }
  }),
);

/** Text-only sibling of the screenshot reader's runner — same model var, same neuron budget. */
function translateAi(env: Env): TranslateAi {
  const cfg = readAiConfig(env);
  return {
    cfg,
    usage: new AiUsageRepo(env.DB),
    run: async (prompt) =>
      (await env.AI.run(cfg.model as Parameters<Ai["run"]>[0], {
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        max_tokens: cfg.maxTokens,
        chat_template_kwargs: { enable_thinking: cfg.thinking },
      } as never)) as unknown as AiChatOutput,
  };
}

export default scheduleAdminRoutes;
