import { useEffect, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { KvkBoard } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "@/components/States";
import { ScheduleHeader } from "@/components/kvk/ScheduleHeader";
import { PositionStrip } from "@/components/kvk/PositionStrip";

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

  // Same polling shape as Schedule.tsx's status effect, at 30s instead of 60s: no useApi (it would
  // flash LoadingState on every poll), and a failed poll after the first load just keeps the last board.
  useEffect(() => {
    let alive = true;
    const reload = () =>
      api.kvk
        .board()
        .then((next) => {
          if (alive) {
            setBoard(next);
            setLoadError(null);
          }
        })
        .catch((e: unknown) => {
          if (alive) setLoadError(e instanceof ApiError ? e.message : t("common.errors.generic"));
        });
    reload();
    const timer = window.setInterval(() => {
      reload();
      setNow(Date.now());
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        </>
      )}
    </div>
  );
}
