import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { MemberSnapshotSeries } from "@shared/types";
import { Card } from "@/components/ui/card";
import { formatNumber, formatCompact, lang } from "@/lib/format";

/** "2026-07-29" -> "Jul 29". Falls back to the raw value if it is not an ISO date. */
function dateLabel(d: string): string {
  const parsed = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(lang(), { month: "short", day: "numeric", timeZone: "UTC" });
}

/** ≥1M compact in the active locale ("64.2M" en, "64,2 Mio." de, "6420만" ko); smaller values grouped. */
function powerLabel(v: number): string {
  return v >= 1_000_000 ? formatCompact(v) : formatNumber(v);
}

type Point = { label: string; power: number | null; position: number | null };

type HistoryTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { payload?: Point }[];
};

/** Tooltip: the capture date over power and position, saying so when the member was absent. */
function HistoryTooltip({ active, payload, label }: HistoryTooltipProps) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const absent = point.power === null && point.position === null;
  return (
    <div className="rounded-[8px] border border-border bg-surface px-2.5 py-1.5 shadow-md">
      <div className="num mb-1 text-[11px] text-muted">{label}</div>
      {absent ? (
        <div className="text-[12px] text-muted">{t("powerHistory.absent")}</div>
      ) : (
        <>
          <div className="text-[12px]">
            <span className="text-muted">{t("common.power")}</span>
            <span className="num ml-2 font-semibold text-foreground">
              {point.power === null ? "—" : formatNumber(point.power)}
            </span>
          </div>
          <div className="text-[12px]">
            <span className="text-muted">{t("common.position")}</span>
            <span className="num ml-2 font-semibold text-foreground">
              {point.position === null ? "—" : `#${point.position}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Power and power-leaderboard position over every capture.
 *
 * The X axis is the FULL capture axis, not this member's rows: a date the member was absent from
 * emits a null point, and `connectNulls={false}` breaks the line there. Interpolating or zero-filling
 * would draw a power collapse that never happened — the member simply was not in that paste.
 *
 * The position axis is reversed so #1 sits at the top, which is how the in-game board reads.
 */
export function PowerHistoryCard({
  series,
  totalMembers,
}: {
  series: MemberSnapshotSeries;
  totalMembers?: number;
}) {
  const { t } = useTranslation();
  const data = useMemo<Point[]>(() => {
    const byDate = new Map(series.rows.map((r) => [r.captured_on, r]));
    return series.captures.map((d) => {
      const row = byDate.get(d);
      return { label: dateLabel(d), power: row?.power ?? null, position: row?.power_position ?? null };
    });
  }, [series]);

  const observed = data.filter((p) => p.power !== null || p.position !== null).length;

  // Subtitle summary: capture count, date range, and the latest observed power/position. "now" is
  // the last capture the member appeared in — a member absent from the newest paste keeps their
  // most recent observed values rather than showing nothing.
  const latest = [...data].reverse().find((p) => p.power !== null || p.position !== null);
  const subtitle = [
    t("powerHistory.captures", { observed, total: series.captures.length }),
    data.length > 0 ? `${data[0].label} – ${data[data.length - 1].label}` : null,
    latest?.power !== null && latest?.power !== undefined
      ? t("powerHistory.now", { power: powerLabel(latest.power) })
      : null,
    latest?.position !== null && latest?.position !== undefined
      ? totalMembers
        ? t("powerHistory.positionOf", { position: latest.position, total: totalMembers })
        : t("powerHistory.position", { position: latest.position })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold">{t("powerHistory.title")}</div>
          <div className="text-[12px] text-muted">{subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-full bg-accent" />
            {t("common.power")}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-full bg-muted" />
            {t("common.position")}
          </span>
        </div>
      </div>

      {series.captures.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-muted">{t("powerHistory.emptyCaptures")}</div>
      ) : observed === 0 ? (
        <div className="py-10 text-center text-[13px] text-muted">{t("powerHistory.emptyMember")}</div>
      ) : (
        <ResponsiveContainer width="100%" height={230} className="mt-3">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--color-border)"
              tickLine={false}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
            />
            <YAxis
              yAxisId="power"
              stroke="var(--color-border)"
              tickLine={false}
              width={52}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
              tickFormatter={powerLabel}
            />
            <YAxis
              yAxisId="position"
              orientation="right"
              reversed
              allowDecimals={false}
              stroke="var(--color-border)"
              tickLine={false}
              width={34}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
            />
            <Tooltip content={<HistoryTooltip />} cursor={{ stroke: "var(--color-border)" }} />
            {/* connectNulls stays false on BOTH lines: a missing capture is unknown, not a straight line. */}
            <Line
              yAxisId="power"
              type="monotone"
              dataKey="power"
              name={t("common.power")}
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
            />
            <Line
              yAxisId="position"
              type="monotone"
              dataKey="position"
              name={t("common.position")}
              stroke="var(--color-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={{ r: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
