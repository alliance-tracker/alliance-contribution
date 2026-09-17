import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Bell, CalendarClock, Clock } from "lucide-react";
import type {
  ActivityType,
  DiscordRole,
  DiscordWebhook,
  EventNotification,
  MessageTemplate,
  ScheduleUnit,
  ScheduledEventWithNotifications,
} from "@shared/types";
import { api } from "@/lib/api";
import { writeErrorMessage } from "@/lib/errors";
import { formatDuration, fromLocalInputs, toLocalInputs, whenLabel } from "@/lib/schedule-format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorNote, DialogHead, Field, SegToggle, SHEET } from "./parts";

const ALL_DAY = 1440;
const NONE = "none";

/** Tomorrow on the hour — the design's default first occurrence for a brand-new event. */
function defaultStart(): { date: string; time: string } {
  const d = new Date(Date.now() + 86_400_000);
  d.setMinutes(0, 0, 0);
  return toLocalInputs(d.toISOString());
}


/** Toggle chips for the roles a reminder pings. Shared by the reminder dialog and the create-event presets. */
function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: DiscordRole[];
  value: number[];
  onChange: (next: number[]) => void;
}) {
  const { t } = useTranslation();
  if (roles.length === 0) return <p className="text-[12.5px] text-muted">{t("schedule.reminderDialog.noRoles")}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => {
        const on = value.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== role.id) : [...value, role.id])}
            className={cn(
              "h-[30px] rounded-[7px] border px-2.5 font-mono text-[12px] font-semibold transition-colors duration-150",
              on ? "border-accent bg-accent-subtle text-foreground" : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {on ? "✓ " : ""}
            {role.name}
          </button>
        );
      })}
    </div>
  );
}

/** Offsets offered as one-tick reminders on a brand-new event (minutes before start). */
const PRESET_OFFSETS = [15, 5, 0] as const;

