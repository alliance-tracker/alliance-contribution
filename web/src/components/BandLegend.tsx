import { useTranslation } from "react-i18next";
import type { RankBands } from "@shared/types";
import { cn } from "@/lib/utils";

/** Colour key for the board bands; positions rendered from the configured sizes. */
export function BandLegend({ bands }: { bands: RankBands }) {
  const { t } = useTranslation();
  const items: Array<[string, string]> = [
    ["bg-band-lead", t("bands.leadership")],
    ["bg-band-top", t("bands.top", { n: bands.top })],
    ["bg-band-mid", `${bands.top + 1}–${bands.top + bands.mid}`],
    ["bg-band-rest", `${bands.top + bands.mid + 1}+`],
  ];
  return (
    <div className="no-scrollbar flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[12px] text-muted md:flex-wrap md:justify-end md:gap-4 md:overflow-visible">
      {items.map(([cls, label]) => (
        <span key={label} className="flex flex-none items-center gap-1.5">
          <span className={cn("size-3.5 rounded", cls)} />
          {label}
        </span>
      ))}
    </div>
  );
}
