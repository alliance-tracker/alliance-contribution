import { useTranslation } from "react-i18next";

/** What a key holder sees while KvK Prep is off. Static: no fetch (it would 401), no poll — the holder
 *  reloads once the host reopens it. */
export function KvkClosed() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-20 max-w-[460px] rounded-[12px] border border-border bg-background p-8 text-center">
      <h2 className="text-[15px] font-semibold text-foreground">{t("kvk.holder.closedTitle")}</h2>
      <p className="mt-1.5 text-[13px] text-muted">{t("kvk.holder.closedBody")}</p>
    </div>
  );
}