export function EventDialog({
  target,
  activities,
  webhooks,
  roles,
  onClose,
  onSaved,
}: {
  target: { event: ScheduledEventWithNotifications | null } | null;
  activities: ActivityType[];
  webhooks: DiscordWebhook[];
  roles: DiscordRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const event = target?.event ?? null;
  const [title, setTitle] = useState("");
  const [activityId, setActivityId] = useState<string>(NONE);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [every, setEvery] = useState("1");
  const [unit, setUnit] = useState<ScheduleUnit>("day");
  const [allDay, setAllDay] = useState(false);
  const [hours, setHours] = useState("");
  // Create-only: reminders added together with the event. Edit uses the reminder list instead.
  const [presetChannel, setPresetChannel] = useState("");
  const [presetRoles, setPresetRoles] = useState<number[]>([]);
  const [presets, setPresets] = useState<number[]>([...PRESET_OFFSETS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setPresetChannel(webhooks[0] ? String(webhooks[0].id) : "");
    setPresetRoles([]);
    setPresets([...PRESET_OFFSETS]);
    const isAllDay = event?.duration_minutes === ALL_DAY;
    // An all-day event is anchored at 00:00 UTC, so its calendar date is the UTC date — the local
    // conversion would show the previous day west of Greenwich and shift the event on save.
    const start = event
      ? isAllDay
        ? { date: event.starts_at.slice(0, 10), time: "00:00" }
        : toLocalInputs(event.starts_at)
      : defaultStart();
    setTitle(event?.title ?? "");
    setActivityId(event?.activity_type_id ? String(event.activity_type_id) : NONE);
    setDate(start.date);
    setTime(start.time);
    setEvery(String(event?.every ?? 1));
    setUnit(event?.unit ?? "day");
    setAllDay(isAllDay);
    setHours(event && event.duration_minutes !== null && event.duration_minutes !== ALL_DAY ? String(event.duration_minutes / 60) : "");
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, event]);

  const everyNum = Number(every);
  const hoursNum = Number(hours);
  // All-day events anchor at 00:00 UTC on the chosen date (in-game days reset on UTC); the time input
  // only applies to timed events.
  const utc = allDay ? (date ? `${date}T00:00:00.000Z` : "") : fromLocalInputs(date, time);
  const canSave = !busy && title.trim() !== "" && utc !== "" && Number.isFinite(everyNum) && everyNum >= 1;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      activity_type_id: activityId === NONE ? null : Number(activityId),
      starts_at: utc,
      every: Math.max(1, Math.round(everyNum)),
      unit,
      duration_minutes: allDay
        ? ALL_DAY
        : hours.trim() === "" || !Number.isFinite(hoursNum) || hoursNum <= 0
          ? null
          : Math.round(hoursNum * 60),
    };
    try {
      if (event) {
        await api.schedule.updateEvent(event.id, body);
      } else {
        const created = await api.schedule.addEvent(body);
        if (presetChannel !== "") {
          for (const minutes of PRESET_OFFSETS.filter((m) => presets.includes(m))) {
            await api.schedule.addNotification(created.id, {
              webhook_id: Number(presetChannel),
              role_ids: presetRoles,
              minutes_before: minutes,
            });
          }
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-lg", SHEET)}>
        <DialogHead
          icon={<CalendarClock className="size-[18px]" />}
          tone="bg-accent-subtle text-foreground"
          title={event ? t("schedule.eventDialog.edit") : t("schedule.eventDialog.add")}
          description={t("schedule.eventDialog.desc")}
        />

        <div className="flex flex-col gap-4">
          {error && <ErrorNote message={error} />}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("schedule.eventDialog.name")}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("schedule.eventDialog.namePlaceholder")}
              />
            </Field>
            <Field label={t("schedule.eventDialog.activity")} hint={t("common.optional")}>
              <Select value={activityId} onValueChange={setActivityId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("schedule.eventDialog.activityNone")}</SelectItem>
                  {activities.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={t("schedule.eventDialog.first")} hint={t("schedule.eventDialog.localHint")}>
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto flex-1" />
              {!allDay && (
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-auto flex-1" />
              )}
            </div>
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <Clock className="size-3" />
              {t("schedule.eventDialog.storedAs", {
                utc: utc === "" ? "—" : utc.slice(0, 16).replace("T", " "),
              })}
            </p>
          </Field>

          <div className="flex flex-wrap items-end gap-4">
            <Field label={t("schedule.eventDialog.repeatEvery")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={every}
                  onChange={(e) => setEvery(e.target.value)}
                  className="w-[72px]"
                />
                <SegToggle
                  value={unit}
                  onChange={setUnit}
                  options={[
                    { value: "day", label: t("schedule.format.day", { count: everyNum || 1 }) },
                    { value: "week", label: t("schedule.format.week", { count: everyNum || 1 }) },
                  ]}
                />
              </div>
            </Field>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-[13px] text-foreground">
              <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />
              {t("schedule.eventDialog.allDay")}
            </label>
          </div>

          {!allDay && (
            <Field label={t("schedule.eventDialog.duration")} hint={t("schedule.eventDialog.durationHint")}>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="—"
                  className="w-[88px]"
                />
                <span className="text-[13px] text-secondary">{t("schedule.eventDialog.hours")}</span>
                <span className="text-[11.5px] text-faint">
                  {hoursNum > 0
                    ? t("schedule.eventDialog.durNoteDuring")
                    : t("schedule.eventDialog.durNoteInstant")}
                </span>
              </div>
            </Field>
          )}

          {!event && webhooks.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted-surface p-3">
              <Field label={t("schedule.eventDialog.reminders")} hint={t("schedule.eventDialog.remindersHint")}>
                <div className="flex flex-wrap gap-2">
                  {PRESET_OFFSETS.map((minutes) => {
                    const on = presets.includes(minutes);
                    return (
                      <label key={minutes} className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) =>
                            setPresets((prev) => (v === true ? [...prev, minutes] : prev.filter((m) => m !== minutes)))
                          }
                        />
                        {whenLabel(minutes, t)}
                      </label>
                    );
                  })}
                </div>
              </Field>
              {presets.length > 0 && (
                <>
                  <Field label={t("schedule.reminderDialog.channel")}>
                    <Select value={presetChannel} onValueChange={setPresetChannel}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {webhooks.map((w) => (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("schedule.reminderDialog.pingRoles")}>
                    <RolePicker roles={roles} value={presetRoles} onChange={setPresetRoles} />
                  </Field>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave}>
            {busy
              ? t("common.actions.saving")
              : event
                ? t("common.actions.saveChanges")
                : t("schedule.eventDialog.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReminderDialog({
  target,
  webhooks,
  roles,
  templates,
  languageNames,
  onClose,
  onSaved,
}: {
  target: { event: ScheduledEventWithNotifications; notification: EventNotification | null } | null;
  webhooks: DiscordWebhook[];
  roles: DiscordRole[];
  templates: MessageTemplate[];
  languageNames: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const event = target?.event ?? null;
  const notification = target?.notification ?? null;
  const [webhookId, setWebhookId] = useState("");
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [offset, setOffset] = useState("15");
  const [after, setAfter] = useState(false);
  const [templateId, setTemplateId] = useState(NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setWebhookId(String(notification?.webhook_id ?? webhooks[0]?.id ?? ""));
    setRoleIds(notification?.role_ids ?? []);
    setOffset(String(Math.abs(notification?.minutes_before ?? 15)));
    setAfter((notification?.minutes_before ?? 0) < 0);
    setTemplateId(notification?.template_id ? String(notification.template_id) : NONE);
    setBusy(false);
    setError(null);
  }, [target, notification, webhooks]);

  const duration = event?.duration_minutes ?? null;
  const canAfter = duration !== null;
  const minutes = Math.max(0, Math.round(Number(offset)) || 0);
  const minutesBefore = canAfter && after && minutes > 0 ? -minutes : minutes;
  const overruns = canAfter && after && duration !== null && minutes >= duration;
  const canSave = !busy && webhookId !== "";

  const save = async () => {
    if (!canSave || !event) return;
    setBusy(true);
    setError(null);
    const body = {
      webhook_id: Number(webhookId),
      template_id: templateId === NONE ? null : Number(templateId),
      role_ids: roleIds,
      minutes_before: minutesBefore,
    };
    try {
      if (notification) await api.schedule.updateNotification(notification.id, body);
      else await api.schedule.addNotification(event.id, body);
      onSaved();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-lg", SHEET)}>
        <DialogHead
          icon={<Bell className="size-[18px]" />}
          tone="bg-accent-subtle text-foreground"
          title={notification ? t("schedule.reminderDialog.edit") : t("schedule.reminderDialog.add")}
          description={t("schedule.reminderDialog.desc", {
            event: event?.title ?? "",
            langs: languageNames,
          })}
        />

        <div className="flex flex-col gap-4">
          {error && <ErrorNote message={error} />}

          <Field label={t("schedule.reminderDialog.channel")}>
            {webhooks.length === 0 ? (
              <p className="text-[12.5px] text-warn">{t("schedule.reminderDialog.noChannels")}</p>
            ) : (
              <Select value={webhookId} onValueChange={setWebhookId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {webhooks.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label={t("schedule.reminderDialog.pingRoles")}>
            <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
          </Field>

          <Field label={t("schedule.reminderDialog.when")}>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
                className="w-[80px]"
              />
              <span className="text-[13px] text-secondary">{t("schedule.reminderDialog.minutes")}</span>
              {canAfter ? (
                <SegToggle
                  value={after ? "after" : "before"}
                  onChange={(v) => setAfter(v === "after")}
                  options={[
                    { value: "before", label: t("schedule.reminderDialog.before") },
                    { value: "after", label: t("schedule.reminderDialog.after") },
                  ]}
                />
              ) : (
                <span className="text-[12px] text-faint">{t("schedule.reminderDialog.before")}</span>
              )}
            </div>
            <p className="text-[12px] text-muted">
              <Trans
                i18nKey="schedule.reminderDialog.fires"
                values={{ when: whenLabel(minutesBefore, t) }}
                components={{ 1: <b className="font-semibold text-foreground" /> }}
              />
              {overruns && duration !== null && (
                <span className="text-warn">
                  {" — "}
                  {t("schedule.reminderDialog.laterThanEnd", { duration: formatDuration(duration, t) })}
                </span>
              )}
            </p>
          </Field>

          <Field label={t("schedule.reminderDialog.message")}>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("schedule.reminderDialog.messageDefault")}</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave}>
            {busy
              ? t("common.actions.saving")
              : notification
                ? t("common.actions.saveChanges")
                : t("schedule.reminderDialog.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
