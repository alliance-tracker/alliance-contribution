import {
  DEFAULT_AI_CONFIG,
  type AiConfig,
  type ScreenshotErrorCode,
  type ScreenshotKind,
  type ScreenshotReadResult,
  type ScreenshotUsage,
} from "../../shared/types";
import {
  eventPrompt,
  finishReasonOk,
  isAllowanceError,
  parseModelOutput,
  rosterPrompt,
  toBase64,
  usageSnapshot,
  utcDay,
} from "../domain/screenshot";

/** The subset of a chat-completions response we read. `usage.neurons` is Cloudflare's billing field
 *  and is NOT in the workers-types output type — read it defensively (see `read`). */
export type AiChatOutput = {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { neurons?: number };
};

export type AiRunner = (prompt: string, imageDataUri: string) => Promise<AiChatOutput>;

type UsageRepo = {
  get(day: string): Promise<{ neurons: number; requests: number }>;
  add(day: string, neurons: number): Promise<void>;
};

export class ScreenshotError extends Error {
  constructor(
    public readonly code: ScreenshotErrorCode,
    public readonly usage: ScreenshotUsage,
  ) {
    super(code);
    this.name = "ScreenshotError";
  }
}

export type ReadInput = { kind: ScreenshotKind; unitLabel?: string; image: ArrayBuffer; mime: string };

export class ScreenshotService {
  constructor(
    private repo: UsageRepo,
    private run: AiRunner,
    private cfg: AiConfig = DEFAULT_AI_CONFIG,
    private now: () => Date = () => new Date(),
  ) {}

  async usage(): Promise<ScreenshotUsage> {
    const now = this.now();
    return usageSnapshot(await this.repo.get(utcDay(now)), now, this.cfg);
  }

  async read(input: ReadInput): Promise<ScreenshotReadResult> {
    const now = this.now();
    const day = utcDay(now);
    const before = usageSnapshot(await this.repo.get(day), now, this.cfg);
    if (before.used + this.cfg.reserveNeurons > before.limit || before.requests >= this.cfg.dailyRequestCap) {
      throw new ScreenshotError("exhausted", before);
    }

    const prompt = input.kind === "event" ? eventPrompt(input.unitLabel ?? "value shown") : rosterPrompt();
    const dataUri = `data:${input.mime};base64,${toBase64(input.image)}`;

    let out: AiChatOutput;
    try {
      out = await this.run(prompt, dataUri);
    } catch (err) {
      throw new ScreenshotError(isAllowanceError(err) ? "exhausted" : "read_failed", before);
    }

    // Tally first, parse second: the neurons are spent whatever the answer looks like.
    const reported = Number(out.usage?.neurons);
    const neurons = Number.isFinite(reported) && reported > 0 ? reported : this.cfg.neuronsPerRead;
    await this.repo.add(day, neurons);
    const usage = usageSnapshot(await this.repo.get(day), now, this.cfg);

    const choice = out.choices?.[0];
    if (!finishReasonOk(choice?.finish_reason)) throw new ScreenshotError("read_failed", usage);
    const parsed = parseModelOutput(input.kind, choice?.message?.content ?? "");
    if (parsed.kind === "not_a_screen") throw new ScreenshotError("not_a_screen", usage);
    return { lines: parsed.lines, rowCount: parsed.lines.length, neurons, usage };
  }
}
