import { useTranslation, Trans } from "react-i18next";
import { api } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { useApiKey } from "@/lib/apiKey";
import { formatNumber } from "@/lib/format";
import { LoadingState, ErrorState } from "@/components/States";
import { StatCard } from "@/components/overview/StatCard";
import { LeaderboardPanel } from "@/components/overview/LeaderboardPanel";
import { UnmappedPanel } from "@/components/overview/UnmappedPanel";
import { AtRiskPanel } from "@/components/overview/AtRiskPanel";
import { RecentIngestsPanel } from "@/components/overview/RecentIngestsPanel";
import { activeRows, attendanceSummary, atRiskMembers, recentEvents } from "@/lib/overview-derive";

const LEADERS = 5;
const UNMAPPED_SHOWN = 5;
const AT_RISK_SHOWN = 4;
const INGESTS_SHOWN = 5;

export function Overview() {
  const { t } = useTranslation();
  const { role } = useApiKey();
  // Viewers get 403 on /admin/*, so the links that lead there are hidden for them.
  const canManage = role === "admin" || role === "manager";

  const overview = useApi(() => api.overview(), []);
  const attendance = useApi(() => api.attendance(), []);
  const ranking = useApi(() => api.rankings.weekly(), []);
  const unmapped = useApi(() => api.unmapped(), []);
  const events = useApi(() => api.events.list(), []);
  const activities = useApi(() => api.activityTypes.list(), []);

  const states = [overview, attendance, ranking, unmapped, events, activities];
  // Error before loading, deliberately: firstError surfaces a failed call even while a slower
  // sibling is still in flight, so a dead endpoint reports instead of hanging on the spinner.
  const error = firstError(...states);

  if (error) return <ErrorState message={error} />;
  if (states.some((s) => s.loading)) return <LoadingState />;
  if (
    !overview.data ||
    !attendance.data ||
    !ranking.data ||
    !unmapped.data ||
    !events.data ||
    !activities.data
  ) {
    // Reachable: api.ts resolves an empty 200/204 body to undefined, so a proxy hiccup lands here.
    // Anything visible beats a blank page the user cannot describe.
    return <ErrorState message={t("overview.noData")} />;
  }

  // Soft-deleted members stay in /api/attendance at whatever attendance they had when they left, and
  // they are structurally the worst attenders — filter once, before deriving anything from them.
  const active = activeRows(attendance.data.rows);
  // Before any event is ingested every member reads 0%, which would announce "86 at risk" on a fresh
  // install. The roster is populated, so attendanceSummary's empty guard does not catch it.
  const hasEvents = attendance.data.total_event_days > 0;

  const summary = attendanceSummary(active);
  const atRisk = hasEvents ? atRiskMembers(active, AT_RISK_SHOWN) : [];
  const leaders = ranking.data.rows.slice(0, LEADERS);
  const unmappedNames = unmapped.data.slice(0, UNMAPPED_SHOWN).map((row) => row.raw_name);
  const ingests = recentEvents(events.data, INGESTS_SHOWN);

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      {overview.data.latestWeek && (
        <div className="flex justify-end">
          <span className="num text-[12px] text-muted">
            {t("overview.latestWeek", { week: overview.data.latestWeek })}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
        <StatCard
          label={t("overview.activeMembers")}
          value={formatNumber(overview.data.activeMembers)}
          sub={
            <Trans
              i18nKey="overview.ofTracked"
              values={{ total: formatNumber(overview.data.members) }}
              components={{ 1: <span className="num" /> }}
            />
          }
        />
        {/* "(active)" is load-bearing: Attendance.tsx shows the same figure roster-wide, so the two
            pages would otherwise display different numbers under identical labels. */}
        <StatCard
          label={
            <>
              <span className="md:hidden">{t("overview.avgAttendanceActiveShort")}</span>
              <span className="hidden md:inline">{t("overview.avgAttendanceActive")}</span>
            </>
          }
          value={hasEvents ? `${Math.round(summary.avgPct * 100)}%` : "—"}
          sub={
            hasEvents ? (
              <Trans
                i18nKey="overview.attendanceSub"
                values={{ perfect: summary.perfect, atRisk: summary.atRisk }}
                components={{ 1: <span className="num" />, 2: <span className="num" /> }}
              />
            ) : (
              t("overview.noEventsYet")
            )
          }
        />
        <StatCard
          label={t("overview.eventsLogged")}
          value={formatNumber(overview.data.events)}
          sub={
            <Trans
              i18nKey="overview.acrossEventDays"
              count={overview.data.eventDays}
              components={{ 1: <span className="num" /> }}
            />
          }
        />
        <StatCard
          label={t("overview.unmappedQueue")}
          value={formatNumber(overview.data.unmappedNames)}
          sub={t("overview.namesNeedDecision")}
          tone={overview.data.unmappedNames > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:gap-4 lg:grid-cols-[1.6fr_1fr]">
        <LeaderboardPanel
          rows={leaders}
          possible={ranking.data.possible}
          rankedCount={ranking.data.rows.length}
          hasEvents={ranking.data.hasEvents}
        />
        <div className="flex flex-col gap-3.5 md:gap-4">
          {/* Both props come off the same /api/unmapped response so the slice can never outrun the
              total — mixing in overview.data.unmappedNames would let a concurrent ingest render
              "0 names need mapping" over a populated list. */}
          <UnmappedPanel names={unmappedNames} total={unmapped.data.length} canManage={canManage} />
          <AtRiskPanel rows={atRisk} total={hasEvents ? summary.atRisk : 0} />
        </div>
      </div>

      <RecentIngestsPanel events={ingests} activities={activities.data} canManage={canManage} />
    </div>
  );
}
