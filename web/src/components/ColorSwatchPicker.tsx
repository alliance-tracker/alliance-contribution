import { useTranslation } from "react-i18next";
import { ACTIVITY_COLORS, type ActivityColor } from "@shared/colors";
import { activitySolidClass } from "@/lib/activity";
import { cn } from "@/lib/utils";

/** Radio group of colour swatches. Defaults to the activity palette (Scoring's two callers); a KvK
 *  caller passes its own `palette` (rendered as a flat swatch fill instead of the activity gradient
 *  class) and `dimmed` (already-taken colours — still selectable, just faded). */
export function ColorSwatchPicker<T extends string = ActivityColor>({
  value,
  onChange,
  palette,
  dimmed,
}: {
  value: string;
  onChange: (color: T) => void;
  palette?: readonly T[];
  dimmed?: readonly string[];
}) {
  const { t } = useTranslation();
  const colors: readonly string[] = palette ?? ACTIVITY_COLORS;
  return (
    <div role="radiogroup" aria-label={t("scoring.colour")} className="flex flex-wrap gap-2">
      {colors.map((c) => {
        const isDimmed = dimmed?.includes(c) ?? false;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            title={isDimmed ? t("kvk.keyDialog.colourTaken") : undefined}
            onClick={() => onChange(c as T)}
            style={palette ? { background: c } : undefined}
            className={cn(
              "size-9 rounded-[9px] ring-offset-2 ring-offset-surface transition-shadow",
              !palette && activitySolidClass(c as ActivityColor),
              value === c ? "ring-2 ring-foreground" : "ring-1 ring-border hover:ring-foreground/40",
              isDimmed && "opacity-35",
            )}
          />
        );
      })}
    </div>
  );
}
