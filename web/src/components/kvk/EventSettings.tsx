import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KVK_VISIBILITY, type KvkEvent, type KvkVisibility } from "@shared/types";
import { writeErrorMessage } from "@/lib/errors";
import { canToggleShown, DAYS, dayIso, KVK_COLORS, POSITIONS, setDayKey, toggleShown } from "@/lib/kvk";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorNote } from "@/components/schedule/parts";
import { SlotCell } from "@/components/kvk/ScheduleGrid";

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
/** A made-up player ID for the visibility previews — never sent anywhere, so it's a literal, not
 *  operator data. */
const PREVIEW_ID = "45120938";

/** Admin-only: enable/disable the event, set its start date, choose what key holders see of other
 *  alliances' bookings, and clear the schedule. Every field saves immediately (PUT /kvk/event always
 *  needs all three), so this is optimistic-UI with a revert-on-failure rather than a form + Save. */
export function EventSettings({
  event,
  filled,
  hidden,
  onSave,
  onClear,
}: {
  event: KvkEvent;
  filled: number;
  hidden: number;
  onSave: (next: KvkEvent) => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(event);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resync when the parent reloads the board (after a successful save, or a poll picking up
  // someone else's change) — but not while a save is in flight, or the 30s board poll (KvkPrep's own
  // reload interval) can land between the optimistic setLocal below and onSave's own post-success
  // reload, and overwrite the optimistic value with the stale pre-save one.
  useEffect(() => {
    if (!busy) setLocal(event);
  }, [event, busy]);

  const change = async (next: KvkEvent) => {
    const prev = local;
    setLocal(next);
    setError(null);
    setBusy(true);
    try {
      await onSave(next);
    } catch (e) {
      setLocal(prev);
      setError(writeErrorMessage(e, t, "kvk.needKey", true));
    } finally {
      setBusy(false);
    }
  };

  const previewAlliance = { name: t("kvk.settings.previewAlliance"), color: KVK_COLORS[0]! };
  const previewRow = {
    day: 1,
    position: "chief_minister" as const,
    slot: 0,
    key_id: 0,
    player_id: PREVIEW_ID,
    player_name: t("kvk.settings.previewPlayer"),
    created_by: "",
    updated_at: 0,
  };
  const previewRedacted = { day: 1, position: "chief_minister" as const, slot: 0, filled: true as const };

  return (
    <Card className="flex max-w-[820px] flex-col">
      {error && (
        <div className="px-[18px] pt-[18px]">
          <ErrorNote message={error} />
        </div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 p-[18px]">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-foreground">{t("kvk.settings.enableTitle")}</p>
          <p className="text-[12.5px] text-muted">{t("kvk.settings.enableSub")}</p>
        </div>
        <Switch
          on={local.enabled}
          disabled={false}
          title={t(local.enabled ? "schedule.events.turnOff" : "schedule.events.turnOn")}
          onToggle={() => change({ ...local, enabled: !local.enabled })}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-muted-surface p-[18px]">
        <div>
          <p className="text-[13.5px] font-semibold text-foreground">{t("kvk.settings.startTitle")}</p>
          <p className="text-[12.5px] text-muted">{t("kvk.settings.startSub")}</p>
        </div>
        <Input
          type="date"
          className="w-auto"
          value={local.start_date ?? ""}
          onChange={(e) => change({ ...local, start_date: e.target.value === "" ? null : e.target.value })}
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          {DAYS.map((d, i) => {
            const day = i + 1;
            const dayCfg = local.days[i]!;
            return (
              <div
                key={day}
                className="rounded-[9px] border border-border bg-background px-[11px] py-2.5 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-3"
              >
                <p className="font-mono text-[10.5px] font-semibold text-muted">
                  {t("kvk.grid.day", { n: day })}
                  {local.start_date && ` · ${formatDate(dayIso(local.start_date, day), DATE_OPTS)}`}
                </p>
                <p className="truncate text-[13px] font-semibold text-foreground">
                  {t(`kvk.days.${d.theme}` as const)}
                </p>

                <div className="mt-2 max-md:mt-0 max-md:basis-full">
                  <div
                    role="radiogroup"
                    aria-label={t("kvk.settings.keyLabel")}
                    className="grid grid-cols-3 gap-1 md:grid-cols-1"
                  >
                    {[...POSITIONS, null].map((p) => (
                      <KeyOption
                        key={p ?? "none"}
                        label={p ? t(`kvk.positions.${p}.name` as const) : t("kvk.settings.keyNone")}
                        selected={dayCfg.key === p}
                        onSelect={() => change({ ...local, days: setDayKey(local.days, day, p) })}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-1 max-md:mt-0 max-md:basis-full">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {t("kvk.settings.shownLabel")}
                  </p>
                  {POSITIONS.map((p) => {
                    const positionLabel = t(`kvk.positions.${p}.name` as const);
                    const canToggle = canToggleShown(dayCfg, p);
                    const toggle = (
                      <Switch
                        on={dayCfg.shown.includes(p)}
                        disabled={!canToggle}
                        title={t("kvk.settings.showPosition", { position: positionLabel })}
                        onToggle={() => change({ ...local, days: toggleShown(local.days, day, p) })}
                      />
                    );
                    return (
                      <div key={p} className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-foreground">{positionLabel}</span>
                        {canToggle ? toggle : <span className="opacity-50">{toggle}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {hidden > 0 && <p className="text-[12px] text-muted">{t("kvk.settings.hiddenNote", { count: hidden })}</p>}
      </section>

      <section className="flex flex-col gap-3 border-t border-muted-surface p-[18px]">
        <div>
          <p className="text-[13.5px] font-semibold text-foreground">{t("kvk.settings.visibilityTitle")}</p>
          <p className="text-[12.5px] text-muted">{t("kvk.settings.visibilitySub")}</p>
        </div>
        <div role="radiogroup" aria-label={t("kvk.settings.visibilityTitle")} className="grid gap-2.5 md:grid-cols-2">
          {KVK_VISIBILITY.map((v) => (
            <VisibilityCard
              key={v}
              value={v}
              selected={local.others_visibility === v}
              onSelect={() => change({ ...local, others_visibility: v })}
              previewAlliance={previewAlliance}
              previewRow={previewRow}
              previewRedacted={previewRedacted}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-muted-surface p-[18px]">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-foreground">{t("kvk.settings.clearTitle")}</p>
          <p className="text-[12.5px] text-muted">{t("kvk.settings.clearSub")}</p>
        </div>
        <Button variant="danger" size="sm" disabled={filled + hidden === 0} onClick={onClear}>
          {t("kvk.settings.clearButton")}
        </Button>
      </section>
    </Card>
  );
}

/** One radio in a day's key-position picker, at button scale — same selected styling as
 *  `VisibilityCard` (`border-accent bg-accent-subtle`), no preview swatch. */
function KeyOption({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "truncate rounded-[7px] border px-2 py-1 text-[11.5px] font-medium transition-colors duration-150",
        selected ? "border-accent bg-accent-subtle text-foreground" : "border-border text-muted hover:border-border-strong",
      )}
    >
      {label}
    </button>
  );
}

function VisibilityCard({
  value,
  selected,
  onSelect,
  previewAlliance,
  previewRow,
  previewRedacted,
}: {
  value: KvkVisibility;
  selected: boolean;
  onSelect: () => void;
  previewAlliance: { name: string; color: string };
  previewRow: Parameters<typeof SlotCell>[0]["appt"];
  previewRedacted: Parameters<typeof SlotCell>[0]["appt"];
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 flex-col gap-2.5 rounded-[10px] border p-3 text-start transition-colors duration-150",
        selected ? "border-accent bg-accent-subtle" : "border-border hover:border-border-strong",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
            selected ? "border-accent" : "border-border-strong",
          )}
          aria-hidden
        >
          {selected && <span className="size-[7px] rounded-full bg-accent" />}
        </span>
        <span className="text-[13px] font-semibold text-foreground">
          {t(value === "all" ? "kvk.settings.visibilityAll" : "kvk.settings.visibilityFilled")}
        </span>
      </span>
      <div className="w-[160px] max-w-full overflow-hidden rounded-[8px] border border-border max-md:hidden">
        <SlotCell
          appt={value === "all" ? previewRow : previewRedacted}
          alliance={value === "all" ? previewAlliance : null}
          focus={false}
          own={false}
          faded={false}
          editable={false}
          current={false}
          className="h-11"
        />
      </div>
    </button>
  );
}
