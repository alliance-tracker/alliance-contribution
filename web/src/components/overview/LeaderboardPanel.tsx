import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import type { WeeklyRankingRow } from "@shared/types";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/States";
import { MEDALS, Movement, ScoreCell, medalBarClass } from "@/components/ranking-parts";
import { AllianceRankBadge } from "@/components/AllianceRankBadge";

/**
 * Top of this week's leaderboard. Rows arrive pre-sliced and already rank-sorted by the API; this
 * component never re-sorts. `possible` scales every bar to the same denominator.
 *
 * `hasEvents` is the only signal for "no board this week" — weekly boards are roster-seeded, so a
 * populated `rows` at score 0 is exactly what a week with no events looks like (see WeeklyRanking in
 * shared/types.ts). Branching the empty state on `rows.length` would render a medalled podium for a
 * week in which nothing happened.
 *
 * Medalled rows carry no row tint: the gold tint is invisible against the light-mode card, and
 * applying it to silver and bronze rows fought their own badge colour. The rank badge and the bar
 * carry the medal colour on their own.
 */
export function LeaderboardPanel({
  rows,
  possible,
  rankedCount,
  hasEvents,
}: {
  rows: WeeklyRankingRow[];
  possible: number;
  rankedCount: number;
  hasEvents: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">{t("overview.leaderboard.title")}</h2>
          {/* Same roster-seeded trap as the empty state below: rows.length is the full roster even
              in a week with no events, so an ungated subtitle reads "86 governors ranked" directly
              above "No ranked week yet". */}
          {hasEvents && (
            <p className="mt-0.5 text-[12px] text-muted">
              <Trans
                i18nKey="overview.leaderboard.ranked"
                count={rankedCount}
                components={{ 1: <span className="num" /> }}
              />
            </p>
          )}
        </div>
        <Button asChild size="sm">
          <Link to="/rankings">{t("overview.leaderboard.viewFull")}</Link>
        </Button>
      </div>

      {!hasEvents ? (
        <EmptyState message={t("overview.leaderboard.empty")} />
      ) : (
        <ul className="mt-4 flex flex-col">
          {rows.map((row) => {
            const medal = MEDALS[row.rank];
            const pct = possible > 0 ? Math.min(100, Math.round((row.score / possible) * 100)) : 0;
            return (
              <li
                key={row.member_id}
                className="flex items-center gap-2.5 border-t border-border py-2.5 first:border-t-0 md:gap-3 md:py-3"
              >
                <span
                  className="num flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{
                    background: medal ? medal.badgeBg : "var(--color-muted-surface)",
                    color: medal ? medal.badgeFg : "var(--color-muted)",
                  }}
                >
                  <span className="sr-only">{t("common.rank")}</span>
                  {row.rank}
                </span>
                <Avatar name={row.governor} size={28} />
                <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
                  <div className="flex min-w-0 items-center gap-2 md:flex-1 md:gap-3">
                    <Link
                      to={`/members/${row.member_id}`}
                      title={row.governor}
                      className="min-w-0 truncate text-[13.5px] font-semibold hover:underline md:text-[14px]"
                    >
                      {row.governor}
                    </Link>
                    <AllianceRankBadge rank={row.alliance_rank} className="shrink-0" />
                  </div>
                  <Progress
                    value={pct}
                    className="mt-1.5 h-[5px] md:hidden"
                    indicatorClassName={medalBarClass(row.rank)}
                  />
                  <div className="hidden min-w-0 flex-1 md:block">
                    {/* ScoreCell renders a bare integer next to a bar — name what the number is. */}
                    <span className="sr-only">{t("common.score")}</span>
                    <ScoreCell score={row.score} possible={possible} barColor={medal?.bar} />
                  </div>
                </div>
                <span className="num text-[15px] font-bold md:hidden">
                  <span className="sr-only">{t("common.score")}</span>
                  {row.score}
                </span>
                <span className="w-10 shrink-0 text-end">
                  <Movement value={row.movement} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
