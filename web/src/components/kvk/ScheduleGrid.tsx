import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { KvkAppointmentRow, KvkBoard, KvkBoardAppointment } from "@shared/types";
import {
  currentDaySlot,
  DAYS,
  dayIso,
  DELETED_COLOR,
  gridStyle,
  indexAppointments,
  isRedacted,
  shownDays,
  SLOTS,
  slotKey,
  slotLabel,
  type KvkSlotRef,
} from "@/lib/kvk";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const SLOT_INDEXES = Array.from({ length: SLOTS }, (_, i) => i);

/** Day separator after the day's last shown column, a hairline between shown columns. */
const sepClass = (pi: number, count: number) => (pi === count - 1 ? "border-e-2 border-e-border" : "border-e border-e-muted-surface");

/** The 5-day board, each day showing the columns and slot count from `event.days`. Role-agnostic:
 *  callers decide editability via `canEdit` and pass `ownKeyId` (p3 key holder) to tint own slots and
 *  fade everyone else's.
 *  With `day` (1..5, the mobile one-day view), only that day's shown columns render, the day-header row
 *  is skipped (the mobile day chips carry that context), and rows/padding shrink to fit a phone. */
export function ScheduleGrid({
  board,
  now,
  ownKeyId,
  canEdit,
  onCellClick,
  day,
}: {
  board: KvkBoard;
  now: number;
  ownKeyId: number | null;
  canEdit: (appt: KvkBoardAppointment | null) => boolean;
  onCellClick: (ref: KvkSlotRef, appt: KvkAppointmentRow | null) => void;
  day?: number;
}) {
  const { t } = useTranslation();
  const start = board.event.start_date;
  const byKey = useMemo(() => indexAppointments(board.appointments), [board.appointments]);
  const alliances = useMemo(() => new Map(board.alliances.map((a) => [a.id, a])), [board.alliances]);
  const daySlot = currentDaySlot(start, now);
  const live = daySlot?.phase === "live" ? daySlot : null;
  const days = board.event.days;
  const shown = shownDays(days);
  const dayNums = day ? [day] : shown;

  if (!day && shown.length === 0) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-[12px] border border-border bg-surface p-6 text-center text-[13px] text-muted">
        {t("kvk.grid.allHidden")}
      </div>
    );
  }

  const style = gridStyle(dayNums.reduce((n, d) => n + days[d - 1]!.shown.length, 0), !!day);

  return (
    <div className="max-h-[calc(100vh-290px)] min-h-[420px] overflow-auto rounded-[12px] border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="w-full" style={{ minWidth: style.minWidth }}>
        <div className="sticky top-0 z-[3] grid bg-background" style={{ gridTemplateColumns: style.gridTemplateColumns }}>
          <div
            className={cn(
              "sticky start-0 z-[2] flex items-end border-e border-b border-border bg-background px-3 py-2.5 font-mono text-[10.5px] font-semibold text-muted",
              !day && "row-span-2",
            )}
          >
            {t("kvk.grid.utc")}
          </div>
          {!day &&
            shown.map((dayNum) => {
              const d = DAYS[dayNum - 1]!;
              const isLive = live?.day === dayNum;
              return (
                <div
                  key={dayNum}
                  style={{ gridColumn: `span ${days[dayNum - 1]!.shown.length}` }}
                  className={cn(
                    "flex min-w-0 flex-col gap-0.5 border-e-2 border-b border-border px-3 pt-2.5 pb-2",
                    isLive && "bg-live-bg",
                  )}
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10.5px] font-semibold tracking-[0.4px] text-muted uppercase">
                      {t("kvk.grid.day", { n: dayNum })}
                    </span>
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {t(`kvk.days.${d.theme}` as const)}
                    </span>
                  </div>
                  {start && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11.5px] font-medium text-faint">
                        {formatDate(dayIso(start, dayNum), DATE_OPTS)}
                      </span>
                      {isLive && (
                        <span className="rounded-[4px] bg-good-bg px-[5px] py-px font-mono text-[9.5px] font-semibold text-good-fg uppercase">
                          {t("kvk.grid.today")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          {dayNums.map((dayNum) =>
            days[dayNum - 1]!.shown.map((p, pi) => (
              <div
                key={`${dayNum}-${p}`}
                className={cn(
                  "truncate border-b border-b-border px-[7px] py-2 text-[12px] font-semibold",
                  sepClass(pi, days[dayNum - 1]!.shown.length),
                  days[dayNum - 1]!.key === p ? "bg-ember-bg text-ember-fg" : "text-foreground",
                )}
              >
                {t(`kvk.positions.${p}.name` as const)}
              </div>
            )),
          )}
        </div>

        <div
          className={cn("grid", day ? "auto-rows-[50px]" : "auto-rows-[44px]")}
          style={{ gridTemplateColumns: style.gridTemplateColumns }}
        >
          {SLOT_INDEXES.map((slot) => {
            const { start: from, end: to } = slotLabel(slot);
            const isNow = live?.slot === slot;
            return (
              <Fragment key={slot}>
                <div
                  className={cn(
                    "sticky start-0 z-[1] flex flex-col justify-center border-e border-b border-e-border border-b-muted-surface",
                    day ? "px-1.5" : "px-2.5",
                    isNow ? "bg-ember-bg text-ember" : "bg-surface text-foreground",
                  )}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span dir="ltr" className="font-mono text-[12.5px] font-semibold">
                      {from}
                    </span>
                    {isNow && (
                      <span className="font-mono text-[9px] font-bold tracking-[0.4px] uppercase">{t("kvk.grid.now")}</span>
                    )}
                  </div>
                  <span dir="ltr" className="self-start font-mono text-[10.5px] font-medium text-faint">
                    – {to}
                  </span>
                </div>
                {dayNums.map((dayNum) =>
                  days[dayNum - 1]!.shown.map((position, pi) => {
                    const ref: KvkSlotRef = { day: dayNum, position, slot };
                    const appt = byKey.get(slotKey(ref)) ?? null;
                    const row = appt && !isRedacted(appt) ? appt : null;
                    const found = row?.key_id != null ? alliances.get(row.key_id) : undefined;
                    const alliance = row
                      ? found
                        ? { name: found.alliance_name, color: found.color }
                        : { name: t("kvk.deletedKey"), color: DELETED_COLOR }
                      : null;
                    // A redacted cell carries nothing to edit, whatever the caller allows.
                    const editable = canEdit(appt) && !(appt && isRedacted(appt));
                    const title = row
                      ? t("kvk.grid.cellTitle", { alliance: alliance!.name, id: row.player_id, name: row.player_name })
                      : appt
                        ? t("kvk.grid.filled")
                        : editable
                          ? t("kvk.grid.appointTitle", { position: t(`kvk.positions.${position}.name` as const) })
                          : undefined;
                    // Booked reuses the same text as the tooltip; free gets day/time context a hover
                    // title can't carry to a screen reader.
                    const ariaLabel = !editable
                      ? undefined
                      : row
                        ? title
                        : t("kvk.grid.appointLabel", {
                            position: t(`kvk.positions.${position}.name` as const),
                            day: dayNum,
                            time: slotLabel(slot).start,
                          });
                    return (
                      <SlotCell
                        key={`${dayNum}-${position}`}
                        appt={appt}
                        alliance={alliance}
                        focus={days[dayNum - 1]!.key === position}
                        own={ownKeyId !== null && row?.key_id === ownKeyId}
                        faded={ownKeyId !== null && appt !== null && row?.key_id !== ownKeyId}
                        editable={editable}
                        current={live?.day === dayNum && isNow}
                        title={title}
                        ariaLabel={ariaLabel}
                        onClick={() => onCellClick(ref, row)}
                        className={cn("border-b border-b-muted-surface", sepClass(pi, days[dayNum - 1]!.shown.length))}
                      />
                    );
                  }),
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** One slot's content in every state (free / booked / redacted). Also used standalone by the
 *  settings visibility previews, where `onClick`/`className` are omitted. */
export function SlotCell({
  appt,
  alliance,
  focus,
  own,
  faded,
  editable,
  current,
  title,
  ariaLabel,
  onClick,
  className,
}: {
  appt: KvkBoardAppointment | null;
  alliance: { name: string; color: string } | null;
  focus: boolean;
  own: boolean;
  faded: boolean;
  editable: boolean;
  current: boolean;
  title?: string;
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const redacted = appt !== null && isRedacted(appt);
  const row = appt !== null && !redacted ? appt : null;

  const cls = cn(
    "flex min-w-0 flex-col justify-center gap-0.5 px-[7px] py-1 text-start",
    appt === null && (focus ? "bg-ember-wash text-ember/60" : "bg-surface text-faint"),
    redacted && "bg-badge-green-bg text-badge-green-fg",
    faded && "opacity-85",
    current && "shadow-[inset_0_0_0_2px_var(--color-ember-ring)]",
    editable
      ? "cursor-pointer outline-none hover:brightness-[.98] focus-visible:shadow-[inset_0_0_0_2px_var(--color-ember-ring)]"
      : "cursor-default",
    className,
  );
  const style = row && alliance ? { background: alliance.color + (own ? "2e" : "1a") } : undefined;

  const content = row ? (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="size-[7px] shrink-0 rounded-full" style={{ background: alliance?.color }} aria-hidden />
        <span className="truncate font-mono text-[10px] font-semibold tracking-[0.3px] text-secondary uppercase">
          {alliance?.name}
        </span>
      </span>
      <span className="truncate text-[12px] font-semibold text-foreground">
        <span dir="ltr" className="max-md:hidden font-mono text-[11px] font-medium text-muted">
          {row.player_id}
        </span>{" "}
        {row.player_name}
      </span>
    </>
  ) : redacted ? (
    <span className="flex items-center gap-1 text-[11.5px] font-semibold">
      <Check size={12} aria-hidden />
      {t("kvk.grid.filled")}
    </span>
  ) : (
    <span className="text-[11.5px] font-medium">{editable ? t("kvk.grid.free") : "—"}</span>
  );

  return editable ? (
    <button type="button" className={cls} style={style} title={title} aria-label={ariaLabel} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={cls} style={style} title={title}>
      {content}
    </div>
  );
}
