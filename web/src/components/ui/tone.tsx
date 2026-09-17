import type { CSSProperties, HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Section tones — the hued chrome from the 2026-09-17 design refresh. A tone name resolves to a
 * --color-* token through an inline CSS variable, so the utilities below stay static strings
 * (Tailwind cannot see a class name assembled at runtime).
 */
export type StripTone = "amber" | "red" | "blue" | "teal" | "orange";
export type Tone = StripTone | "pink" | "slate" | "warn";

const FILL: Record<Tone, string> = {
  amber: "var(--color-tone-amber)",
  red: "var(--color-tone-red)",
  blue: "var(--color-tone-blue)",
  teal: "var(--color-tone-teal)",
  orange: "var(--color-tone-orange)",
  pink: "var(--color-tone-pink)",
  slate: "var(--color-band-rest)",
  warn: "var(--color-warn)",
};

/**
 * Hued icon square. `sm` (28px) sits in card headers, `lg` (38px, soft glow) in dialog heads.
 * Desktop-only unless `always` — the mobile mocks keep card headers plain.
 * Icon colour is `surface`: white in light, navy in dark, as the design does.
 */
export function IconTile({
  icon: Icon,
  tone,
  size = "sm",
  always = false,
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: "sm" | "lg";
  always?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ "--tile": FILL[tone] } as CSSProperties}
      className={cn(
        "flex-none items-center justify-center bg-[var(--tile)] text-surface",
        always ? "flex" : "hidden md:flex",
        size === "sm"
          ? "size-7 rounded-[8px] [&_svg]:size-3.5"
          : "size-[38px] rounded-[11px] shadow-[0_4px_10px_color-mix(in_srgb,var(--tile)_33%,transparent)] [&_svg]:size-[18px]",
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

/**
 * Header row that tints itself and recolours its bottom border. It sets colours only — the
 * caller keeps its own layout, padding and `border-b`. Desktop-only unless `always`.
 */
export function Strip({
  tone,
  always = false,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone: StripTone; always?: boolean }) {
  return (
    <div
      style={
        {
          "--strip-bg": `var(--color-tone-${tone}-bg)`,
          "--strip-border": `var(--color-tone-${tone}-border)`,
          ...style,
        } as CSSProperties
      }
      className={cn(
        always
          ? "bg-[var(--strip-bg)] border-[color:var(--strip-border)]"
          : "md:bg-[var(--strip-bg)] md:border-[color:var(--strip-border)]",
        className,
      )}
      {...props}
    />
  );
}
