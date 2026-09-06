import { useTranslation } from "react-i18next";
import { ChevronDown, Merge, Pencil, Tag, UserCheck, UserMinus } from "lucide-react";
import type { Member } from "@shared/types";
import type { RosterMember, RosterRow, RosterStatus } from "@/lib/roster-view";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bar, MoveCell, RankChangeChip, RankChip, riskEdgeClass, rowClass } from "@/components/roster-cells";

/** U+2212 — a hyphen is narrower than a digit and misaligns the column. */
const MINUS = "−";

/** `+1.2M` / `−0.8M` for the collapsed row; the word for an observed zero, a dash for no prior observation. */
export function compactDelta(delta: number | null, noChange: string): { text: string; tone: string } {
  if (delta === null) return { text: "—", tone: "text-faint" };
  if (delta === 0) return { text: noChange, tone: "text-faint" };
  return {
    text: `${delta > 0 ? "+" : MINUS}${formatCompact(Math.abs(delta))}`,
    tone: delta > 0 ? "text-up" : "text-down",
  };
}

/** StatusCell semantics as a 6px dot + 11px label — the at-risk chip is too tall for the two-line row. */
function StatusLine({ status }: { status: RosterStatus }) {
  const { t } = useTranslation();
  if (status === "unknown") return <div className="mt-0.5 text-[11px] text-faint">—</div>;
  const dot = status === "at-risk" ? "bg-warn" : status === "inactive" ? "bg-faint" : "bg-up";
  const label =
    status === "at-risk"
      ? "font-bold text-warn"
      : status === "inactive"
        ? "font-semibold text-faint"
        : "font-medium text-muted";
  const text =
    status === "at-risk" ? t("roster.status.atRisk") : status === "inactive" ? t("roster.status.inactive") : t("roster.status.active");
  return (
    <div className={cn("mt-0.5 flex items-center gap-1.5 text-[11px]", label)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {text}
    </div>
  );
}

type Props = {
  row: RosterRow<RosterMember>;
  /** The full member for the action handlers; undefined in the historical view (no actions). */
  live: Member | undefined;
  top: boolean;
  maxPower: number;
  maxAbsDelta: number;
  /** Already-formatted date of the member's previous observation, or null. */
  since: string | null;
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onEdit: (m: Member) => void;
  onRename: (m: Member) => void;
  onMerge: (m: Member) => void;
  onDeactivate: (m: Member) => void;
  onActivate: (m: Member) => void;
};

/** Pattern B: priority row, tap to expand into the bars, move and actions the desktop table shows inline. */
export function RosterMobileRow({
  row, live, top, maxPower, maxAbsDelta, since, expanded, onToggle, isAdmin,
  onEdit, onRename, onMerge, onDeactivate, onActivate,
}: Props) {
  const { t } = useTranslation();
  const m = row.member;
  const delta = compactDelta(row.deltaPower, t("roster.noChange"));
  const powerPct = m.power !== null && maxPower > 0 ? Math.min(100, (m.power / maxPower) * 100) : 0;
  const d = row.deltaPower;
  // Same 4% floor as PowerChangeCell so a small real change is still a visible mark.
  const deltaPct = d !== null && d !== 0 && maxAbsDelta > 0 ? Math.max(4, Math.min(100, (Math.abs(d) / maxAbsDelta) * 100)) : 0;
  const deltaFill = d === null || d === 0 ? "bg-faint" : d > 0 ? "bg-up" : "bg-down";

  return (
    <div className={cn("border-b border-border last:border-b-0", rowClass(row), riskEdgeClass(row))}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 py-2.5 ps-3 pe-3.5 text-start active:bg-background"
      >
        <span className={cn("num min-w-7 text-[13px] font-bold", top ? "text-foreground" : "text-faint")}>
          {m.power_position === null ? "—" : `#${m.power_position}`}
        </span>
        <Avatar name={m.governor} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-foreground">{m.governor}</span>
            <span className="relative inline-flex shrink-0">
              <RankChip rank={m.alliance_rank} />
              <RankChangeChip change={row.rankChange} />
            </span>
          </div>
          <StatusLine status={row.status} />
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          {/* The desktop table names these two numbers in its column headers; the row has no headers. */}
          <span className="num text-[14px] font-bold leading-none text-foreground">
            <span className="sr-only">{t("common.power")} </span>
            {m.power === null ? "—" : formatNumber(m.power)}
          </span>
          <span className={cn("num text-[11.5px] font-semibold leading-none", delta.tone)}>
            <span className="sr-only">{t("roster.changeInPower")} </span>
            {delta.text}
          </span>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform duration-150", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border bg-background pb-3.5 pe-3.5 ps-[50px] pt-2.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-faint">
                {t("roster.shareOfTop")}
              </div>
              <Bar pct={powerPct} width="w-full" className={top ? "bg-foreground" : "bg-faint"} />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-faint">
                {t("roster.changeVsLargest")}
              </div>
              <Bar pct={deltaPct} width="w-full" className={deltaFill} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              {t("roster.move")} <MoveCell move={row.move} />
            </span>
            {since && <span>{t("roster.sinceCapture", { date: since })}</span>}
          </div>
          {live && (
            <div className="flex gap-2">
              <Button variant="secondary" className="h-9 flex-1" onClick={() => onEdit(live)}>
                <Pencil />
                {t("common.actions.edit")}
              </Button>
              <Button variant="secondary" className="h-9 flex-1" onClick={() => onRename(live)}>
                <Tag />
                {t("roster.rename")}
              </Button>
              {isAdmin && (
                <Button
                  variant="secondary"
                  className="h-9 w-11 p-0"
                  aria-label={t("roster.aria.merge", { governor: live.governor })}
                  onClick={() => onMerge(live)}
                >
                  <Merge />
                </Button>
              )}
              {live.active === 1 ? (
                <Button
                  variant="secondary"
                  className="h-9 w-11 border-risk-border p-0 text-down hover:bg-risk-bg"
                  aria-label={t("roster.aria.deactivate", { governor: live.governor })}
                  onClick={() => onDeactivate(live)}
                >
                  <UserMinus />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="h-9 w-11 p-0"
                  aria-label={t("roster.aria.activate", { governor: live.governor })}
                  onClick={() => onActivate(live)}
                >
                  <UserCheck />
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
