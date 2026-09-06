import { useTranslation } from "react-i18next";
import type { TKey } from "@/i18n";
import { cn } from "@/lib/utils";

export type RankingScope = "overall" | "weekly";

const SCOPES: { value: RankingScope; label: TKey }[] = [
  { value: "overall", label: "scope.overall" },
  { value: "weekly", label: "scope.weekly" },
];

export function RankingScopeToggle({
  value,
  onChange,
}: {
  value: RankingScope;
  onChange: (scope: RankingScope) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-[10px] border border-border bg-muted-surface p-1 md:inline-flex md:w-auto">
      {SCOPES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={cn(
            "h-9 rounded-[7px] px-3.5 text-[13px] font-medium transition-colors duration-150 md:h-auto md:py-1.5",
            value === s.value
              ? "bg-surface font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-muted hover:text-foreground active:text-foreground",
          )}
        >
          {t(s.label)}
        </button>
      ))}
    </div>
  );
}
