import { Hono } from "hono";
import type { ScreenshotKind } from "../../shared/types";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { readAiConfig } from "../domain/screenshot";
import { AiUsageRepo } from "../repositories/ai-usage-repo";
import { ScreenshotError, ScreenshotService, type AiChatOutput, type AiRunner } from "../services/screenshot-service";

const screenshotsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_BYTES = 8 * 1024 * 1024;
const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const STATUS: Record<ScreenshotError["code"], 422 | 429 | 502> = {
  not_a_screen: 422,
  exhausted: 429,
  read_failed: 502,
};

function service(env: Env): ScreenshotService {
  const cfg = readAiConfig(env);
  const runner: AiRunner = async (prompt, imageDataUri) =>
    // `usage.neurons` is not in the typed output, hence the widening cast. The model id is a var, so
    // it is not statically one of workers-types' known ids either.
    (await env.AI.run(cfg.model as Parameters<Ai["run"]>[0], {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUri } },
          ],
        },
      ],
      max_tokens: cfg.maxTokens,
      chat_template_kwargs: { enable_thinking: cfg.thinking },
    } as never)) as unknown as AiChatOutput;
  return new ScreenshotService(new AiUsageRepo(env.DB), runner, cfg);
}

screenshotsRoutes.get("/usage", async (c) => c.json(await service(c.env).usage()));

// Manager tier: reading returns text only, even for roster (applying a roster stays admin-only).
screenshotsRoutes.post("/read", async (c) => {
  // Reject oversized uploads before buffering the body.
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_BYTES) return c.json({ error: "image too large" }, 413);

  const body = await c.req.parseBody();
  const kind = body.kind;
  if (kind !== "event" && kind !== "roster") return c.json({ error: "invalid kind" }, 400);
  const image = body.image;
  if (!(image instanceof File)) return c.json({ error: "missing image" }, 400);
  if (!MIMES.has(image.type)) return c.json({ error: "unsupported image type" }, 400);
  if (image.size > MAX_BYTES) return c.json({ error: "image too large" }, 413);
  const unitLabel = typeof body.unitLabel === "string" ? body.unitLabel.slice(0, 64) : undefined;

  try {
    const result = await service(c.env).read({
      kind: kind as ScreenshotKind,
      unitLabel,
      image: await image.arrayBuffer(),
      mime: image.type,
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof ScreenshotError) return c.json({ error: err.code, usage: err.usage }, STATUS[err.code]);
    throw err;
  }
});

export default screenshotsRoutes;
