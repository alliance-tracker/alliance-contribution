import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Clock, Hash, Pencil, Plus, Send, Trash2 } from "lucide-react";
import type {
  ActivityType,
  EventNotification,
  LastSent as LastSentValue,
  ScheduledEventWithNotifications,
} from "@shared/types";
import { activityBadgeClass, activitySolidClass } from "@/lib/activity";
import { formatLocal, formatDuration, formatRepeat, localZone, relativeTime, whenLabel } from "@/lib/schedule-format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { IconTile, Strip } from "@/components/ui/tone";
import { EmptyState } from "@/components/States";

/** Name lookups for a reminder's foreign keys. Null in the read-only view, which has no such lists. */
export type ScheduleNames = {
  channel: (id: number) => string | null;
  role: (id: number) => string | null;
  template: (id: number | null) => string | null;
};

export type EventActions = {
  toggleEnabled: (event: ScheduledEventWithNotifications, enabled: boolean) => void;
  editEvent: (event: ScheduledEventWithNotifications) => void;
  deleteEvent: (event: ScheduledEventWithNotifications) => void;
  addReminder: (event: ScheduledEventWithNotifications) => void;
  editReminder: (event: ScheduledEventWithNotifications, notification: EventNotification) => void;
  deleteReminder: (event: ScheduledEventWithNotifications, notification: EventNotification) => void;
  test: (event: ScheduledEventWithNotifications, notification: EventNotification) => void;
};

type Props = {
  events: ScheduledEventWithNotifications[];
  languages: string[];
  activities: ActivityType[];
  names: ScheduleNames;
  isAdmin: boolean;
  actions: EventActions;
};

const ALL_DAY = 1440;

function ActivityBadge({ activity }: { activity: ActivityType }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
        activityBadgeClass(activity.color),
      )}
    >
      <span className={cn("size-[7px] rounded-[2px]", activitySolidClass(activity.color))} />
      {activity.name}
    </span>
  );
}

function LastSent({ last }: { last: LastSentValue }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          !last ? "bg-faint" : last.ok ? "bg-up" : "bg-down",
        )}
      />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[12px] text-secondary">
          {last ? relativeTime(last.at, t) : t("schedule.events.neverFired")}
        </div>
        <div
          className={cn(
            "truncate text-[11px]",
            !last ? "text-faint" : last.ok ? "text-up" : "font-semibold text-down",
          )}
        >
          {last
            ? last.ok
              ? t("schedule.events.delivered")
              : t("schedule.events.failed")
            : t("schedule.events.waiting")}
        </div>
      </div>
    </div>
  );
}

function RoleChips({ roleIds, names }: { roleIds: number[]; names: ScheduleNames }) {
  const { t } = useTranslation();
  if (roleIds.length === 0)
    return <span className="text-[11.5px] italic text-faint">{t("schedule.events.noPings")}</span>;
  return (
    <>
      {roleIds.map((id) => (
        <span
          key={id}
          className="inline-flex items-center rounded-[5px] border border-tone-blue-border bg-tone-blue-bg px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tone-blue-fg"
        >
          {names.role(id) ?? `#${id}`}
        </span>
      ))}
    </>
  );
}

