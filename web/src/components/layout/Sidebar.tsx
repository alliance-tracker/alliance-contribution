import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { navSections } from "@/lib/nav";
import { useApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";

/** Brand header + nav list, shared by the desktop aside and the mobile drawer. Both sit on the
 *  fixed navy `sidebar` surface in either theme, so text here uses the sidebar tokens / white,
 *  never the theme-flipping foreground tokens. */
export function SidebarNav() {
  const { t } = useTranslation();
  const { kvk } = useApiKey();
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-white/10 px-[18px] py-4">
        <div className="flex size-9 items-center justify-center rounded-[9px] bg-linear-to-br from-nav-overview to-nav-activities font-mono text-[14px] font-semibold tracking-[-0.03em] text-white">
          AT
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-[-0.01em] text-sidebar-fg">
            Alliance Tracker
          </div>
          <div className="truncate text-[11px] text-sidebar-muted" title={t("nav.tagline")}>
            {t("nav.tagline")}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-4 px-3 py-4">
        {navSections.map((section) => (
          <div key={section.title} className="flex flex-col gap-[3px]">
            <p className="px-2.5 pb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-sidebar-muted">
              {t(section.title)}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                style={{ "--hue": item.hue } as CSSProperties}
                className={({ isActive }) =>
                  cn(
                    // Drawer (below md): bare icon, taller rows. Desktop: hued 28px icon tile, tighter rows.
                    "flex items-center gap-[11px] rounded-[9px] border px-[11px] py-2.5 text-[13.5px] transition-colors duration-150 md:gap-2.5 md:py-[5px] md:ps-1.5 md:pe-2",
                    isActive
                      ? "border-white/10 bg-white/10 font-semibold text-white"
                      : "border-transparent font-medium text-sidebar-muted hover:bg-white/5 hover:text-sidebar-fg",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex flex-none items-center justify-center transition-colors duration-150 md:size-7 md:rounded-[8px]",
                        isActive
                          ? "md:bg-[var(--hue)] md:text-white"
                          : "md:bg-[color-mix(in_srgb,var(--hue)_20%,transparent)] md:text-[var(--hue)]",
                      )}
                    >
                      <item.icon className="size-[17px]" />
                    </span>
                    <span className="truncate" title={t(item.label)}>
                      {t(item.label)}
                    </span>
                    {item.to === "/kvk" && kvk.enabled && (
                      <span className="ms-auto shrink-0 rounded-[5px] bg-[#22c55e26] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.02em] text-[#4ade80]">
                        {t("nav.live")}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="scr hidden w-[250px] shrink-0 flex-col overflow-y-auto border-e border-sidebar bg-sidebar text-sidebar-fg md:flex">
      <SidebarNav />
    </aside>
  );
}
