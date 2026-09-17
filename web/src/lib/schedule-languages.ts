import { LANGUAGE_FLAGS, LANGUAGE_NAMES } from "@shared/types";

/** Flag for a Discord post language; an unmapped code falls back to the code itself. */
export const languageFlag = (code: string): string => LANGUAGE_FLAGS[code] ?? code.toUpperCase();

/** English name of a language — Discord-side operator data, deliberately not translated. */
export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code.toUpperCase();

/** "German" or "de" → "de". Anything else (an unknown word, a typo) → null. */
export function parseLanguageInput(raw: string): string | null {
  const query = raw.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(query)) return query;
  return Object.keys(LANGUAGE_NAMES).find((code) => LANGUAGE_NAMES[code].toLowerCase() === query) ?? null;
}
