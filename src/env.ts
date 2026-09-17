import type { AiEnvKey } from "../shared/types";

// Worker bindings. Kept out of shared/types.ts so the SPA (which imports that file) never sees
// Workers runtime globals like D1Database/Ai/Fetcher/RateLimit.
export type Env = {
  DB: D1Database;
  AI: Ai;
  API_KEY: string;
  ADMIN_API_KEY: string;
  VIEWER_API_KEY: string;
  ASSETS: Fetcher;
  API_RATE_LIMIT: RateLimit;
  // Event scheduling (2026-09-17 spec). Opt-in per deployment: unset = the routes 404 and the cron
  // handler returns immediately, so the feature costs nothing on a deployment that does not want it.
  SCHEDULER_ENABLED?: string;
  NOTIFY_LANGUAGES?: string;
} & Partial<Record<AiEnvKey, string>>;
