import { Trans, useTranslation } from "react-i18next";
import { POSITIONS } from "@/lib/kvk";

/** The two position cards above the schedule grid — name + boosts, one bold number (or two) per line. */
export function PositionStrip() {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2.5">
      {POSITIONS.map((position) => (
        <div key={position} className="rounded-[10px] border border-border bg-background px-3.5 py-[11px]">
          <p className="text-[13px] font-semibold text-foreground">
            {t(`kvk.positions.${position}.name` as const)}
          </p>
          <p className="text-[12.5px] text-secondary">
            <Trans
              i18nKey={`kvk.positions.${position}.boosts` as const}
              components={{
                1: <b className="font-semibold text-foreground" />,
                2: <b className="font-semibold text-foreground" />,
              }}
            />
          </p>
        </div>
      ))}
    </div>
  );
}
