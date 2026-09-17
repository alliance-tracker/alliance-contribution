import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { ArrowLeft, BarChart3, ListChecks } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type {
  ActivityType,
  Alias,
  Attendance,
  MemberProfile as MemberProfileData,
  MemberSnapshotSeries,
  OverallRanking,
} from "@shared/types";
import { api, ApiError, type ScoringConfig } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { useIsMobile } from "@/lib/useIsMobile";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { AllianceRankBadge } from "@/components/AllianceRankBadge";
import { PowerHistoryCard } from "@/components/PowerHistoryCard";
import { IconTile } from "@/components/ui/tone";
import { StatCard } from "@/components/overview/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { activitySolidClass, activityFillVar } from "@/lib/activity";
import { formatNumber, localeTag } from "@/lib/format";
import type { TKey } from "@/i18n";

/** Monday (week-start) date of an ISO "YYYY-Www" label, or null if unparseable. */
function isoWeekStart(w: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(w);
  if (!m) return null;
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const jan4Mon = (jan4.getUTCDay() + 6) % 7; // Mon=0
  const d = new Date(jan4);
  d.setUTCDate(jan4.getUTCDate() - jan4Mon + (Number(m[2]) - 1) * 7);
  return d;
}

/** "2026-W22" -> "May 25". Falls back to the raw label if not an ISO week. */
function weekLabel(w: string): string {
  const d = isoWeekStart(w);
  return d ? d.toLocaleDateString(localeTag(), { month: "short", day: "numeric", timeZone: "UTC" }) : w;
}

/**
 * Bar dataKey for an activity. Activity keys are user-created at runtime, so they are namespaced
 * to keep one (e.g. a key literally named "label") from clobbering the chart's own X-axis key.
 */
function barKey(activityKey: string): string {
  return `a:${activityKey}`;
}

type CompTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string }[];
};

