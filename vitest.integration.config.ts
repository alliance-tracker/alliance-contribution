import { readFileSync } from "node:fs";
import path from "node:path";
import { defineProject } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

const seedSql = readFileSync(path.join(import.meta.dirname, "seed/seed.sql"), "utf8");
const SEED_STATEMENTS = seedSql.match(/INSERT INTO[\s\S]*?;/g) ?? [];

export default defineProject({
  plugins: [
    cloudflareTest(async () => ({
      // No `wrangler.toml` here on purpose: that file is per-deployment and gitignored, and its
      // `[ai] remote = true` makes the pool authenticate to Cloudflare at boot. Tests never call AI
      // (the service is unit-tested with a fake runner; the route's AI-reaching paths are covered by
      // pre-seeded ai_usage rows), so declare only what the Worker touches under test.
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-07-22",
        d1Databases: ["DB"],
        ratelimits: {
          API_RATE_LIMIT: { namespace_id: "1001", simple: { limit: 120, period: 60 } },
        },
        bindings: {
          API_KEY: "test-key",
          ADMIN_API_KEY: "test-admin-key",
          VIEWER_API_KEY: "test-viewer-key",
          // The scheduler is opt-in per deployment; tests exercise the enabled side. The disabled
          // side (routes 404) is covered by a direct unit test of the guard middleware.
          SCHEDULER_ENABLED: "true",
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          // Read here, in node (integration tests run in workerd), then handed to the test as a
          // binding — same pattern as TEST_MIGRATIONS above.
          SEED_STATEMENTS: SEED_STATEMENTS,
        },
      },
    })),
  ],
  test: {
    name: "integration",
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/integration/setup.ts"],
  },
});
