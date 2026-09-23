import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import type { KvkAppointmentRow, KvkBoard, KvkEvent, KvkKey } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useApiKey } from "@/lib/apiKey";
import { useApi } from "@/lib/useApi";
import { currentDaySlot, fillCounts, holderCanEdit, signInLink, type KvkSlotRef } from "@/lib/kvk";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "@/components/States";
import { ConfirmDialog, Toast, type ConfirmTarget } from "@/components/schedule/parts";
import { ScheduleHeader } from "@/components/kvk/ScheduleHeader";
import { PositionStrip } from "@/components/kvk/PositionStrip";
import { ScheduleGrid } from "@/components/kvk/ScheduleGrid";
import { DayChips } from "@/components/kvk/DayChips";
import { SlotDialog } from "@/components/kvk/SlotDialog";
import { AccessKeysTab } from "@/components/kvk/AccessKeysTab";
import { KeyDialog } from "@/components/kvk/KeyDialog";
import { DisabledBanner } from "@/components/kvk/DisabledBanner";
import { EventSettings } from "@/components/kvk/EventSettings";

type Tab = "schedule" | "keys" | "settings";
const TABS: Tab[] = ["schedule", "keys", "settings"];
const TAB_DOT: Record<Tab, string> = {
  schedule: "bg-nav-kvk",
  keys: "bg-tone-blue",
  settings: "bg-nav-admin",
};

