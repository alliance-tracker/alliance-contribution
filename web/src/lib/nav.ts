import {
  LayoutDashboard,
  Trophy,
  User,
  CalendarCheck,
  SlidersHorizontal,
  Swords,
  Crown,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/i18n";

/** `hue` is a CSS colour reference (a --color-nav-* token): the sidebar tile and the top-bar accent bar. */
export type NavItem = { to: string; label: TKey; icon: LucideIcon; hue: string };
export type NavSection = { title: TKey; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    title: "nav.sections.dashboard",
    items: [
      { to: "/", label: "nav.overview", icon: LayoutDashboard, hue: "var(--color-nav-overview)" },
      { to: "/rankings", label: "nav.ranking", icon: Trophy, hue: "var(--color-nav-ranking)" },
      { to: "/members", label: "nav.members", icon: User, hue: "var(--color-nav-members)" },
      { to: "/attendance", label: "nav.attendance", icon: CalendarCheck, hue: "var(--color-nav-attendance)" },
      { to: "/activities", label: "nav.activities", icon: Swords, hue: "var(--color-nav-activities)" },
    ],
  },
  {
    title: "nav.sections.events",
    items: [{ to: "/kvk", label: "nav.kvk", icon: Crown, hue: "var(--color-nav-kvk)" }],
  },
  {
    title: "nav.sections.manage",
    items: [{ to: "/admin", label: "nav.admin", icon: SlidersHorizontal, hue: "var(--color-nav-admin)" }],
  },
];

/** A key holder's whole nav: just their appointments page. */
export const kvkHolderSections: NavSection[] = [
  {
    title: "nav.sections.kvk",
    items: [{ to: "/kvk", label: "nav.appointments", icon: Crown, hue: "var(--color-nav-kvk)" }],
  },
];

/** Translation key of the best-match page title; null → caller shows the brand name. */
export function titleForPath(pathname: string): TKey | null {
  if (pathname.startsWith("/admin")) return "nav.admin";
  if (pathname.startsWith("/rankings")) return "nav.ranking";
  if (pathname.startsWith("/members/")) return "nav.memberProfile";
  if (pathname.startsWith("/activities")) return "nav.activities";
  if (pathname.startsWith("/kvk")) return "nav.kvk";
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
  "/kvk": "nav.subtitles.kvk",
  "/kvk/keys": "nav.subtitles.kvkKeys",
  "/kvk/settings": "nav.subtitles.kvkSettings",
};

/** Translation key of the best-match page subtitle; null → none. */
export function subtitleForPath(pathname: string): TKey | null {
  if (pathname.startsWith("/admin")) return "nav.subtitles.admin";
  if (pathname.startsWith("/members/")) return "nav.subtitles.memberProfile";
  if (pathname.startsWith("/activities")) return "nav.subtitles.activities";
  return subtitles[pathname] ?? null;
}

/** Hue of the nav item that owns this path (nested routes included); null → no accent. */
export function hueForPath(pathname: string): string | null {
  const items = navSections.flatMap((section) => section.items);
  const hit = items.find((item) => (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)));
  return hit?.hue ?? null;
}
