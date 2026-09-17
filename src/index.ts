import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./env";
import type { AuthVariables } from "./middleware/auth";
import { apiKeyAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/rate-limit";
import activityTypesRoutes from "./routes/activity-types";
import adminRoutes from "./routes/admin";
import aliasesRoutes from "./routes/aliases";
import allocationsRoutes from "./routes/allocations";
import analyticsRoutes from "./routes/analytics";
import eventsRoutes from "./routes/events";
import membersRoutes from "./routes/members";
import scheduleAdminRoutes, { scheduleReadRoutes } from "./routes/schedule";
import screenshotsRoutes from "./routes/screenshots";
import settingsRoutes from "./routes/settings";
import unmappedRoutes from "./routes/unmapped";
import { createServices } from "./services";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.use("*", secureHeaders());
app.use("/api/*", rateLimit);
app.use("/api/*", apiKeyAuth);

app.get("/api/health", (c) => c.json({ ok: true }));

// Lets clients discover which tier the presented X-Api-Key resolves to. Public GET, always 200.
app.get("/api/auth/me", (c) => c.json({ role: c.get("role"), scheduler: c.env.SCHEDULER_ENABLED === "true" }));

app.route("/api/activity-types", activityTypesRoutes);
app.route("/api/admin/allocations", allocationsRoutes);
app.route("/api/admin/schedule", scheduleAdminRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/aliases", aliasesRoutes);
// Mounted at /api/ingests, not /api/events: ad blockers ship filter-list rules for `/api/event(s)`
// (a common analytics path), so the browser cancelled the request before it left the client.
app.route("/api/ingests", eventsRoutes);
app.route("/api/members", membersRoutes);
app.route("/api/schedule", scheduleReadRoutes);
app.route("/api/screenshots", screenshotsRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/unmapped", unmappedRoutes);
app.route("/api", analyticsRoutes);

// SPA fallback: serve the built index.html for any non-API GET so client-side routing and deep-link
// refreshes work (the Worker otherwise intercepts unmatched paths before the asset SPA fallback).
app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
  const url = new URL(c.req.url);
  url.pathname = "/index.html";
  return c.env.ASSETS.fetch(new Request(url, { headers: c.req.raw.headers }));
});

// Cron trigger (every minute when the deployment enables it). Guarded twice on purpose: a cron added
// without the var must not start posting to Discord. waitUntil so the tick returns immediately.
const scheduled: ExportedHandlerScheduledHandler<Env> = (_ev, env, ctx) => {
  if (env.SCHEDULER_ENABLED !== "true") return;
  const { notifyService, scheduleService } = createServices(env.DB);
  ctx.waitUntil(notifyService.runDue(async () => (await scheduleService.getLanguages(env)).languages));
};

export default { fetch: app.fetch, scheduled };
