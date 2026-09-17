import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Plus } from "lucide-react";
import type {
  DiscordRole,
  DiscordWebhook,
  EventNotification,
  MessageTemplate,
  ScheduleLanguages,
  ScheduleStatus,
  ScheduledEventWithNotifications,
} from "@shared/types";
import { api } from "@/lib/api";
import { useApiKey } from "@/lib/apiKey";
import { firstError, useApi } from "@/lib/useApi";
import { writeErrorMessage } from "@/lib/errors";
import { languageName } from "@/lib/schedule-languages";
import { relativeTime, toDate, whenLabel } from "@/lib/schedule-format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/States";
import { DiscordTab } from "@/components/schedule/DiscordTab";
import { ChannelDialog, RoleDialog } from "@/components/schedule/DiscordDialogs";
import { EventDialog, ReminderDialog } from "@/components/schedule/EventDialog";
import { EventsTab, type ScheduleNames } from "@/components/schedule/EventsTab";
import { MessageDialog } from "@/components/schedule/MessageDialog";
import { MessagesTab } from "@/components/schedule/MessagesTab";
import { ConfirmDialog, ErrorNote, Toast, type ConfirmTarget } from "@/components/schedule/parts";

type Tab = "events" | "messages" | "discord";
const TABS: Tab[] = ["events", "messages", "discord"];
/** Older than this and the heartbeat pill goes red — the cron ticks every minute. */
const STALE_MS = 5 * 60_000;
const EMPTY_LANGUAGES: ScheduleLanguages = { languages: ["en"], source: "default" };

type Lists = "events" | "templates" | "webhooks" | "roles" | "languages";

