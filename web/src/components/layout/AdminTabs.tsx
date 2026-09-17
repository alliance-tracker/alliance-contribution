import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";
import type { TKey } from "@/i18n";

const TABS: { to: string; label: TKey; dot: string; adminOnly?: boolean; schedulerOnly?: boolean }[] = [
  { to: "/admin/events", label: "nav.adminTabs.events", dot: "bg-tone-blue" },
  { to: "/admin/roster", label: "nav.adminTabs.roster", dot: "bg-tone-teal" },
  { to: "/admin/aliases", label: "nav.adminTabs.aliases", dot: "bg-tone-blue" },
  { to: "/admin/scoring", label: "nav.adminTabs.scoring", dot: "bg-tone-orange" },
  { to: "/admin/rewards", label: "nav.adminTabs.rewards", dot: "bg-tone-pink", adminOnly: true },
  { to: "/admin/backup", label: "nav.adminTabs.backup", dot: "bg-band-rest", adminOnly: true },
  // Managers see it too — read-only; the tab only exists where the deployment runs the scheduler.
  { to: "/admin/schedule", label: "nav.adminTabs.schedule", dot: "bg-tone-blue", schedulerOnly: true },
];

export function AdminTabs() {
  const { t } = useTranslation();
  const { role, scheduler } = useApiKey();
  const visibleTabs = TABS.filter(
    (tab) => (!tab.adminOnly || role === "admin") && (!tab.schedulerOnly || scheduler),
  );

  return (
    <div className="no-scrollbar flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap rounded-[10px] border border-border bg-muted-surface p-1 md:inline-flex md:w-auto md:flex-wrap md:overflow-visible">
      {visibleTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
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
                className={cn("hidden size-2 flex-none rounded-full md:block", tab.dot, !isActive && "opacity-50")}
              />
              {t(tab.label)}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
