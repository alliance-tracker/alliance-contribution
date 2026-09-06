import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Alias, OverallRanking, OverallRankingRow } from "@shared/types";
import { api } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { AllianceRankBadge } from "@/components/AllianceRankBadge";
import { MEDALS } from "@/components/ranking-parts";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

/** A headline stat tile — mono uppercase label over a large tabular value. */
function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-3 md:p-[18px]">
      <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-faint md:text-[10.5px]">
        {label}
      </div>
      <div className="num text-[22px] font-bold leading-none tracking-[-0.02em] md:text-[26px]">{value}</div>
      <div className="mt-1.5 text-[11px] text-faint md:text-[11.5px]">{sub}</div>
    </Card>
  );
}

/** One member card: rank + at-risk dot, avatar/name/alias count, score + attendance. */
function MemberCard({ row, aliasCount, onOpen }: { row: OverallRankingRow; aliasCount: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const medal = MEDALS[row.rank]; // top 3 only
  const atRisk = row.attendance < 0.5;
  return (
    <button
      onClick={onOpen}
      className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-3.5 text-start transition-transform hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:bg-background md:gap-3 md:p-4"
    >
      <div className="flex items-center justify-between">
        <span
          className="num inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold"
          style={{
            background: medal ? medal.badgeBg : "var(--color-muted-surface)",
            color: medal ? medal.badgeFg : "var(--color-muted)",
          }}
          title={t("members.scoreRankTitle")}
        >
          #{row.rank}
        </span>
        <div className="flex items-center gap-1.5">
          <AllianceRankBadge rank={row.alliance_rank} />
          {atRisk && <span className="size-2 rounded-full bg-risk-fg" title={t("members.belowHalfTitle")} />}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Avatar
          name={row.governor}
          size={40}
          style={medal ? { background: medal.bar, color: "#fff" } : undefined}
        />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-foreground">{row.governor}</div>
          <div className="text-[11.5px] text-faint">{t("members.aliasCount", { count: aliasCount })}</div>
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-border pt-3">
        <div>
          <div className="num text-[24px] font-bold leading-none tracking-[-0.02em] md:text-[26px]">{row.score}</div>
          <div className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-faint">
            {t("common.score")}
          </div>
        </div>
        <AttendanceBadge pct={row.attendance} />
      </div>
    </button>
  );
}

export function Members() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rankingState = useApi<OverallRanking>(() => api.rankings.overall(), []);
  const aliasesState = useApi<Alias[]>(() => api.aliases.list(), []);
  const [q, setQ] = useState("");

  const rows = useMemo(() => rankingState.data?.rows ?? [], [rankingState.data]);

  // member_id -> its alias strings (for search + count).
  const aliasesByMember = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const a of aliasesState.data ?? []) {
      const list = map.get(a.member_id) ?? [];
      list.push(a.alias);
      map.set(a.member_id, list);
    }
    return map;
  }, [aliasesState.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      if (r.governor.toLowerCase().includes(needle)) return true;
      return (aliasesByMember.get(r.member_id) ?? []).some((a) => a.toLowerCase().includes(needle));
    });
  }, [rows, aliasesByMember, q]);

  const stats = useMemo(() => {
    if (rows.length === 0) return { roster: 0, avgAttendance: 0, atRisk: 0 };
    const avg = rows.reduce((sum, r) => sum + r.attendance, 0) / rows.length;
    return {
      roster: rows.length,
      avgAttendance: Math.round(avg * 100),
      atRisk: rows.filter((r) => r.attendance < 0.5).length,
    };
  }, [rows]);

  const error = firstError(rankingState, aliasesState);
  if (error) return <ErrorState message={error} />;

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
        <StatTile label={t("members.roster")} value={String(stats.roster)} sub={t("members.trackedMembers")} />
        <StatTile
          label={t("members.avgAttendance")}
          value={`${stats.avgAttendance}%`}
          sub={t("members.acrossAllEventDays")}
        />
        <StatTile label={t("members.atRisk")} value={String(stats.atRisk)} sub={t("members.belowHalf")} />
      </div>

      <div className="flex flex-col gap-1.5 md:flex-row md:flex-wrap md:items-center md:gap-3">
        <Input
          placeholder={t("members.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 md:h-9 md:max-w-sm"
        />
        <span className="text-[12px] text-faint">
          {t("members.shown", { shown: filtered.length, total: rows.length })}
        </span>
      </div>

      {rankingState.loading || aliasesState.loading ? (
        <Card className="overflow-hidden">
          <LoadingState />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState message={t("members.emptyMatch")} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((row) => (
            <MemberCard
              key={row.member_id}
              row={row}
              aliasCount={aliasesByMember.get(row.member_id)?.length ?? 0}
              onOpen={() => navigate(`/members/${row.member_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
