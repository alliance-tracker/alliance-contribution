import { useMemo } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { ActivityDetail, ActivityType } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { instanceStats, valueSeries, dayRows, memberRows, type SeriesPoint } from "@/lib/activity-derive";
import { formatCompact, formatDate, formatNumber } from "@/lib/format";
import { activityFillVar } from "@/lib/activity";
import { useIsMobile } from "@/lib/useIsMobile";
import { RankByActivity } from "@/components/RankByActivity";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { AllianceRankBadge } from "@/components/AllianceRankBadge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="num text-[18px] font-bold leading-none">{value}</span>
    </div>
  );
}

// Full-history view needs the year: "2026-07-29" -> "Jul 29, 2026" in the UI locale.
const DATE_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

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
      <div className="mb-1 font-semibold">{formatDate(point.date, DATE_OPTS)}</div>
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
  const days = useMemo(() => (detail ? dayRows(detail) : []), [detail]);
  const members = useMemo(() => (detail ? memberRows(detail) : []), [detail]);

  if (!key && activities.length > 0) {
    return <Navigate to={`/activities/${activities[0].key}`} replace />;
  }

  const error = firstError(activitiesState, detailState);
  const busy = activitiesState.loading || detailState.loading;
  const unit = detail?.activity.unit_label ?? t("common.value");
  const instances = detail ? instanceStats(detail) : [];
  // Tiles still show every instance (including never-logged ones); the legend and chart lines only
  // cover instances actually logged, so there's no dead legend entry or flat empty line to explain.
  const logged = instances.filter((s) => s.events > 0);
  const totalParticipants = detail?.events.reduce((s, e) => s + e.participants, 0) ?? 0;
  const totalValue = detail?.events.reduce((s, e) => s + e.total_value, 0) ?? 0;
  const totalPoints = detail?.events.reduce((s, e) => s + e.total_points, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RankByActivity
          value={key ?? ""}
          onChange={(k) => navigate(`/activities/${encodeURIComponent(k)}`)}
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
            <Stat label={t("activity.eventDays")} value={formatNumber(detail.event_days)} />
            <Stat label={t("activity.participations")} value={formatNumber(totalParticipants)} />
            <Stat label={`${t("activity.total")} ${unit}`} value={formatNumber(totalValue)} />
            <Stat label={t("common.points")} value={formatNumber(totalPoints)} />
          </Card>

          {detail.activity.max_instance > 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {instances.map((s) => (
                <Card key={s.instance} className="flex flex-col gap-3 p-3 md:p-[18px]">
                  <div className="text-[14px] font-semibold">{t("activity.instance", { n: s.instance })}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label={t("activity.events")} value={formatNumber(s.events)} />
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
                {logged.map((s) => (
                  <span key={s.instance} className="flex items-center gap-1.5 text-[11px] text-muted">
                    <svg width="16" height="6" aria-hidden="true">
                      <line
                        x1="0"
                        y1="3"
                        x2="16"
                        y2="3"
                        stroke={activityFillVar(detail.activity.color)}
                        strokeWidth="2"
                        strokeDasharray={instanceDash(s.instance)}
                      />
                    </svg>
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
                  tickFormatter={(d: string) => formatDate(d, { month: "short", day: "numeric" })}
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
                {logged.map((s) => (
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

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-3 py-2.5 text-[14px] font-semibold md:px-[18px]">{t("activity.byDay")}</div>
            {/* Mobile: one card per day. */}
            <div className="md:hidden">
              {days.map((d) => (
                <div key={d.date} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{formatDate(d.date, DATE_OPTS)}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
                      <span className="font-mono">{d.week}</span>
                      {detail.activity.max_instance > 1 &&
                        d.byInstance.map((e, i) => (
                          <span key={i}>
                            {t("activity.instance", { n: i + 1 })}: <span className="num">{e ? formatNumber(e.participants) : "—"}</span>
                          </span>
                        ))}
                      {d.unmapped > 0 && <Badge variant="neutral">{t("common.unmapped")} {d.unmapped}</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-none flex-col items-end">
                    <span className="num text-[15px] font-bold leading-none">{formatNumber(d.total_value)}</span>
                    <span className="num text-[11px] text-muted">{formatNumber(d.total_points)} {t("common.points")}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead className="w-24">{t("common.week")}</TableHead>
                    {detail.activity.max_instance > 1 &&
                      instances.map((s) => (
                        <TableHead key={s.instance} className="w-28 text-end">{t("activity.instance", { n: s.instance })}</TableHead>
                      ))}
                    <TableHead className="w-28 text-end">{t("activity.participants")}</TableHead>
                    <TableHead className="w-32 text-end">{`${t("activity.total")} ${unit}`}</TableHead>
                    <TableHead className="w-24 text-end">{t("common.points")}</TableHead>
                    <TableHead className="w-24 text-end">{t("common.unmapped")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="font-semibold">{formatDate(d.date, DATE_OPTS)}</TableCell>
                      <TableCell className="font-mono text-[12px] text-muted">{d.week}</TableCell>
                      {detail.activity.max_instance > 1 &&
                        d.byInstance.map((e, i) => (
                          <TableCell key={i} className="num text-end">{e ? formatNumber(e.participants) : "—"}</TableCell>
                        ))}
                      <TableCell className="num text-end">{formatNumber(d.participants)}</TableCell>
                      <TableCell className="num text-end font-semibold">{formatNumber(d.total_value)}</TableCell>
                      <TableCell className="num text-end">{formatNumber(d.total_points)}</TableCell>
                      <TableCell className="text-end">{d.unmapped > 0 ? <Badge variant="neutral">{d.unmapped}</Badge> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-3 py-2.5 text-[14px] font-semibold md:px-[18px]">{t("activity.byMember")}</div>
            <div className="md:hidden">
              {members.map((m) => (
                <Link
                  key={m.member_id}
                  to={`/members/${m.member_id}`}
                  className="flex items-center gap-2.5 border-b border-border py-2.5 ps-3 pe-3.5 last:border-b-0 active:brightness-95"
                >
                  <Avatar name={m.governor} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-foreground">{m.governor}</span>
                      <AllianceRankBadge rank={m.alliance_rank} className="shrink-0" />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <span className="num">{m.appearances}/{detail.event_days}</span>
                      <span className="sr-only">{t("nav.attendance")}</span>
                      <AttendanceBadge pct={m.pct} />
                    </div>
                  </div>
                  <div className="flex flex-none flex-col items-end">
                    <span className="num text-[15px] font-bold leading-none">{formatNumber(m.total_value)}</span>
                    <span className="num text-[11px] text-muted">{formatNumber(m.total_points)} {t("common.points")}</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("common.member")}</TableHead>
                    <TableHead className="w-[110px]">{t("common.allianceRank")}</TableHead>
                    <TableHead className="w-32 text-end">{t("activity.appearances")}</TableHead>
                    <TableHead className="w-24 text-end">{t("nav.attendance")}</TableHead>
                    <TableHead className="w-32 text-end">{`${t("activity.total")} ${unit}`}</TableHead>
                    <TableHead className="w-32 text-end">{t("activity.avgPerAppearance")}</TableHead>
                    <TableHead className="w-24 text-end">{t("common.points")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.member_id}>
                      <TableCell>
                        <Link to={`/members/${m.member_id}`} className="flex items-center gap-2 font-semibold hover:underline">
                          <Avatar name={m.governor} size={24} />
                          {m.governor}
                        </Link>
                      </TableCell>
                      <TableCell><AllianceRankBadge rank={m.alliance_rank} /></TableCell>
                      <TableCell className="num text-end">{m.appearances}/{detail.event_days}</TableCell>
                      <TableCell className="text-end"><AttendanceBadge pct={m.pct} /></TableCell>
                      <TableCell className="num text-end font-semibold">{formatNumber(m.total_value)}</TableCell>
                      <TableCell className="num text-end">{formatNumber(Math.round(m.avg_value))}</TableCell>
                      <TableCell className="num text-end">{formatNumber(m.total_points)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
