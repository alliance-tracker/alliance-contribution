import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The app themes by redefining --color-* vars under .dark (no dark: variants), so a token added to
 * @theme without a .dark value silently keeps its light colour on dark surfaces. This keeps the two
 * blocks in step.
 */

const css = readFileSync(fileURLToPath(new URL("../../web/src/index.css", import.meta.url)), "utf8");

function colorTokens(blockStart: string): Map<string, string> {
  const start = css.indexOf(blockStart);
  if (start < 0) throw new Error(`block not found: ${blockStart}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const light = colorTokens("@theme {");
const dark = colorTokens(".dark {");

// Same value in both themes on purpose: they sit on the fixed navy sidebar, or are a fixed wash.
const FIXED = /^(sidebar|nav-|warn-wash$)/;

describe("theme tokens", () => {
  it("gives every theme-dependent colour a dark value", () => {
    const missing = [...light.keys()].filter((k) => !FIXED.test(k) && !dark.has(k));
    expect(missing).toEqual([]);
  });

  it("defines no dark token that the light theme lacks", () => {
    expect([...dark.keys()].filter((k) => !light.has(k))).toEqual([]);
  });

  it("keeps fixed tokens out of the dark block", () => {
    expect([...dark.keys()].filter((k) => FIXED.test(k))).toEqual([]);
  });

  it("has the design-refresh tokens", () => {
    const tones = ["amber", "red", "blue", "teal", "orange"].flatMap((t) => [
      `tone-${t}`,
      `tone-${t}-bg`,
      `tone-${t}-border`,
    ]);
    const navs = ["overview", "ranking", "members", "attendance", "activities", "admin"].map((n) => `nav-${n}`);
    const expected = [
      "border-strong",
      "sidebar",
      "sidebar-fg",
      "sidebar-muted",
      ...tones,
      "tone-pink",
      "tone-blue-fg",
      ...navs,
      "warn-wash",
    ];
    expect(expected.filter((k) => !light.has(k))).toEqual([]);
  });

  it("uses the navy palette with an ink accent and orange leadership", () => {
    expect(light.get("foreground")).toBe("#141e2a");
    expect(light.get("accent")).toBe("#141e2a");
    expect(dark.get("surface")).toBe("#13202f");
    expect(light.get("band-lead")).toBe("#f97316");
    expect(dark.get("rank5-bg")).toBe("#fb923c");
  });
});
