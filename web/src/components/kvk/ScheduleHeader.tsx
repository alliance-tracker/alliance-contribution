import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { KvkBoard } from "@shared/types";
import { currentDaySlot, dayIso, DELETED_COLOR, FOCUS_SLOTS, fillCounts, isRedacted, TOTAL_SLOTS } from "@/lib/kvk";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

/** Date range + live/starts-in/ended status, the filled-slots line, and one legend chip per alliance.
 *  With `ownKeyId` (key holder) the own chip comes first as "(you)", then a "Filled by others" chip for
 *  the redacted rows. Under "filled" visibility the server sends only the own alliance, so the same
 *  path covers both visibility modes. */
export function ScheduleHeader({
  board,
  now,
  ownKeyId,
}: {
  board: KvkBoard;
  now: number;
  ownKeyId: number | null;
}) {
  const { t } = useTranslation();
  const { event, alliances, appointments } = board;
  const daySlot = currentDaySlot(event.start_date, now);
  const { filled, focus } = fillCounts(appointments);
  const deletedCount = appointments.filter((a) => !isRedacted(a) && a.key_id === null).length;
  const redactedCount = ownKeyId !== null ? appointments.filter(isRedacted).length : 0;
  const ordered = ownKeyId !== null ? [...alliances].sort((a, b) => +(b.id === ownKeyId) - +(a.id === ownKeyId)) : alliances;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2.5">
          {event.start_date && (
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              {formatDate(dayIso(event.start_date, 1), DATE_OPTS)} – {formatDate(dayIso(event.start_date, 5), DATE_OPTS)}
            </h2>
          )}
          <StatusPill daySlot={daySlot} />
        </div>
        <p className="text-[12.5px] text-muted">
          {t("kvk.header.filled", { filled, total: TOTAL_SLOTS, focus, focusTotal: FOCUS_SLOTS })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ordered.map((alliance) => (
          <LegendChip key={alliance.id} color={alliance.color} count={alliance.slot_count}>
            {alliance.id === ownKeyId ? t("kvk.legend.you", { alliance: alliance.alliance_name }) : alliance.alliance_name}
          </LegendChip>
        ))}
        {redactedCount > 0 && (
          <LegendChip color="var(--color-good-fg)" count={redactedCount}>
            {t("kvk.legend.filledByOthers")}
          </LegendChip>
        )}
        {deletedCount > 0 && (
          <LegendChip color={DELETED_COLOR} count={deletedCount}>
            {t("kvk.deletedKey")}
          </LegendChip>
        )}
      </div>
    </div>
  );
}

function StatusPill({ daySlot }: { daySlot: ReturnType<typeof currentDaySlot> }) {
  const { t } = useTranslation();
  if (daySlot === null) return <Pill className="bg-muted-surface text-muted">{t("kvk.status.notSet")}</Pill>;
  if (daySlot.phase === "before") {
    return (
      <Pill className="bg-muted-surface text-muted">{t("kvk.status.startsIn", { days: daySlot.days })}</Pill>
    );
  }
  if (daySlot.phase === "ended") return <Pill className="bg-muted-surface text-muted">{t("kvk.status.ended")}</Pill>;
  return <Pill className="bg-good-bg text-good-fg">{t("kvk.status.live", { n: daySlot.day })}</Pill>;
}

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("num shrink-0 rounded-[6px] px-2 py-[3px] font-mono text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

function LegendChip({ color, count, children }: { color: string; count: number; children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-2 rounded-[8px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-secondary md:h-[30px]">
      <span className="size-[7px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{children}</span>
      <span className="num font-mono text-[11px] font-semibold text-faint">{count}</span>
    </span>
  );
}
