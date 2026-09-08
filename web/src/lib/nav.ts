import {
  LayoutDashboard,
  Trophy,
  User,
  CalendarCheck,
  SlidersHorizontal,
  Swords,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/i18n";

export type NavItem = { to: string; label: TKey; icon: LucideIcon };
export type NavSection = { title: TKey; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    title: "nav.sections.dashboard",
    items: [
      { to: "/", label: "nav.overview", icon: LayoutDashboard },
      { to: "/rankings", label: "nav.ranking", icon: Trophy },
      { to: "/members", label: "nav.members", icon: User },
      { to: "/attendance", label: "nav.attendance", icon: CalendarCheck },
      { to: "/activities", label: "nav.activities", icon: Swords },
    ],
  },
  {
    title: "nav.sections.manage",
    items: [{ to: "/admin", label: "nav.admin", icon: SlidersHorizontal }],
  },
];

/** Translation key of the best-match page title; null → caller shows the brand name. */
export function titleForPath(pathname: string): TKey | null {
  if (pathname.startsWith("/admin")) return "nav.admin";
  if (pathname.startsWith("/rankings")) return "nav.ranking";
  if (pathname.startsWith("/members/")) return "nav.memberProfile";
  if (pathname.startsWith("/activities")) return "nav.activities";
  for (const section of navSections) {
    for (const item of section.items) {
      if (item.to === pathname) return item.label;
    }
  }
  return null;
}

const subtitles: Record<string, TKey> = {
  "/": "nav.subtitles.overview",
  "/rankings": "nav.subtitles.ranking",
  "/members": "nav.subtitles.members",
  "/attendance": "nav.subtitles.attendance",
};

/** Translation key of the best-match page subtitle; null → none. */
export function subtitleForPath(pathname: string): TKey | null {
  if (pathname.startsWith("/admin")) return "nav.subtitles.admin";
  if (pathname.startsWith("/members/")) return "nav.subtitles.memberProfile";
  if (pathname.startsWith("/activities")) return "nav.subtitles.activities";
  return subtitles[pathname] ?? null;
}
