import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LANGUAGES, setLanguage, type Language } from "@/i18n";
import { lang } from "@/lib/format";

// Native names read the same in every UI language, so they are literals, not keys.
const NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ko: "한국어",
  ar: "العربية",
};

/** Globe button → list of the six languages. Picking one persists it and reloads (see i18n.ts). */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const current = lang();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={t("language.label")}>
          <Languages />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {LANGUAGES.map((lng) => (
          <button
            key={lng}
            type="button"
            lang={lng}
            aria-current={lng === current || undefined}
            onClick={() => lng !== current && setLanguage(lng)}
            className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            {NAMES[lng]}
            {lng === current && <Check className="size-4 text-accent" aria-hidden />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