export function Schedule() {
  const { t } = useTranslation();
  const { role, scheduler } = useApiKey();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<Tab>("events");
  const [nonce, setNonce] = useState<Record<Lists, number>>({
    events: 0,
    templates: 0,
    webhooks: 0,
    roles: 0,
    languages: 0,
  });
  const refetch = (list: Lists) => setNonce((prev) => ({ ...prev, [list]: prev[list] + 1 }));

  // Non-admin keys get the read-only model; admins get the five editable lists.
  const readOnly = useApi(
    () => (isAdmin ? Promise.resolve(null) : api.schedule.read()),
    [isAdmin, nonce.events],
  );
  const eventsState = useApi<ScheduledEventWithNotifications[]>(
    () => (isAdmin ? api.schedule.events() : Promise.resolve([])),
    [isAdmin, nonce.events],
  );
  const templatesState = useApi<MessageTemplate[]>(
    () => (isAdmin ? api.schedule.templates() : Promise.resolve([])),
    [isAdmin, nonce.templates],
  );
  const webhooksState = useApi<DiscordWebhook[]>(
    () => (isAdmin ? api.schedule.webhooks() : Promise.resolve([])),
    [isAdmin, nonce.webhooks],
  );
  const rolesState = useApi<DiscordRole[]>(
    () => (isAdmin ? api.schedule.roles() : Promise.resolve([])),
    [isAdmin, nonce.roles],
  );
  const languagesState = useApi<ScheduleLanguages | null>(
    () => (isAdmin ? api.schedule.languages() : Promise.resolve(null)),
    [isAdmin, nonce.languages],
  );
  const activitiesState = useApi(() => api.activityTypes.list(), []);

  // Cron liveness. Admins poll it; read-only keys take the copy that came with the read model.
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const load = () =>
      api.schedule
        .status()
        .then((next) => {
          if (alive) setStatus(next);
        })
        .catch(() => {
          /* the pill just stays as it was; a failing poll is not a page error */
        });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [isAdmin]);

  const [eventDialog, setEventDialog] = useState<{ event: ScheduledEventWithNotifications | null } | null>(null);
  const [reminderDialog, setReminderDialog] = useState<{
    event: ScheduledEventWithNotifications;
    notification: EventNotification | null;
  } | null>(null);
  const [messageDialog, setMessageDialog] = useState<{ template: MessageTemplate | null } | null>(null);
  const [channelOpen, setChannelOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (title: string, sub: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ title, sub });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  if (!scheduler) return <p className="mx-auto max-w-3xl text-[13px] text-muted">{t("common.notFound")}</p>;

  const loading =
    activitiesState.loading ||
    (isAdmin
      ? eventsState.loading || templatesState.loading || webhooksState.loading || rolesState.loading || languagesState.loading
      : readOnly.loading);
  const error = firstError(
    activitiesState,
    readOnly,
    eventsState,
    templatesState,
    webhooksState,
    rolesState,
    languagesState,
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const events = (isAdmin ? eventsState.data : readOnly.data?.events) ?? [];
  const templates = templatesState.data ?? [];
  const webhooks = webhooksState.data ?? [];
  const roles = rolesState.data ?? [];
  const languages = languagesState.data ?? (readOnly.data ? { languages: readOnly.data.languages, source: "default" as const } : EMPTY_LANGUAGES);
  const languageNames = languages.languages.map(languageName).join(", ");
  const lastRun = (isAdmin ? status : readOnly.data?.status)?.last_run ?? null;
  const stale = lastRun === null || Date.now() - toDate(lastRun).getTime() > STALE_MS;

  const nameLists = isAdmin
    ? { channels: webhooks, roles, templates }
    : (readOnly.data?.names ?? { channels: [], roles: [], templates: [] });
  const lookup = (rows: { id: number; name: string }[]) => (id: number) => rows.find((r) => r.id === id)?.name ?? null;
  const names: ScheduleNames = {
    channel: lookup(nameLists.channels),
    role: lookup(nameLists.roles),
    template: (id) => (id === null ? null : lookup(nameLists.templates)(id)),
  };

  /** Every write goes through here: no optimistic state, refetch what changed, surface failures. */
  const run = (list: Lists, action: Promise<unknown>) => {
    setWriteError(null);
    action
      .then(() => refetch(list))
      .catch((e: unknown) => setWriteError(writeErrorMessage(e, t, "schedule.needKey", true)));
  };

  const confirmDelete = (kind: string, label: string, body: string, list: Lists, action: () => Promise<unknown>) =>
    setConfirm({
      kind,
      label,
      body,
      run: async () => {
        await action();
        refetch(list);
      },
    });

  const primaryLabel = tab === "messages" ? t("schedule.addMessage") : t("schedule.addEvent");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAdmin ? (
          <div className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-muted-surface p-1">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                  tab === key
                    ? "bg-surface font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-muted hover:text-foreground",
                )}
              >
                {t(`schedule.tabs.${key}` as const)}
                {key !== "discord" && (
                  <span
                    className={cn(
                      "num rounded-[4px] px-1.5 font-mono text-[10.5px] font-semibold",
                      tab === key ? "bg-foreground text-accent-foreground" : "bg-border text-muted",
                    )}
                  >
                    {key === "events" ? events.length : templates.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span
            title={t("schedule.heartbeatTitle")}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-[8px] border px-2.5 font-mono text-[11.5px]",
              stale ? "border-risk-border bg-risk-bg text-down" : "border-border bg-surface text-secondary",
            )}
          >
            <span className={cn("size-[7px] rounded-full", stale ? "bg-down" : "bg-up")} />
            {t("schedule.lastChecked", {
              when: lastRun === null ? t("schedule.lastCheckedNever") : relativeTime(lastRun, t),
            })}
          </span>

          {!isAdmin && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-muted-surface px-2.5 text-[12px] text-muted">
              <Lock className="size-3.5" />
              {t("schedule.readOnly")}
            </span>
          )}

          {isAdmin && tab !== "discord" && (
            <Button
              size="sm"
              className="h-8"
              onClick={() => (tab === "messages" ? setMessageDialog({ template: null }) : setEventDialog({ event: null }))}
            >
              <Plus className="size-3.5" />
              {primaryLabel}
            </Button>
          )}
        </div>
      </div>

      {writeError && <ErrorNote message={writeError} />}

      {tab === "events" && (
        <EventsTab
          events={events}
          languages={languages.languages}
          activities={activitiesState.data ?? []}
          names={names}
          isAdmin={isAdmin}
          actions={{
            toggleEnabled: (event, enabled) => run("events", api.schedule.updateEvent(event.id, { enabled })),
            editEvent: (event) => setEventDialog({ event }),
            deleteEvent: (event) =>
              confirmDelete(
                t("schedule.confirm.kind.event"),
                event.title,
                t("schedule.confirm.event", {
                  reminders: t("schedule.events.reminderCount", { count: event.notifications.length }),
                }),
                "events",
                () => api.schedule.deleteEvent(event.id),
              ),
            addReminder: (event) => setReminderDialog({ event, notification: null }),
            editReminder: (event, notification) => setReminderDialog({ event, notification }),
            deleteReminder: (event, notification) =>
              confirmDelete(
                t("schedule.confirm.kind.reminder"),
                `${event.title} · ${whenLabel(notification.minutes_before, t)}`,
                t("schedule.confirm.reminder", {
                  channel: names.channel(notification.webhook_id) ?? t("schedule.events.unknownChannel"),
                }),
                "events",
                () => api.schedule.deleteNotification(notification.id),
              ),
            test: (event, notification) => {
              setWriteError(null);
              api.schedule
                .testNotification(notification.id)
                .then(() =>
                  showToast(
                    t("schedule.toast.posted", {
                      channel: names.channel(notification.webhook_id) ?? t("schedule.events.unknownChannel"),
                    }),
                    t("schedule.toast.postedSub", {
                      event: event.title,
                      when: whenLabel(notification.minutes_before, t),
                      langs: t("schedule.langCount", { count: languages.languages.length }),
                    }),
                  ),
                )
                .catch((e: unknown) => setWriteError(writeErrorMessage(e, t, "schedule.needKey", true)));
            },
          }}
        />
      )}

      {tab === "messages" && isAdmin && (
        <MessagesTab
          templates={templates}
          languages={languages.languages}
          languageNames={languageNames}
          isAdmin={isAdmin}
          onEdit={(template) => setMessageDialog({ template })}
          onDelete={(template) =>
            confirmDelete(
              t("schedule.confirm.kind.message"),
              `“${template.name}”`,
              t("schedule.confirm.message"),
              "templates",
              () => api.schedule.deleteTemplate(template.id),
            )
          }
        />
      )}

      {tab === "discord" && isAdmin && (
        <DiscordTab
          webhooks={webhooks}
          roles={roles}
          languages={languages}
          isAdmin={isAdmin}
          onAddChannel={() => setChannelOpen(true)}
          onDeleteChannel={(webhook) =>
            confirmDelete(
              t("schedule.confirm.kind.channel"),
              webhook.name,
              t("schedule.confirm.channel", {
                reminders: t("schedule.events.reminderCount", {
                  count: events.reduce(
                    (sum, e) => sum + e.notifications.filter((n) => n.webhook_id === webhook.id).length,
                    0,
                  ),
                }),
              }),
              "webhooks",
              () => api.schedule.deleteWebhook(webhook.id),
            )
          }
          onAddRole={() => setRoleOpen(true)}
          onDeleteRole={(discordRole) =>
            confirmDelete(
              t("schedule.confirm.kind.role"),
              discordRole.name,
              t("schedule.confirm.role"),
              "roles",
              () => api.schedule.deleteRole(discordRole.id),
            )
          }
          onSaveLanguages={(next) => api.schedule.saveLanguages(next).then(() => refetch("languages"))}
        />
      )}

      <EventDialog
        target={eventDialog}
        activities={(activitiesState.data ?? []).filter((a) => a.active === 1)}
        webhooks={webhooks}
        roles={roles}
        onClose={() => setEventDialog(null)}
        onSaved={() => refetch("events")}
      />
      <ReminderDialog
        target={reminderDialog}
        webhooks={webhooks}
        roles={roles}
        templates={templates}
        languageNames={languageNames}
        onClose={() => setReminderDialog(null)}
        onSaved={() => refetch("events")}
      />
      <MessageDialog
        target={messageDialog}
        languages={languages.languages}
        onClose={() => setMessageDialog(null)}
        onSaved={() => refetch("templates")}
      />
      <ChannelDialog
        open={channelOpen}
        onClose={() => setChannelOpen(false)}
        onSaved={(name) => {
          refetch("webhooks");
          showToast(t("schedule.toast.channelAdded"), t("schedule.toast.channelAddedSub", { name }));
        }}
      />
      <RoleDialog open={roleOpen} onClose={() => setRoleOpen(false)} onSaved={() => refetch("roles")} />
      <ConfirmDialog target={confirm} onClose={() => setConfirm(null)} />
      <Toast toast={toast} />
    </div>
  );
}
