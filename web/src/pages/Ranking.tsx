import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import {
  DEFAULT_RANK_BANDS,
  type ActivityType,
  type OverallRanking as OverallRankingData,
  type RankBands,
  type WeeklyRanking as WeeklyRankingData,
  type WeeklyRankingRow,
} from "@shared/types";
import { api } from "@/lib/api";
import { assignBands, BAND_EDGE_CLASS, BAND_EDGE_ROW_CLASS, BAND_EXPECTED_RANK, BAND_ROW_CLASS } from "@/lib/alliance-rank";
import { BandLegend } from "@/components/BandLegend";
import { cn } from "@/lib/utils";
import { useApi, firstError } from "@/lib/useApi";
import { RankingScopeToggle, type RankingScope } from "@/components/RankingScopeToggle";
import { RankByActivity } from "@/components/RankByActivity";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { AllianceRankBadge } from "@/components/AllianceRankBadge";
import { MEDALS, Movement, PodiumCard, ScoreCell, medalBarClass, scorePct } from "@/components/ranking-parts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconTile, Strip } from "@/components/ui/tone";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

// Mobile: top 3 only, laid out 2nd · 1st · 3rd. md+: all five as 4th · 2nd · 1st · 3rd · 5th.
const PODIUM_ORDER_CLASSES = [
  "order-2 md:order-3",
  "order-1 md:order-2",
  "order-3 md:order-4",
  "hidden md:block md:order-1",
  "hidden md:block md:order-5",
];

