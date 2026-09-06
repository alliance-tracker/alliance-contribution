import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { AiUsageRepo } from "../../src/repositories/ai-usage-repo";

const { DB } = env;

describe("AiUsageRepo", () => {
  it("reads zeros for a day with no row", async () => {
    const repo = new AiUsageRepo(DB);
    expect(await repo.get("2099-01-01")).toEqual({ neurons: 0, requests: 0 });
  });

  it("sums neurons and counts requests across adds", async () => {
    const repo = new AiUsageRepo(DB);
    await repo.add("2099-02-02", 4.5);
    await repo.add("2099-02-02", 5.5);
    expect(await repo.get("2099-02-02")).toEqual({ neurons: 10, requests: 2 });
  });
});
