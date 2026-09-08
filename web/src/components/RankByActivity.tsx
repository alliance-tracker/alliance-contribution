import { useTranslation } from "react-i18next";
import type { ActivityType } from "@shared/types";
import { cn } from "@/lib/utils";
import { activitySolidClass } from "@/lib/activity";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RankByActivity({
  value,
  onChange,
  activities,
  label,
  allowAll = true,
}: {
  value: string; // "all" | activity.key
  onChange: (value: string) => void;
  activities: ActivityType[];
  label?: string; // Attendance filters rather than ranks — same control, different verb.
  allowAll?: boolean; // Activity page: the key IS the page, so there is no "all".
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 max-md:h-10 max-md:rounded-[8px] max-md:border max-md:border-border max-md:bg-surface max-md:ps-3">
      <span className="shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">
        {label ?? t("rankBy.label")}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-52 max-md:h-full max-md:w-auto max-md:flex-1 max-md:border-0 max-md:bg-transparent max-md:ps-1 max-md:hover:bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowAll && (
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-badge-slate-fg" />
                {t("rankBy.all")}
              </span>
            </SelectItem>
          )}
          {activities.map((a) => (
            <SelectItem key={a.key} value={a.key}>
              <span className="flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", activitySolidClass(a.color))} />
                {a.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