export function KvkPrep() {
  const { t } = useTranslation();
  const { tab = "schedule" } = useParams();
  const navigate = useNavigate();
  const { role, kvk, setKvkEnabled } = useApiKey();
  const isAdmin = role === "admin";
  const ownKeyId = role === "kvk" ? (kvk.key_id ?? null) : null;

  const [board, setBoard] = useState<KvkBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [slotTarget, setSlotTarget] = useState<{ ref: KvkSlotRef; appt: KvkAppointmentRow | null } | null>(null);
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const [keyTarget, setKeyTarget] = useState<{ key: KvkKey | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [keysNonce, setKeysNonce] = useState(0);
  const keysState = useApi(
    () => (isAdmin && tab === "keys" ? api.kvk.keys() : Promise.resolve<KvkKey[]>([])),
    [isAdmin, tab, keysNonce],
  );

  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (title: string, sub = "") => {
    window.clearTimeout(toastTimer.current);
    setToast({ title, sub });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // navigator.clipboard.writeText can reject (insecure context, denied permission) — a failed copy
  // gets a copy-specific error toast rather than a false "copied".
  const onCopy = (k: KvkKey, what: "key" | "link") => {
    const text = what === "key" ? k.key : signInLink(k.key, location.origin);
    navigator.clipboard
      .writeText(text)
      .then(() =>
        showToast(t(what === "key" ? "kvk.toast.keyCopied" : "kvk.toast.linkCopied", { alliance: k.alliance_name })),
      )
      .catch(() => showToast(t("kvk.toast.copyFailed")));
  };

  // Same polling shape as Schedule.tsx's status effect, at 30s instead of 60s: no useApi (it would
  // flash LoadingState on every poll), and a failed poll after the first load just keeps the last board.
  // `reload` is also called directly after a slot write (appoint/edit/remove/conflict) so the board
  // reflects it immediately instead of waiting for the next tick.
  const aliveRef = useRef(true);
  const reload = useCallback(
    () =>
      api.kvk
        .board()
        .then((next) => {
          if (aliveRef.current) {
            setBoard(next);
            setLoadError(null);
          }
        })
        .catch((e: unknown) => {
          if (!aliveRef.current) return;
          // The host turned the event off mid-session: AppRoutes swaps in KvkClosed.
          if (role === "kvk" && e instanceof ApiError && e.status === 401 && e.message === "kvk closed") {
            setKvkEnabled(false);
            return;
          }
          setLoadError(e instanceof ApiError ? e.message : t("common.errors.generic"));
        }),
    [t, role, setKvkEnabled],
  );

  useEffect(() => {
    aliveRef.current = true;
    reload();
    const timer = window.setInterval(() => {
      reload();
      setNow(Date.now());
    }, 30_000);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
    };
  }, [reload]);

  if (!TABS.includes(tab as Tab) || (tab !== "schedule" && !isAdmin)) {
    return <Navigate to="/kvk" replace />;
  }

  if (board === null) return loadError ? <ErrorState message={loadError} /> : <LoadingState />;

  const { filled } = fillCounts(board.appointments, board.event.days);
  const daySlot = currentDaySlot(board.event.start_date, now);
  const mobileDay = pickedDay ?? (daySlot?.phase === "live" ? daySlot.day : 1);

  return (
    <div className="flex flex-col gap-3.5">
      {isAdmin && (
        <div className="no-scrollbar flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap rounded-[10px] border border-border bg-muted-surface p-1 md:inline-flex md:w-auto md:flex-wrap md:overflow-visible">
          {TABS.map((key) => (
            <NavLink
              key={key}
              to={key === "schedule" ? "/kvk" : `/kvk/${key}`}
              end={key === "schedule"}
              className={({ isActive }) =>
                cn(
                  "flex flex-none items-center gap-[7px] rounded-[7px] px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 md:py-1.5",
                  isActive
                    ? "bg-surface font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-muted hover:text-foreground active:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn("hidden size-2 flex-none rounded-full md:block", TAB_DOT[key], !isActive && "opacity-50")}
                  />
                  {t(`kvk.tabs.${key}` as const)}
                  {key === "keys" && (
                    <span className="num flex size-[18px] items-center justify-center rounded-full bg-muted-surface text-[10px] font-bold text-secondary">
                      {board.alliances.length}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}

      {tab === "schedule" && (
        <>
          {isAdmin && !board.event.enabled && (
            <DisabledBanner onOpenSettings={() => navigate("/kvk/settings")} />
          )}
          <ScheduleHeader board={board} now={now} ownKeyId={ownKeyId} />
          <PositionStrip />
          {ownKeyId !== null && (
            <p className="text-[12.5px] text-muted">
              <Trans
                i18nKey="kvk.holder.note"
                values={{ alliance: kvk.alliance_name }}
                components={{ 1: <b className="font-semibold text-foreground" /> }}
              />
            </p>
          )}
          <div className="hidden md:block">
            <ScheduleGrid
              board={board}
              now={now}
              ownKeyId={ownKeyId}
              canEdit={(a) => isAdmin || (ownKeyId !== null && board.event.enabled && holderCanEdit(a, ownKeyId))}
              onCellClick={(ref, appt) => setSlotTarget({ ref, appt })}
            />
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            <DayChips board={board} day={mobileDay} onDay={setPickedDay} />
            <ScheduleGrid
              board={board}
              now={now}
              ownKeyId={ownKeyId}
              canEdit={(a) => isAdmin || (ownKeyId !== null && board.event.enabled && holderCanEdit(a, ownKeyId))}
              onCellClick={(ref, appt) => setSlotTarget({ ref, appt })}
              day={mobileDay}
            />
          </div>
        </>
      )}

      {tab === "keys" &&
        (keysState.loading ? (
          <LoadingState />
        ) : keysState.error ? (
          <ErrorState message={keysState.error} />
        ) : (
          <AccessKeysTab
            keys={keysState.data ?? []}
            onNew={() => setKeyTarget({ key: null })}
            onEdit={(k) => setKeyTarget({ key: k })}
            onCopy={onCopy}
          />
        ))}

      {tab === "settings" && (
        <EventSettings
          event={board.event}
          filled={filled}
          onSave={async (next: KvkEvent) => {
            await api.kvk.setEvent(next);
            setKvkEnabled(next.enabled);
            await reload();
          }}
          onClear={() =>
            setConfirm({
              kind: t("kvk.confirm.kind.schedule"),
              label: t("kvk.confirm.scheduleLabel", { n: filled }),
              body: t("kvk.confirm.schedule"),
              run: async () => {
                await api.kvk.clearAppointments();
                await reload();
                showToast(t("kvk.toast.cleared"));
              },
            })
          }
        />
      )}

      <SlotDialog
        target={slotTarget}
        alliances={board.alliances}
        appointments={board.appointments}
        startDate={board.event.start_date}
        lockedKeyId={ownKeyId}
        onClose={() => setSlotTarget(null)}
        onSaved={(message) => {
          showToast(message);
          reload();
        }}
        onConflict={(reason) => {
          if (reason === "conflict") showToast(t("kvk.toast.taken"), t("kvk.toast.takenSub"));
          else showToast(t("kvk.toast.slotChanged"));
          reload();
        }}
      />
      <KeyDialog
        target={keyTarget}
        usedColors={board.alliances.filter((a) => a.id !== keyTarget?.key?.id).map((a) => a.color)}
        onClose={() => setKeyTarget(null)}
        onChanged={() => {
          setKeysNonce((n) => n + 1);
          reload();
        }}
        onCopy={onCopy}
        onDelete={(k) =>
          setConfirm({
            kind: t("kvk.confirm.kind.key"),
            label: k.alliance_name,
            body: t("kvk.confirm.key"),
            run: async () => {
              await api.kvk.deleteKey(k.id);
              setKeysNonce((n) => n + 1);
              await reload();
              showToast(t("kvk.toast.keyDeleted"), t("kvk.toast.keyDeletedSub"));
            },
          })
        }
      />
      <ConfirmDialog target={confirm} onClose={() => setConfirm(null)} />
      <Toast toast={toast} />
    </div>
  );
}
