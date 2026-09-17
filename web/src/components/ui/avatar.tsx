import * as React from "react";
import { cn } from "@/lib/utils";

/** Two-letter initials from a governor name, stripped of tags/symbols. */
export function initials(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9]/g, "");
  return (clean.slice(0, 2) || "??").toUpperCase();
}

type AvatarProps = {
  name: string;
  size?: number;
  tone?: "light" | "dark" | "risk";
  className?: string;
  style?: React.CSSProperties;
};

/** Circular initials avatar. Light = muted-surface chip on border; dark = solid foreground; risk = red tint. */
export function Avatar({ name, size = 30, tone = "light", className, style }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        tone === "dark"
          ? "bg-foreground text-accent-foreground"
          : tone === "risk"
            ? "bg-risk-bg text-risk-fg"
            : "border border-border bg-muted-surface text-secondary",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), ...style }}
    >
      {initials(name)}
    </div>
  );
}
