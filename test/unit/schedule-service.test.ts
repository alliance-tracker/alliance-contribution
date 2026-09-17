import { describe, expect, it } from "vitest";
import { DEFAULT_AI_CONFIG } from "../../shared/types";
import type { ScheduleRepo, TranslationRow } from "../../src/repositories/schedule-repo";
import type { SettingsRepo } from "../../src/repositories/settings-repo";
import { ScheduleAiError, ScheduleService, type TranslateAi } from "../../src/services/schedule-service";

const SOURCE = "Get ready! {event} starts {time}.";
const NOW = () => new Date("2026-09-17T12:00:00Z");

/** Fake repo + fake AI: this covers the translate branches (skip, accept, reject, exhausted) without
 *  D1 or Workers AI. The neuron accounting itself is the screenshot reader's, already unit-tested. */
function harness(reply: (lng: string) => string, seededNeurons = 0) {
  const translations: TranslationRow[] = [{ template_id: 1, lng: "en", text: SOURCE }];
  const prompts: string[] = [];
  const usage = { neurons: seededNeurons, requests: 0 };

  const repo = {
    async template(id: number) { return id === 1 ? { id: 1, name: "Get ready", default_key: "get_ready" } : null; },
    async translations() { return translations; },
    async setTranslation(templateId: number, lng: string, text: string) {
      translations.push({ template_id: templateId, lng, text });
    },
  };

  const ai: TranslateAi = {
    cfg: DEFAULT_AI_CONFIG,
    usage: {
      async get() { return { ...usage }; },
      async add(_day, neurons) { usage.neurons += neurons; usage.requests += 1; },
    },
    run: async (prompt) => {
      prompts.push(prompt);
      const lng = /code "(\w+)"/.exec(prompt)![1];
      return { choices: [{ message: { content: reply(lng) }, finish_reason: "stop" }], usage: { neurons: 2 } };
    },
  };

  const settings = { async get() { return null; }, async set() {} } as unknown as SettingsRepo;
  const svc = new ScheduleService(repo as unknown as ScheduleRepo, settings, globalThis.fetch, NOW);
  return { svc, ai, prompts, usage, translations };
}

describe("ScheduleService.translate", () => {
  it("calls the model once per missing non-English language and stores the result", async () => {
    const { svc, ai, prompts, usage } = harness((lng) => `[${lng}] {event} {time}`);
    const out = await svc.translate(1, ["en", "fr", "de"], ai);

    expect(prompts).toHaveLength(2); // en is the source, never translated
    expect(prompts[0]).toContain("French");
    expect(prompts[0]).toContain(SOURCE);
    expect(out?.texts).toEqual({ en: SOURCE, fr: "[fr] {event} {time}", de: "[de] {event} {time}" });
    expect(usage).toEqual({ neurons: 4, requests: 2 });
  });

  it("leaves a language empty when the model mangles a placeholder — but still pays for the call", async () => {
    const { svc, ai, usage } = harness(() => "{evento} commence bientôt");
    const out = await svc.translate(1, ["en", "fr"], ai);
    expect(out?.texts.fr).toBeUndefined();
    expect(usage.requests).toBe(1);
  });

  it("skips a language that already has text", async () => {
    const { svc, ai, prompts, translations } = harness((lng) => `[${lng}] {event} {time}`);
    translations.push({ template_id: 1, lng: "fr", text: "déjà traduit {event} {time}" });
    await svc.translate(1, ["en", "fr"], ai);
    expect(prompts).toEqual([]);
  });

  it("refuses before spending anything when the neuron reserve is gone", async () => {
    const { svc, ai, prompts } = harness(() => "x", DEFAULT_AI_CONFIG.dailyNeuronLimit);
    await expect(svc.translate(1, ["en", "fr"], ai)).rejects.toThrow(ScheduleAiError);
    expect(prompts).toEqual([]);
  });

  it("returns null for an unknown template", async () => {
    const { svc, ai } = harness(() => "x");
    expect(await svc.translate(99, ["en", "fr"], ai)).toBeNull();
  });
});
