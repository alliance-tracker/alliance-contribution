import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { KvkAppointmentRow, KvkBoard } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useApiKey } from "@/lib/apiKey";
import type { KvkSlotRef } from "@/lib/kvk";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "@/components/States";
import { Toast } from "@/components/schedule/parts";
import { ScheduleHeader } from "@/components/kvk/ScheduleHeader";
import { PositionStrip } from "@/components/kvk/PositionStrip";
import { ScheduleGrid } from "@/components/kvk/ScheduleGrid";
import { SlotDialog } from "@/components/kvk/SlotDialog";

// Tasks 5 (Access keys) and 6 (Event settings) widen this to "schedule" | "keys" | "settings" and add
// their TABS/TAB_DOT entries (dots bg-tone-blue / bg-nav-admin per the handoff) — no restructuring.
type Tab = "schedule";
const TABS: Tab[] = ["schedule"];
const TAB_DOT: Record<Tab, string> = {
  schedule: "bg-nav-kvk",
};

export function KvkPrep() {
  const { t } = useTranslation();
  const { tab = "schedule" } = useParams();
  const { role } = useApiKey();
  const isAdmin = role === "admin";

  const [board, setBoard] = useState<KvkBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [slotTarget, setSlotTarget] = useState<{ ref: KvkSlotRef; appt: KvkAppointmentRow | null } | null>(null);

  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (title: string, sub = "") => {
    window.clearTimeout(toastTimer.current);
    setToast({ title, sub });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

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
          if (aliveRef.current) setLoadError(e instanceof ApiError ? e.message : t("common.errors.generic"));
        }),
    [t],
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
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}

      {tab === "schedule" && (
        <>
          <ScheduleHeader board={board} now={now} ownKeyId={null} />
          <PositionStrip />
          <ScheduleGrid
            board={board}
            now={now}
            ownKeyId={null}
            canEdit={() => isAdmin}
            onCellClick={(ref, appt) => setSlotTarget({ ref, appt })}
          />
        </>
      )}

      <SlotDialog
        target={slotTarget}
        alliances={board.alliances}
        appointments={board.appointments}
        startDate={board.event.start_date}
        lockedKeyId={null}
        onClose={() => setSlotTarget(null)}
        onSaved={(message) => {
          showToast(message);
          reload();
        }}
        onConflict={() => {
          showToast(t("kvk.toast.taken"), t("kvk.toast.takenSub"));
          reload();
        }}
      />
      <Toast toast={toast} />
    </div>
  );
}
