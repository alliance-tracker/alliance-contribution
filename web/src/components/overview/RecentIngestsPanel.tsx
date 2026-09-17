import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ActivityType, EventListRow } from "@shared/types";
import { DEFAULT_ACTIVITY_COLOR } from "@shared/colors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTile, Strip } from "@/components/ui/tone";
import { EmptyState } from "@/components/States";
import { activityBadgeClass } from "@/lib/activity";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The newest event ingests. `rows` and `unmapped` are aggregated by the events endpoint; the
 * activity name and colour are joined here from the activity-type list rather than denormalised
 * into the event payload.
 */
export function RecentIngestsPanel({
  events,
  activities,
  canManage,
}: {
  events: EventListRow[];
  activities: ActivityType[];
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const byId = new Map(activities.map((a) => [a.id, a]));

  return (
    <Card className="overflow-hidden">
      <Strip
        tone="blue"
        className="flex items-center justify-between gap-4 px-4 pt-4 md:border-b md:px-[18px] md:py-[13px]"
      >
        <div className="flex min-w-0 items-center gap-[11px]">
          <IconTile icon={Upload} tone="blue" />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold">{t("overview.ingests.title")}</h2>
            <p className="mt-0.5 text-[12px] text-muted">{t("overview.ingests.subtitle")}</p>
          </div>
        </div>
        {canManage && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-[7px] bg-muted-surface hover:bg-border"
          >
            <Link to="/admin/events">{t("overview.ingests.viewAll")}</Link>
          </Button>
        )}
      </Strip>
      <div className="px-4 pb-4 md:p-0">
        {events.length === 0 ? (
          <EmptyState message={t("overview.ingests.empty")} />
        ) : (
          <>
            <ul className="mt-3 flex flex-col md:hidden">
              {events.map((event) => {
                const activity = byId.get(event.activity_type_id);
                return (
                  <li key={event.id} className="flex items-center gap-2.5 border-t border-border py-2.5 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("whitespace-nowrap", activityBadgeClass(activity?.color ?? DEFAULT_ACTIVITY_COLOR))}>
                          {activity?.name ?? "—"}
                        </Badge>
                        <span className="num text-[12px] text-muted">#{event.instance}</span>
                      </div>
                      <div className="num mt-1 text-[12px] text-muted">
                        {event.date} · {t("events.rowCount", { count: event.rows })}
                      </div>
                    </div>
                    {event.unmapped > 0 ? (
                      <span className="num rounded-[4px] bg-warn/10 px-1.5 py-0.5 text-[12px] font-semibold text-warn">
                        {event.unmapped}
                      </span>
                    ) : (
                      <span className="num text-[12px] text-muted">0</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.activity")}</TableHead>
                    <TableHead>{t("overview.ingests.instance")}</TableHead>
                    <TableHead className="text-end">{t("overview.ingests.rows")}</TableHead>
                    <TableHead className="text-end">{t("overview.ingests.unmapped")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const activity = byId.get(event.activity_type_id);
                    return (
                      <TableRow key={event.id}>
                        <TableCell className="num whitespace-nowrap">{event.date}</TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "whitespace-nowrap",
                              activityBadgeClass(activity?.color ?? DEFAULT_ACTIVITY_COLOR),
                            )}
                          >
                            {activity?.name ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="num">#{event.instance}</TableCell>
                        <TableCell className="num text-end">{event.rows}</TableCell>
                        <TableCell className="num text-end">
                          {event.unmapped > 0 ? (
                            <span className="rounded-[4px] bg-warn/10 px-1.5 py-0.5 font-semibold text-warn">
                              {event.unmapped}
                            </span>
                          ) : (
                            <span className="text-muted">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
