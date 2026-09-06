import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/States";

/**
 * The unresolved raw names waiting on an alias decision. Names are shown verbatim in mono and wrap
 * rather than truncate — the alliance runs deliberate decoy renames, so a near-identical name is a
 * different person and the operator needs to read the exact characters. Ellipsising two decoy names
 * that differ only in their suffix would render them byte-identical, which is the single mistake
 * this panel exists to prevent.
 *
 * Invariant: `total` is the full queue count and `names` is a slice of it, so `total >= names.length`.
 * The empty state branches on `total` so the subtitle and the empty state can never contradict.
 */
export function UnmappedPanel({
  names,
  total,
  canManage,
}: {
  names: string[];
  total: number;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-flag-border bg-flag-bg p-[18px]">
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-4 text-flag-accent" />
        <h2 className="text-[15px] font-semibold text-flag-fg">{t("overview.unmappedQueue")}</h2>
      </div>
      <p className="mt-0.5 text-[12px] text-flag-accent">
        <Trans
          i18nKey="overview.unmapped.summary"
          count={total}
          components={{ 1: <span className="num" /> }}
        />
      </p>

      {total === 0 ? (
        <EmptyState message={t("overview.unmapped.empty")} />
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {names.map((name) => (
            <li
              key={name}
              className="num break-all rounded-[6px] border border-flag-border bg-surface px-3 py-2 text-[13px]"
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      {canManage && total > 0 && (
        <Link
          to="/admin/aliases"
          className="mt-3 flex h-[38px] items-center justify-center rounded-[6px] border border-flag-border bg-surface text-[13px] font-semibold text-foreground transition-colors hover:bg-muted-surface active:bg-muted-surface"
        >
          {t("overview.unmapped.resolve")}
        </Link>
      )}
    </Card>
  );
}
