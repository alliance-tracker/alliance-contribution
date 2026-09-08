import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { ActivityDetail, ActivityType } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { instanceStats, valueSeries, type SeriesPoint } from "@/lib/activity-derive";
import { formatCompact, formatNumber, localeTag } from "@/lib/format";
import { activityFillVar } from "@/lib/activity";
import { useIsMobile } from "@/lib/useIsMobile";
import { RankByActivity } from "@/components/RankByActivity";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="num text-[18px] font-bold leading-none">{value}</span>
    </div>
  );
}

/** "2026-07-29" -> "Jul 29" in the UI locale. */
function dateLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(localeTag(), { month: "short", day: "numeric", timeZone: "UTC" });
}

function valueLabel(v: number): string {
  return v >= 1_000_000 ? formatCompact(v) : formatNumber(v);
}

// Instance n: same activity colour, increasingly dashed so 1..max_instance stay distinguishable
// however high max_instance goes (admin-editable, no ceiling). Instance 1 stays solid.
function instanceDash(n: number): string | undefined {
  return n === 1 ? undefined : `${n * 2} 3`;
}

function ValueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string; payload: SeriesPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[6px] border border-border bg-surface px-2.5 py-2 text-[12px] shadow-sm">
      <div className="mb-1 font-semibold">{dateLabel(point.date)}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num font-semibold">{formatNumber(p.value as number)}</span>
          </div>
        ))}
    </div>
  );
}

export function Activity() {
  const { t } = useTranslation();
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();

  const activitiesState = useApi<ActivityType[]>(() => api.activityTypes.list({ active: true }), []);
  const activities = useMemo(
    () => (activitiesState.data ?? []).slice().sort((a, b) => a.sort - b.sort),
    [activitiesState.data],
  );

  // 404 → data null with no error: the page shows "unknown" but keeps the selector usable.
  const detailState = useApi<ActivityDetail | null>(
    () =>
      key
        ? api.activities.detail(key).catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 404) return null;
            throw e;
          })
        : Promise.resolve(null),
    [key],
  );

  const detail = detailState.data;
  const mobile = useIsMobile();
  const series = useMemo(() => (detail ? valueSeries(detail) : []), [detail]);

  if (!key && activities.length > 0) {
    return <Navigate to={`/activities/${activities[0].key}`} replace />;
  }

  const error = firstError(activitiesState, detailState);
  const busy = activitiesState.loading || detailState.loading;
  const unit = detail?.activity.unit_label ?? t("common.value");
  const instances = detail ? instanceStats(detail) : [];
  const totalParticipants = detail?.events.reduce((s, e) => s + e.participants, 0) ?? 0;
  const totalValue = detail?.events.reduce((s, e) => s + e.total_value, 0) ?? 0;
  const totalPoints = detail?.events.reduce((s, e) => s + e.total_points, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RankByActivity
          value={key ?? ""}
          onChange={(k) => navigate(`/activities/${k}`)}
          activities={activities}
          label={t("common.activity")}
          allowAll={false}
        />
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : busy ? (
        <LoadingState />
      ) : !detail ? (
        <EmptyState message={t("activity.unknown", { key: key ?? "" })} />
      ) : detail.events.length === 0 ? (
        <EmptyState message={t("activity.empty")} />
      ) : (
        <>
          <Card className="flex flex-wrap gap-x-8 gap-y-3 p-3 md:p-[18px]">
            <Stat label={t("attendance.eventDays", { count: detail.event_days })} value={formatNumber(detail.event_days)} />
            <Stat label={t("activity.participants")} value={formatNumber(totalParticipants)} />
            <Stat label={`${t("activity.total")} ${unit}`} value={formatNumber(totalValue)} />
            <Stat label={t("common.points")} value={formatNumber(totalPoints)} />
          </Card>

          {detail.activity.max_instance > 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {instances.map((s) => (
                <Card key={s.instance} className="flex flex-col gap-3 p-3 md:p-[18px]">
                  <div className="text-[14px] font-semibold">{t("activity.instance", { n: s.instance })}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label={t("activity.events", { count: s.events })} value={formatNumber(s.events)} />
                    <Stat label={t("activity.avgParticipants")} value={formatNumber(Math.round(s.avg_participants))} />
                    <Stat label={`${t("activity.avg")} ${unit}`} value={formatNumber(Math.round(s.avg_value))} />
                    <Stat label={`${t("activity.total")} ${unit}`} value={formatNumber(s.total_value)} />
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card className="p-3 md:p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[14px] font-semibold">{t("activity.chartTitle", { unit })}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {instances.map((s) => (
                  <span key={s.instance} className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="size-2 rounded-full" style={{ background: activityFillVar(detail.activity.color) }} />
                    {t("activity.instance", { n: s.instance })}
                  </span>
                ))}
                {detail.activity.max_instance > 1 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="size-2 rounded-full bg-accent" />
                    {t("activity.total")}
                  </span>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={mobile ? 180 : 240} className="mt-3">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dateLabel}
                  stroke="var(--color-border)"
                  tickLine={false}
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
                />
                <YAxis
                  stroke="var(--color-border)"
                  tickLine={false}
                  width={72}
                  tickFormatter={valueLabel}
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
                />
                <Tooltip content={<ValueTooltip />} cursor={{ stroke: "var(--color-border)" }} />
                {/* connectNulls false: an instance not logged that day is a gap, not a straight line. */}
                {instances.map((s) => (
                  <Line
                    key={s.instance}
                    type="monotone"
                    dataKey={`i${s.instance}`}
                    name={t("activity.instance", { n: s.instance })}
                    stroke={activityFillVar(detail.activity.color)}
                    strokeWidth={1.5}
                    strokeDasharray={instanceDash(s.instance)}
                    dot={{ r: 2 }}
                    connectNulls={false}
                  />
                ))}
                {detail.activity.max_instance > 1 && (
                  <Line
                    type="monotone"
                    dataKey="total"
                    name={t("activity.total")}
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Task 5: by-day and by-member tables */}
        </>
      )}
    </div>
  );
}
