import i18n from "@/i18n";

/** BCP-47 tag of the loaded UI language. Fixed for the page lifetime (switching reloads). */
export const lang = (): string => i18n.resolvedLanguage ?? "en";

export const formatNumber = (n: number): string => n.toLocaleString(lang());

/** 1234567 → "1.2M" (en), "1,2 Mio." (de), "123.5만" (ko). Locale-native compact notation is accepted. */
export const formatCompact = (n: number): string =>
  new Intl.NumberFormat(lang(), { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Human-readable rendering of an ISO "YYYY-MM-DD" (data dates stay ISO; only display goes through here). */
export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions): string =>
  new Date(iso).toLocaleDateString(lang(), { timeZone: "UTC", ...opts });
