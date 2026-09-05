import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";
import type { TKey } from "@/i18n";

const TABS: { to: string; label: TKey; adminOnly?: boolean }[] = [
  { to: "/admin/events", label: "nav.adminTabs.events" },
  { to: "/admin/roster", label: "nav.adminTabs.roster" },
  { to: "/admin/aliases", label: "nav.adminTabs.aliases" },
  { to: "/admin/scoring", label: "nav.adminTabs.scoring" },
  { to: "/admin/rewards", label: "nav.adminTabs.rewards", adminOnly: true },
  { to: "/admin/backup", label: "nav.adminTabs.backup", adminOnly: true },
];

export function AdminTabs() {
  const { t } = useTranslation();
  const { role } = useApiKey();
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || role === "admin");

  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-[10px] border border-border bg-muted-surface p-1">
      {visibleTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
              isActive
                ? "bg-surface font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-muted hover:text-foreground",
            )
          }
        >
          {t(tab.label)}
        </NavLink>
      ))}
    </div>
  );
}