/** One reminder, as a wrapping row (desktop) or inside a card (mobile) — same content both ways. */
function ReminderLine({
  event,
  notification,
  names,
  isAdmin,
  actions,
}: {
  event: ScheduledEventWithNotifications;
  notification: EventNotification;
  names: ScheduleNames;
  isAdmin: boolean;
  actions: EventActions;
}) {
  const { t } = useTranslation();
  const template = names.template(notification.template_id) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-2.5 last:border-b-0">
      <span className="flex min-w-[130px] items-center gap-1.5 text-[12.5px] font-medium text-foreground">
        <Hash className="size-3.5 shrink-0 text-muted" />
        {names.channel(notification.webhook_id) ?? t("schedule.events.unknownChannel")}
      </span>
      <div className="flex min-w-[110px] flex-wrap items-center gap-1">
        <RoleChips roleIds={notification.role_ids} names={names} />
      </div>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-secondary">
        <Clock className="size-3.5 shrink-0 text-faint" />
        {whenLabel(notification.minutes_before, t)}
      </span>
      <span
        className={cn(
          "min-w-[80px] text-[12.5px]",
          template ? "font-medium text-foreground" : "italic text-faint",
        )}
      >
        {template ?? t("schedule.events.defaultMessage")}
      </span>
      <div className="flex flex-1 items-center justify-end gap-2">
        <LastSent last={notification.last_sent} />
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[12px]"
              title={t("schedule.events.testTitle")}
              onClick={() => actions.test(event, notification)}
            >
              <Send className="size-3" />
              {t("schedule.events.test")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title={t("schedule.events.editReminder")}
              onClick={() => actions.editReminder(event, notification)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:bg-down/10 hover:text-down"
              title={t("schedule.events.deleteReminder")}
              onClick={() => actions.deleteReminder(event, notification)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReminderPanel({
  event,
  names,
  isAdmin,
  actions,
}: {
  event: ScheduledEventWithNotifications;
  names: ScheduleNames;
  isAdmin: boolean;
  actions: EventActions;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 border-t border-border bg-background px-3.5 py-2 md:ps-[50px]">
      {event.notifications.map((n) => (
        <ReminderLine
          key={n.id}
          event={event}
          notification={n}
          names={names}
          isAdmin={isAdmin}
          actions={actions}
        />
      ))}
      {event.notifications.length === 0 && (
        <p className="py-2 text-[12.5px] text-muted">{t("schedule.events.noReminders")}</p>
      )}
      {isAdmin && (
        <div className="py-2">
          <Button variant="dashed" size="sm" onClick={() => actions.addReminder(event)}>
            <Plus className="size-3.5" />
            {t("schedule.events.addReminder")}
          </Button>
        </div>
      )}
    </div>
  );
}

const GRID = "grid grid-cols-[22px_minmax(0,1fr)_100px_70px_170px_52px_84px_68px] items-center gap-3";

function EventRow({
  event,
  activity,
  names,
  isAdmin,
  actions,
  expanded,
  onToggleExpand,
}: {
  event: ScheduledEventWithNotifications;
  activity: ActivityType | undefined;
  names: ScheduleNames;
  isAdmin: boolean;
  actions: EventActions;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { t } = useTranslation();
  const lasts = event.duration_minutes !== null;
  return (
    <div className={cn("border-b border-border last:border-b-0", !event.enabled && "opacity-60")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className={cn(GRID, "cursor-pointer px-3.5 py-2.5 hover:bg-background")}
      >
        <ChevronRight
          className={cn("size-[15px] text-faint transition-transform duration-150", expanded && "rotate-90 text-foreground")}
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-foreground">{event.title}</span>
          {activity && <ActivityBadge activity={activity} />}
        </div>
        <span className="truncate text-[13px] text-secondary">
          {formatRepeat(event.every, event.unit, t)}
        </span>
        <span className={cn("text-[13px]", lasts ? "text-secondary" : "text-faint")}>
          {event.duration_minutes === null
            ? "—"
            : event.duration_minutes === ALL_DAY
              ? t("schedule.events.allDay")
              : formatDuration(event.duration_minutes, t)}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[12.5px] font-medium text-foreground">
            {event.next_at ? formatLocal(event.next_at, event.duration_minutes === ALL_DAY) : t("schedule.events.paused")}
          </div>
          <div className="truncate text-[11.5px] text-muted">
            {event.next_at ? relativeTime(event.next_at, t) : t("schedule.events.notPosting")}
          </div>
        </div>
        <Switch
          on={event.enabled}
          disabled={!isAdmin}
          title={event.enabled ? t("schedule.events.turnOff") : t("schedule.events.turnOn")}
          onToggle={() => actions.toggleEnabled(event, !event.enabled)}
        />
        <span
          className={cn(
            "num inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-[6px] px-2 font-mono text-[11.5px] font-bold",
            event.notifications.length ? "bg-muted-surface text-secondary" : "text-faint",
          )}
        >
          {event.notifications.length}
        </span>
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title={t("schedule.events.edit")}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.editEvent(event);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 hover:bg-down/10 hover:text-down"
                title={t("schedule.events.delete")}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.deleteEvent(event);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      {expanded && <ReminderPanel event={event} names={names} isAdmin={isAdmin} actions={actions} />}
    </div>
  );
}

/** Design 2a: the row's columns restacked as a card, with the reminders as cards below it. */
function EventCard({
  event,
  activity,
  names,
  isAdmin,
  actions,
  expanded,
  onToggleExpand,
}: {
  event: ScheduledEventWithNotifications;
  activity: ActivityType | undefined;
  names: ScheduleNames;
  isAdmin: boolean;
  actions: EventActions;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { t } = useTranslation();
  const lasts =
    event.duration_minutes === null
      ? t("schedule.events.instant")
      : event.duration_minutes === ALL_DAY
        ? t("schedule.events.allDay")
        : t("schedule.events.lasts", { duration: formatDuration(event.duration_minutes, t) });

  return (
    <div className={cn("border-b border-border p-3 last:border-b-0", !event.enabled && "opacity-60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-foreground">{event.title}</span>
            {activity && <ActivityBadge activity={activity} />}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {formatRepeat(event.every, event.unit, t)} · {lasts}
          </div>
        </div>
        {isAdmin && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title={t("schedule.events.edit")}
              onClick={() => actions.editEvent(event)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:bg-down/10 hover:text-down"
              title={t("schedule.events.delete")}
              onClick={() => actions.deleteEvent(event)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
        <Switch
          on={event.enabled}
          disabled={!isAdmin}
          title={event.enabled ? t("schedule.events.turnOff") : t("schedule.events.turnOn")}
          onToggle={() => actions.toggleEnabled(event, !event.enabled)}
        />
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="mt-2.5 flex w-full items-center gap-2 border-t border-border pt-2.5 text-start"
      >
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-faint">
            {t("schedule.events.nextLocal")}
          </div>
          <div className="truncate text-[12.5px] font-medium text-foreground">
            {event.next_at ? formatLocal(event.next_at, event.duration_minutes === ALL_DAY) : t("schedule.events.paused")}
            <span className="ms-1 font-normal text-muted">
              · {event.next_at ? relativeTime(event.next_at, t) : t("schedule.events.notPosting")}
            </span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
          {t("schedule.events.reminderCount", { count: event.notifications.length })}
          <ChevronDown className={cn("size-4 transition-transform duration-150", expanded && "rotate-180")} />
        </span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {event.notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-[8px] border bg-background px-2.5 py-2",
                n.last_sent && !n.last_sent.ok ? "border-risk-border" : "border-border",
              )}
            >
              <ReminderLine
                event={event}
                notification={n}
                names={names}
                isAdmin={isAdmin}
                actions={actions}
              />
            </div>
          ))}
          {event.notifications.length === 0 && (
            <p className="text-[12.5px] text-muted">{t("schedule.events.noReminders")}</p>
          )}
          {isAdmin && (
            <Button variant="dashed" size="sm" className="self-start" onClick={() => actions.addReminder(event)}>
              <Plus className="size-3.5" />
              {t("schedule.events.addReminder")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function EventsTab({ events, languages, activities, names, isAdmin, actions }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (id: number) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const byId = new Map(activities.map((a) => [a.id, a]));
  const reminderTotal = events.reduce((sum, e) => sum + e.notifications.length, 0);

  return (
    <Card className="overflow-hidden">
      <Strip tone="blue" always className="flex items-center gap-3 border-b p-4">
        <IconTile icon={Clock} tone="blue" always />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-foreground">{t("schedule.events.title")}</div>
          <div className="text-[12px] text-muted">
            {t("schedule.events.subtitle", {
              langs: t("schedule.langCount", { count: languages.length }),
              tz: localZone(),
            })}
          </div>
        </div>
      </Strip>

      {events.length === 0 ? (
        <EmptyState message={t("schedule.events.empty")} />
      ) : (
        <>
          <div className="hidden md:block">
            <div
              className={cn(
                GRID,
                "border-b border-border bg-background px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-faint",
              )}
            >
              <span />
              <span>{t("schedule.events.colEvent")}</span>
              <span>{t("schedule.events.colRepeats")}</span>
              <span>{t("schedule.events.colLasts")}</span>
              <span>{t("schedule.events.colNext")}</span>
              <span>{t("schedule.events.colOn")}</span>
              <span>{t("schedule.events.colReminders")}</span>
              <span />
            </div>
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                activity={event.activity_type_id === null ? undefined : byId.get(event.activity_type_id)}
                names={names}
                isAdmin={isAdmin}
                actions={actions}
                expanded={!!expanded[event.id]}
                onToggleExpand={() => toggle(event.id)}
              />
            ))}
          </div>

          <div className="md:hidden">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                activity={event.activity_type_id === null ? undefined : byId.get(event.activity_type_id)}
                names={names}
                isAdmin={isAdmin}
                actions={actions}
                expanded={!!expanded[event.id]}
                onToggleExpand={() => toggle(event.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-2.5 text-[11.5px] text-muted">
        <span>
          {t("schedule.events.footer", {
            events: t("schedule.events.count", { count: events.length }),
            reminders: t("schedule.events.reminderCount", { count: reminderTotal }),
          })}
        </span>
        <span className="text-faint">{t("schedule.events.timingHint")}</span>
      </div>
    </Card>
  );
}
