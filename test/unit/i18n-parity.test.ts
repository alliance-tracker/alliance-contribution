import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Guards the five locale files against drift. en.json is the source of truth (typed t() keys come from
 * it); this test is what keeps es/fr/de/ko honest, since i18next silently renders the key path for a
 * missing translation.
 */

const LOCALES_DIR = fileURLToPath(new URL("../../web/src/locales/", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("../../web/src/", import.meta.url));
const LANGUAGES = ["en", "es", "fr", "de", "ko"] as const;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

type Flat = Record<string, string>;

function flatten(obj: unknown, prefix = "", out: Flat = {}): Flat {
  if (typeof obj === "string") {
    out[prefix] = obj;
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    throw new Error(`non-string leaf at ${prefix}`);
  }
  return out;
}

function load(lng: string): Flat {
  return flatten(JSON.parse(readFileSync(`${LOCALES_DIR}${lng}.json`, "utf8")));
}

/** "atRisk.summary_one" → { base: "atRisk.summary", suffix: "one" }; non-plural → suffix null. */
function splitPlural(key: string): { base: string; suffix: string | null } {
  const m = PLURAL_SUFFIX.exec(key);
  return m ? { base: key.slice(0, m.index), suffix: m[1] } : { base: key, suffix: null };
}

/** Map base key → set of suffixes ("" for a non-plural key). */
function byBase(flat: Flat): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const key of Object.keys(flat)) {
    const { base, suffix } = splitPlural(key);
    if (!out.has(base)) out.set(base, new Set());
    out.get(base)!.add(suffix ?? "");
  }
  return out;
}

function placeholders(value: string): string {
  const names = [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
  const tags = [...value.matchAll(/<(\d+)>/g)].map((m) => m[1]).sort();
  return JSON.stringify({ names, tags });
}

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) walkSources(`${path}/`, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(readFileSync(path, "utf8"));
  }
  return out;
}

const en = load("en");
const enBases = byBase(en);

describe("locale parity", () => {
  it("en has at least one key", () => {
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  for (const lng of LANGUAGES.filter((l) => l !== "en")) {
    describe(lng, () => {
      const flat = load(lng);
      const bases = byBase(flat);
      const categories = new Set(new Intl.PluralRules(lng).resolvedOptions().pluralCategories);

      it("has exactly the base keys en has", () => {
        expect([...bases.keys()].sort()).toEqual([...enBases.keys()].sort());
      });

      it("has the plural forms its language needs, and no plural forms for non-plural keys", () => {
        for (const [base, enSuffixes] of enBases) {
          const got = bases.get(base) ?? new Set();
          if (enSuffixes.has("")) {
            expect(got, base).toEqual(new Set([""]));
          } else {
            expect([...got].sort(), base).toEqual([...categories].sort());
          }
        }
      });

      it("has no empty values", () => {
        for (const [key, value] of Object.entries(flat)) expect(value.trim(), key).not.toBe("");
      });

      it("keeps every {{placeholder}} and <n> tag from en", () => {
        for (const [key, enValue] of Object.entries(en)) {
          const { base, suffix } = splitPlural(key);
          if (suffix === null) {
            expect(flat[key], key).toBeDefined();
            expect(placeholders(flat[key]!), key).toBe(placeholders(enValue));
            continue;
          }
          // Compare against every form of the same base in the target (plural sets differ by language).
          const targets = Object.entries(flat).filter(([k]) => splitPlural(k).base === base);
          expect(targets.length, key).toBeGreaterThan(0);
          for (const [targetKey, targetValue] of targets) {
            expect(placeholders(targetValue), targetKey).toBe(placeholders(enValue));
          }
        }
      });
    });
  }

  it("has no dead keys: every en base key (or a dotted ancestor) appears as a literal in web/src", () => {
    const source = walkSources(SRC_DIR).join("\n");
    const isReferenced = (key: string) =>
      source.includes(`"${key}"`) || source.includes(`'${key}'`) || source.includes(`\`${key}\``);

    const dead: string[] = [];
    for (const base of enBases.keys()) {
      const parts = base.split(".");
      const referenced =
        isReferenced(base) ||
        parts.some((_, i) => source.includes(`\`${parts.slice(0, parts.length - i).join(".")}.\${`));
      if (!referenced) dead.push(base);
    }
    expect(dead).toEqual([]);
  });
});
