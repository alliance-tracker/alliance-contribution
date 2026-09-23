import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Admin-only warning on the Schedule tab while `event.enabled` is false — access keys can't sign
 *  in, though existing appointments stay intact. The CTA switches to the Event settings tab. */
export function DisabledBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-flag-border bg-flag-bg px-3.5 py-2.5 text-[13px] text-flag-fg">
      <span className="flex items-center gap-2">
        <Lock className="size-4 shrink-0 text-flag-accent" aria-hidden />
        {t("kvk.banner.text")}
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="border-flag-border text-[12.5px] font-semibold"
        onClick={onOpenSettings}
      >
        {t("kvk.banner.cta")}
      </Button>
    </div>
  );
}
