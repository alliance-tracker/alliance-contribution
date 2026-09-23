import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LoadingState } from "@/components/States";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarNav } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const { t } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-full">
      <Sidebar />

      {/* Mobile off-canvas nav (below md). */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent aria-describedby={undefined} className="border-sidebar bg-sidebar text-sidebar-fg">
          <SheetTitle className="sr-only">{t("nav.navigation")}</SheetTitle>
          <SidebarNav />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setNavOpen(true)} />
        <main className="scr flex-1 overflow-y-auto p-4 md:p-7">
          <div className={cn(!pathname.startsWith("/kvk") && "mx-auto max-w-[1380px]")}>
            {/* Boundary for the route-split pages; the shell chrome stays put while a chunk loads. */}
            <Suspense fallback={<LoadingState />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
