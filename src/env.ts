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
} & Partial<Record<AiEnvKey, string>>;