export function Ranking() {
  const { t } = useTranslation();
  const [scope, setScope] = useState<RankingScope>("overall");
  const [week, setWeek] = useState<string | null>(null);
  const [activity, setActivity] = useState("all"); // "all" | activity.key
  const [hideLeadership, setHideLeadership] = useState(false);

  const weeksState = useApi(() => api.weeks(), []);
  const activitiesState = useApi<ActivityType[]>(() => api.activityTypes.list({ active: true }), []);

  // Default to the latest week once available.
  useEffect(() => {
    if (week === null && weeksState.data && weeksState.data.length > 0) {
      setWeek(weeksState.data[0]);
    }
  }, [week, weeksState.data]);

  const activityParam = activity === "all" ? undefined : activity;

  const rankingState = useApi<WeeklyRankingData | OverallRankingData>(
    () =>
      scope === "weekly"
        ? api.rankings.weekly(week ?? undefined, activityParam)
        : api.rankings.overall(activityParam),
    [scope, week, activity],
  );

  // Deliberately outside firstError/busy: bands are cosmetic, so a slow or failed settings
  // fetch falls back to DEFAULT_RANK_BANDS rather than blocking the board.
  const bandsState = useApi<RankBands>(() => api.settings.rankBands(), []);
  const bandsCfg = bandsState.data ?? DEFAULT_RANK_BANDS;

  const activities = useMemo(
    () => (activitiesState.data ?? []).slice().sort((a, b) => a.sort - b.sort),
    [activitiesState.data],
  );

  const weekly = scope === "weekly";
  // Overall rows lack `movement`; safe to widen because every `row.movement` read is gated behind
  // `weekly` (the Move column and PodiumCard's `showMovement={weekly}`), so it never runs on the overall board.
  const rows = (rankingState.data?.rows ?? []) as WeeklyRankingRow[];
  const bands = useMemo(
    () => assignBands(rows.map((r) => ({ alliance_rank: r.alliance_rank, value: r.score })), bandsCfg),
    [rows, bandsCfg],
  );
  // Bands are assigned on the FULL list first — hiding R4/R5 must not shift who counts as top-N
  // (it can't anyway, leadership is uncounted, but pairing row+band before filtering keeps it that way).
  const visible = useMemo(
    () =>
      rows
        .map((row, i) => ({ row, band: bands[i] }))
        .filter((p) => !hideLeadership || p.band !== "leadership"),
    [rows, bands, hideLeadership],
  );
  const possible = rankingState.data?.possible ?? 0;
  const scoreLabel = weekly ? t("ranking.scoreWeekly") : t("ranking.scoreSeason");
  const activityLabel =
    activity === "all" ? t("ranking.allActivities") : (activities.find((a) => a.key === activity)?.name ?? activity);
  // Names the attendance column's scope — the original scoping bug existed because it was invisible.
  const attendanceScope = t("ranking.attendanceScope", {
    scope: weekly ? t("ranking.scopeThisWeek") : t("ranking.scopeSeason"),
    activity: activityLabel,
  });
  // The weekly payload flags a week with no events of the selected activity; that is the only reliable
  // signal (`possible` is 0 for a tier-less activity, and boards are roster-seeded so rows are never empty).
  const noEvents = weekly && (rankingState.data as WeeklyRankingData | null)?.hasEvents === false;

  // Top-5 podium only when at least 5 members have scored; otherwise table-only.
  const top5 = visible.slice(0, 5).map((p) => p.row);
  const showPodium = top5.length === 5 && top5.every((r) => r.score > 0);

  const error = firstError(weeksState, activitiesState, rankingState);
  const busy = rankingState.loading || activitiesState.loading;

  return (
    <div className="flex flex-col gap-3.5 md:gap-5">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        <RankingScopeToggle value={scope} onChange={setScope} />
        {/* md:contents dissolves this wrapper on desktop so the row wraps exactly as before. */}
        <div className="flex items-center gap-2 md:contents">
          {weekly ? (
            <Select value={week ?? undefined} onValueChange={setWeek} disabled={(weeksState.data ?? []).length === 0}>
              <SelectTrigger className="h-10 flex-1 md:h-9 md:w-56 md:flex-none">
                <SelectValue placeholder={t("common.selectWeek")} />
              </SelectTrigger>
              <SelectContent>
                {(weeksState.data ?? []).map((w) => (
                  <SelectItem key={w} value={w} className="num">
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="inline-flex h-10 flex-1 items-center truncate rounded-[8px] border border-border bg-muted-surface px-3 text-[13px] font-medium text-secondary md:h-auto md:flex-none md:py-1.5">
              {t("common.seasonAllWeeks")}
            </span>
          )}
          <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[8px] border border-border bg-surface px-3 text-[13px] text-secondary md:h-auto md:border-0 md:bg-transparent md:px-0">
            <Checkbox checked={hideLeadership} onCheckedChange={(v) => setHideLeadership(v === true)} />
            {t("common.hideLeadership")}
          </label>
        </div>
        {weekly && <span className="hidden text-[12.5px] text-muted md:inline">{t("ranking.movementHint")}</span>}
      </div>

      <div>
        <RankByActivity value={activity} onChange={setActivity} activities={activities} />
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : busy ? (
        <Card className="overflow-hidden">
          <LoadingState />
        </Card>
      ) : noEvents || rows.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState message={weekly ? t("ranking.emptyWeek") : t("ranking.emptyAll")} />
        </Card>
      ) : (
        <>
          {showPodium && (
            <div className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2 md:grid-cols-5 md:gap-4">
              {top5.map((row, i) => (
                <div key={row.member_id} className={PODIUM_ORDER_CLASSES[i]}>
                  <PodiumCard row={row} scoreLabel={scoreLabel} showMovement={weekly} />
                </div>
              ))}
            </div>
          )}

          <BandLegend bands={bandsCfg} />

          <Card className="overflow-hidden">
            <Strip tone="amber" className="flex items-center justify-between border-b border-border px-[18px] py-[15px]">
              <div className="flex min-w-0 items-center gap-[11px]">
                <IconTile icon={Trophy} tone="amber" />
                <div>
                  <div className="text-[14px] font-semibold">{t("ranking.fullStandings")}</div>
                  <div className="text-[12px] text-muted">
                    <Trans
                      i18nKey="ranking.standings"
                      count={visible.length}
                      values={{ scope: weekly ? t("ranking.scopeThisWeek") : t("ranking.scopeOverall") }}
                      components={{ 1: <span className="num" /> }}
                    />
                  </div>
                </div>
              </div>
              <Badge variant="neutral" className="hidden md:inline-flex">
                {t("ranking.clickRowHint")}
              </Badge>
            </Strip>
            <div className="md:hidden">
              {visible.map(({ row, band }) => {
                const medal = MEDALS[row.rank];
                const pct = scorePct(row.score, possible);
                return (
                  <Link
                    key={row.member_id}
                    to={`/members/${row.member_id}`}
                    className={cn(
                      "flex items-center gap-2.5 border-b border-border py-2.5 ps-3 pe-3.5 last:border-b-0 active:brightness-95",
                      BAND_ROW_CLASS[band],
                      BAND_EDGE_ROW_CLASS[band],
                    )}
                  >
                    <Badge
                      className="num h-6 min-w-[26px] justify-center rounded-[6px] border-0 px-1.5 text-[13px] font-bold"
                      style={{ background: medal ? medal.badgeBg : "transparent", color: medal ? medal.badgeFg : "var(--color-muted)" }}
                    >
                      <span className="sr-only">{t("common.rank")}</span>
                      {row.rank}
                    </Badge>
                    <Avatar name={row.governor} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-semibold text-foreground">{row.governor}</span>
                        <AllianceRankBadge rank={row.alliance_rank} expected={BAND_EXPECTED_RANK[band]} className="shrink-0" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={pct} className="h-[5px] flex-1" indicatorClassName={medalBarClass(row.rank)} />
                        <span className="sr-only">{t("nav.attendance")}</span>
                        <AttendanceBadge pct={row.attendance} />
                      </div>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-0.5">
                      <span className="num text-[16px] font-bold leading-none">
                        <span className="sr-only">{t("common.score")}</span>
                        {row.score}
                      </span>
                      {weekly && <span className="text-[12px]"><Movement value={row.movement} /></span>}
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="hidden md:block">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[70px]">{t("common.rank")}</TableHead>
                    <TableHead>{t("common.member")}</TableHead>
                    <TableHead className="w-[110px]">{t("common.allianceRank")}</TableHead>
                    <TableHead className="w-[240px]">{t("common.score")}</TableHead>
                    <TableHead className="w-28 text-end" title={attendanceScope}>
                      {t("nav.attendance")}
                    </TableHead>
                    {weekly && <TableHead className="w-24 text-end">{t("ranking.move")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(({ row, band }) => {
                    const medal = MEDALS[row.rank];
                    return (
                      <TableRow key={row.member_id} className={cn("cursor-pointer", BAND_ROW_CLASS[band])}>
                        <TableCell className={BAND_EDGE_CLASS[band]}>
                          <Link to={`/members/${row.member_id}`} className="block">
                            <Badge
                              className="num h-6 min-w-[26px] justify-center rounded-[6px] border-0 px-1.5 text-[13px] font-bold"
                              style={{
                                background: medal ? medal.badgeBg : "transparent",
                                color: medal ? medal.badgeFg : "var(--color-muted)",
                              }}
                            >
                              {row.rank}
                            </Badge>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link to={`/members/${row.member_id}`} className="flex items-center gap-2.5">
                            <Avatar name={row.governor} size={30} />
                            <span className="font-semibold text-foreground">{row.governor}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <AllianceRankBadge rank={row.alliance_rank} expected={BAND_EXPECTED_RANK[band]} />
                        </TableCell>
                        <TableCell>
                          <ScoreCell score={row.score} possible={possible} barColor={medal?.bar} />
                        </TableCell>
                        <TableCell className="text-end">
                          <AttendanceBadge pct={row.attendance} />
                        </TableCell>
                        {weekly && (
                          <TableCell className="text-end">
                            <Movement value={row.movement} />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
