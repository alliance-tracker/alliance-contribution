import { useTranslation } from "react-i18next";
import type { KvkBoard } from "@shared/types";
import { DAYS, dayIso, SLOTS } from "@/lib/kvk";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const DAY_TOTAL = 2 * SLOTS; // both positions, one day

/** Mobile-only day picker above the one-day `ScheduleGrid`: a scrolling row of 5 chips, then the
 *  picked day's date and fill count (the desktop day-header carries this on md+; here the chips do). */
export function DayChips({ board, day, onDay }: { board: KvkBoard; day: number; onDay: (day: number) => void }) {
  const { t } = useTranslation();
  const start = board.event.start_date;
  const filled = board.appointments.filter((a) => a.day === day).length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {DAYS.map((d, i) => {
          const n = i + 1;
          const selected = n === day;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => onDay(n)}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-[9px] border px-[11px] py-[7px]",
                selected ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted",
              )}
            >
              <span className="font-mono text-[10px] font-semibold uppercase">{t("kvk.grid.day", { n })}</span>
              <span className="text-[12.5px] font-semibold">{t(`kvk.days.${d.theme}` as const)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-muted">
        {start && (
          <>
            <span dir="ltr">{formatDate(dayIso(start, day), DATE_OPTS)}</span> · {t("kvk.grid.utc")} ·{" "}
          </>
        )}
        {t("kvk.mobile.dayFilled", { n: filled, total: DAY_TOTAL })}
      </p>
    </div>
  );
}
