import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { IconTile, Strip } from "@/components/ui/tone";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { EmptyState } from "@/components/States";
import type { AttendanceLike } from "@/lib/overview-derive";

/**
 * Members below the 50% attendance line, worst first.
 *
 * Invariant: `total` is the full count below the line and `rows` is a slice of it, so
 * `total >= rows.length`. The empty state branches on `total` so the subtitle and the empty state
 * can never contradict.
 */
export function AtRiskPanel({ rows, total }: { rows: AttendanceLike[]; total: number }) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <Strip tone="red" className="flex items-center gap-2.5 px-4 pt-4 md:border-b md:px-4 md:py-3">
        <IconTile icon={Activity} tone="red" />
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold md:text-risk-fg">{t("overview.atRisk.title")}</h2>
          <p className="mt-0.5 text-[12px] text-muted md:text-down">
            <Trans
              i18nKey="overview.atRisk.summary"
              count={total}
              components={{ 1: <span className="num" /> }}
            />
          </p>
        </div>
      </Strip>
      <div className="px-4 pb-4 md:px-[18px] md:pb-[18px]">
        {total === 0 ? (
          <EmptyState message={t("overview.atRisk.empty")} />
        ) : (
          <ul className="mt-3 flex flex-col">
            {rows.map((row) => (
              <li
                key={row.member_id}
                className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
              >
                <Avatar name={row.governor} size={26} className="md:hidden" />
                <Avatar name={row.governor} size={26} tone="risk" className="hidden md:flex" />
                <Link
                  to={`/members/${row.member_id}`}
                  title={row.governor}
                  className="min-w-0 flex-1 truncate text-[14px] hover:underline"
                >
                  {row.governor}
                </Link>
                {/* AttendanceBadge renders a bare "14%"; without this the row announces the number
                    with nothing saying what it measures. Labelled here, not in the shared badge. */}
                <span className="sr-only">{t("nav.attendance")}</span>
                <AttendanceBadge pct={row.pct} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