/** Composition tooltip: week label over each activity's points that week. */
function CompTooltip({ active, payload, label }: CompTooltipProps) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => (p.value ?? 0) > 0);
  return (
    <div className="rounded-[8px] border border-border bg-surface px-2.5 py-1.5 shadow-md">
      <div className="num mb-1 text-[11px] text-muted">{label}</div>
      {shown.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5 text-[12px]">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="num ms-auto font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One row in the "Score by activity" grid. Hovering fetches that activity's scoring config once
 * (lazily — most rows are never hovered) and shows the tier table in a tooltip.
 */
function ActivityRow({
  activity,
  stat,
  max,
}: {
  activity: ActivityType;
  stat: { points: number; appearances: number };
  max: number;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const requested = useRef(false);
  const load = () => {
    if (requested.current) return;
    requested.current = true;
    api.activityTypes
      .getScoring(activity.id)
      .then(setConfig)
      .catch(() => {
        requested.current = false; // tooltip is decoration — retry on next hover, never error the page
      });
  };
  const tiers = config ? [...config.tiers].sort((a, b) => a.min_value - b.min_value) : [];

  return (
    <div className="group relative flex items-center gap-2.5" onMouseEnter={load}>
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: activityFillVar(activity.color) }}
      />
      <span className="min-w-0 truncate text-[13px] font-medium">{activity.name}</span>
      <span className="num shrink-0 text-[11px] text-faint">×{stat.appearances}</span>
      {activity.active === 0 && (
        <span className="shrink-0 text-[11px] text-faint">{t("profile.inactive")}</span>
      )}
      <Progress
        value={Math.round((stat.points / max) * 100)}
        indicatorClassName={activitySolidClass(activity.color)}
        className="h-2 w-16 flex-none rounded-full md:w-auto md:min-w-14 md:flex-1"
      />
      <span className="num shrink-0 text-[13px] font-semibold">
        {stat.points} <span className="text-[11px] font-normal text-faint">{t("profile.pts")}</span>
      </span>

      {config && (
        <div className="pointer-events-none absolute bottom-full start-0 z-10 mb-1.5 hidden w-max rounded-[8px] border border-border bg-surface px-2.5 py-1.5 shadow-md group-hover:block">
          <div className="mb-1 text-[11px] text-muted">
            {t("profile.tooltipWeight", { activity: activity.name, weight: config.weight })}
          </div>
          {tiers.length === 0 ? (
            <div className="text-[12px] text-muted">{t("profile.noTiers")}</div>
          ) : (
            tiers.map((tier) => (
              <div key={tier.min_value} className="flex items-baseline gap-3 text-[12px]">
                <span className="num text-muted">
                  {t("profile.tierMin", { min: formatNumber(tier.min_value), unit: activity.unit_label })}
                </span>
                <span className="num ms-auto font-semibold text-foreground">
                  {t("profile.tierPoints", { count: tier.points })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function MemberProfile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const memberId = Number(id);
  const mobile = useIsMobile();

  // A 404 is a legitimate outcome (bad URL / removed member), not a fetch failure — resolve it to
  // null so the not-found copy stays reserved for that case and real errors surface their message.
  const profileState = useApi<MemberProfileData | null>(
    () =>
      api.members.profile(memberId).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    [memberId],
  );
  // ALL activity types, not just active ones: totals/perActivity cover deactivated activities too,
  // so the breakdown has to as well or it won't sum to the headline score.
  const activitiesState = useApi<ActivityType[]>(() => api.activityTypes.list(), []);
  const attendanceState = useApi<Attendance>(() => api.attendance(), []);
  const aliasesState = useApi<Alias[]>(() => api.aliases.list({ member_id: memberId }), [memberId]);
  const rankingState = useApi<OverallRanking>(() => api.rankings.overall(), []);
  // Same 404-is-an-answer handling as the profile fetch above: a bad member URL 404s BOTH endpoints,
  // and letting this one reach firstError would replace the "Member not found." copy with a raw error.
  const snapshotsState = useApi<MemberSnapshotSeries | null>(
    () =>
      api.members.snapshots(memberId).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    [memberId],
  );

  const activities = useMemo(
    () => (activitiesState.data ?? []).slice().sort((a, b) => a.sort - b.sort),
    [activitiesState.data],
  );

  const profile = profileState.data;
  const attendanceRow = attendanceState.data?.rows.find((r) => r.member_id === memberId);
  const rank = rankingState.data?.rows.find((r) => r.member_id === memberId)?.rank ?? null;
  const memberCount = rankingState.data?.rows.length ?? 0;
  const aliases = aliasesState.data ?? [];

  const error = firstError(
    profileState,
    activitiesState,
    attendanceState,
    aliasesState,
    rankingState,
    snapshotsState,
  );

  if (
    profileState.loading ||
    activitiesState.loading ||
    attendanceState.loading ||
    aliasesState.loading ||
    rankingState.loading ||
    snapshotsState.loading
  ) {
    return <LoadingState />;
  }
  if (error) return <ErrorState message={error} />;
  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card className="overflow-hidden">
          <EmptyState message={t("profile.notFound")} />
        </Card>
      </div>
    );
  }

  const { member, totals, perActivity, series } = profile;
  const attendancePct =
    attendanceRow && attendanceRow.total > 0 ? Math.round(attendanceRow.pct * 100) : null;
  const weeklyAvg =
    series.length > 0
      ? Math.round(series.reduce((sum, s) => sum + s.score, 0) / series.length)
      : null;
  const scoredCount = activities.filter((a) => (perActivity[a.key]?.points ?? 0) > 0).length;
  const maxActivityPoints = Math.max(1, ...activities.map((a) => perActivity[a.key]?.points ?? 0));
  const activitiesByPoints = [...activities].sort(
    (a, b) => (perActivity[b.key]?.points ?? 0) - (perActivity[a.key]?.points ?? 0),
  );
  const chartData = series.map((s) => ({
    label: weekLabel(s.week),
    ...Object.fromEntries(Object.entries(s.byActivity).map(([key, points]) => [barKey(key), points])),
  }));

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <BackLink />

      {/* Hero + KPI row */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-[1.7fr_1fr_1fr_1fr_1fr]">
        <Card className="col-span-2 flex items-start gap-3.5 p-4 md:p-[18px] xl:col-span-1">
          <Avatar name={member.governor} size={mobile ? 52 : 48} tone="dark" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[18px] font-bold tracking-[-0.01em]">{member.governor}</span>
              <AllianceRankBadge rank={member.alliance_rank} />
              {member.active === 0 && <Badge variant="warn">{t("profile.inactiveBadge")}</Badge>}
            </div>
            {aliases.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-muted">{t("profile.knownAliases")}</span>
                {aliases.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-[6px] bg-foreground px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground"
                  >
                    {a.alias}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
        <StatCard
          label={t("profile.scoreRank")}
          value={rank !== null ? `#${rank}` : "—"}
          sub={rank !== null ? t("profile.ofMembers", { count: memberCount }) : t("profile.notRanked")}
        />
        <StatCard
          label={t("profile.totalScore")}
          value={formatNumber(totals.score)}
          sub={t("profile.acrossActivities", { count: scoredCount })}
        />
        <StatCard
          label={t("profile.weeklyAvg")}
          value={weeklyAvg ?? "—"}
          sub={t("profile.lastWeeks", { count: series.length })}
        />
        <StatCard
          label={t("nav.attendance")}
          value={attendancePct !== null ? `${attendancePct}%` : "—"}
          sub={
            attendanceRow ? (
              <div>
                <Progress
                  value={attendancePct ?? 0}
                  className="mb-1.5 h-1.5 rounded-full"
                />
                <Trans
                  i18nKey="profile.eventDaysRatio"
                  values={{ attended: attendanceRow.attended, total: attendanceRow.total }}
                  components={{ 1: <span className="num" />, 2: <span className="num" /> }}
                />
              </div>
            ) : (
              t("profile.noData")
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:gap-4 lg:grid-cols-2">
        {/* Score composition */}
        <Card className={snapshotsState.data ? "p-4 md:p-5" : "p-4 md:p-5 lg:col-span-2"}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-[11px]">
              <IconTile icon={BarChart3} tone="orange" />
              <div>
                <div className="text-[14px] font-semibold">{t("profile.composition.title")}</div>
                <div className="text-[12px] text-muted">
                  {t("profile.composition.subtitle", { count: series.length })}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {activities.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-2 rounded-full" style={{ background: activityFillVar(a.color) }} />
                  {a.name}
                  {a.active === 0 && <span className="text-faint">· {t("profile.inactive")}</span>}
                </span>
              ))}
            </div>
          </div>
          {series.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted">{t("profile.composition.empty")}</div>
          ) : (
            <ResponsiveContainer width="100%" height={mobile ? 150 : 230} className="mt-3">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-border)"
                  tickLine={false}
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
                />
                <YAxis
                  stroke="var(--color-border)"
                  tickLine={false}
                  width={40}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
                />
                <Tooltip content={<CompTooltip />} cursor={{ fill: "var(--color-muted-surface)" }} />
                {activities.map((a, i) => (
                  <Bar
                    key={a.key}
                    dataKey={barKey(a.key)}
                    name={a.name}
                    stackId="s"
                    fill={activityFillVar(a.color)}
                    maxBarSize={34}
                    radius={i === activities.length - 1 ? [3, 3, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Power & position */}
        {snapshotsState.data && (
          <PowerHistoryCard series={snapshotsState.data} totalMembers={memberCount} />
        )}
      </div>

      {/* Score by activity */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-[11px]">
          <IconTile icon={ListChecks} tone="teal" />
          <div>
            <div className="text-[14px] font-semibold">{t("profile.byActivity.title")}</div>
            <div className="text-[12px] text-muted">{t("profile.byActivity.subtitle")}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {activitiesByPoints.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              stat={perActivity[activity.key] ?? { points: 0, appearances: 0 }}
              max={maxActivityPoints}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Where "back" goes. Eight places link into this profile; only the admin roster tags itself, because
 * it is the only one whose list does not live at /members — sending an admin mid-review back to the
 * public members page drops them out of the admin area entirely. Everything else falls through, and
 * so does a deep link or a page refresh, where there is no origin to honour.
 */
const ORIGINS: Record<string, { to: string; label: TKey }> = {
  roster: { to: "/admin/roster", label: "profile.backToRoster" },
};

const DEFAULT_ORIGIN: { to: string; label: TKey } = { to: "/members", label: "profile.backToMembers" };

function BackLink() {
  const { t } = useTranslation();
  const state = useLocation().state as { from?: string } | null;
  const origin = (state?.from && ORIGINS[state.from]) || DEFAULT_ORIGIN;
  return (
    <Link
      to={origin.to}
      className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5 rtl:rotate-180" />
      {t(origin.label)}
    </Link>
  );
}
