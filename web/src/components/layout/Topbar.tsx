import { LogOut, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApiKey } from "@/lib/apiKey";
import { hueForPath, titleForPath, subtitleForPath } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { role, kvk } = useApiKey();
  const holder = role === "kvk";
  const titleKey = titleForPath(pathname);
  const subtitleKey = subtitleForPath(pathname);
  const hue = hueForPath(pathname);
  const title = titleKey ? t(titleKey) : "Alliance Tracker";
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface/85 ps-2 pe-3 backdrop-blur-md md:h-[61px] md:px-7">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 md:hidden"
          onClick={onMenuClick}
          aria-label={t("nav.openNavigation")}
        >
          <Menu />
        </Button>
        {hue && (
          <span
            className="hidden h-[30px] w-1 flex-none rounded-[2px] md:block"
            style={{ background: hue }}
            aria-hidden
          />
        )}
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground" title={title}>
            {title}
          </h1>
          {holder ? (
            <p className="truncate text-[12px] text-muted">
              {t("kvk.holder.subtitle", { alliance: kvk.alliance_name })}
            </p>
          ) : (
            subtitleKey && <p className="truncate text-[12px] text-muted">{t(subtitleKey)}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <LanguageSwitcher />
        <ThemeToggle />
        {holder ? <HolderControls /> : <ApiKeyDialog />}
      </div>
    </header>
  );
}

/** Key holder's top-bar right side: alliance chip with the masked key, then Sign out (clears the key,
 *  so KeyGate shows the prompt again). */
function HolderControls() {
  const { t } = useTranslation();
  const { kvk, setApiKey } = useApiKey();
  return (
    <>
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-[8px] border border-border bg-surface px-[13px]">
        <span className="size-2 flex-none rounded-full" style={{ background: kvk.color }} aria-hidden />
        <span className="max-w-[120px] truncate text-[13px] font-semibold text-foreground md:max-w-none">
          {kvk.alliance_name}
        </span>
        <span dir="ltr" className="hidden font-mono text-[11px] font-medium text-faint md:inline">
          {kvk.masked_key}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 max-md:size-9 max-md:p-0"
        onClick={() => setApiKey("")}
        aria-label={t("kvk.holder.signOut")}
      >
        <LogOut />
        <span className="hidden md:inline">{t("kvk.holder.signOut")}</span>
      </Button>
    </>
  );
}
