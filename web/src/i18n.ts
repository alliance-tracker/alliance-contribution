import i18n, { type ParseKeys } from "i18next";
import { initReactI18next } from "react-i18next";

export const LANGUAGES = ["en", "es", "fr", "de", "ko"] as const;
export type Language = (typeof LANGUAGES)[number];
/** A key of en.json, e.g. "nav.overview". Use for props/consts that hold a key rather than text. */
export type TKey = ParseKeys;

const KEY = "lang";

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

// Stored choice, else the first browser language we support, else English. Read once per page load —
// no ongoing OS follow, same rule as theme.ts. localStorage can throw (Safari private mode).
export function getLanguage(): Language {
  try {
    const stored = localStorage.getItem(KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* ignore */
  }
  for (const tag of navigator.languages ?? []) {
    const prefix = tag.slice(0, 2).toLowerCase();
    if (isLanguage(prefix)) return prefix;
  }
  return "en";
}

// Language is fixed for the page lifetime; a reload is the whole re-render story.
export function setLanguage(lng: Language): void {
  try {
    localStorage.setItem(KEY, lng);
  } catch {
    /* ignore */
  }
  location.reload();
}

export async function initI18n(): Promise<void> {
  const lng = getLanguage();
  const { default: translation } = (await import(`./locales/${lng}.json`)) as {
    default: Record<string, unknown>;
  };
  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: "en",
    supportedLngs: LANGUAGES,
    resources: { [lng]: { translation } },
    interpolation: { escapeValue: false }, // React escapes
    react: { useSuspense: false }, // nothing loads after init
  });
  document.documentElement.lang = lng;
}

export default i18n;
