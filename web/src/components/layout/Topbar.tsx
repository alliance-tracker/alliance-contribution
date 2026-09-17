import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { hueForPath, titleForPath, subtitleForPath } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
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
          {subtitleKey && <p className="truncate text-[12px] text-muted">{t(subtitleKey)}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <LanguageSwitcher />
        <ThemeToggle />
        <ApiKeyDialog />
      </div>
    </header>
  );
}
