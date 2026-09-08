import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ActivityDetail, ActivityType } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { instanceStats } from "@/lib/activity-derive";
import { formatNumber } from "@/lib/format";
import { RankByActivity } from "@/components/RankByActivity";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="num text-[18px] font-bold leading-none">{value}</span>
    </div>
  );
}

export function Activity() {
  const { t } = useTranslation();
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();

  const activitiesState = useApi<ActivityType[]>(() => api.activityTypes.list({ active: true }), []);
  const activities = useMemo(
    () => (activitiesState.data ?? []).slice().sort((a, b) => a.sort - b.sort),
    [activitiesState.data],
  );

  // 404 → data null with no error: the page shows "unknown" but keeps the selector usable.
  const detailState = useApi<ActivityDetail | null>(
    () =>
      key
        ? api.activities.detail(key).catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 404) return null;
            throw e;
          })
        : Promise.resolve(null),
    [key],
  );

  if (!key && activities.length > 0) {
    return <Navigate to={`/activities/${activities[0].key}`} replace />;
  }

  const error = firstError(activitiesState, detailState);
  const busy = activitiesState.loading || detailState.loading;
  const detail = detailState.data;
  const unit = detail?.activity.unit_label ?? t("common.value");
  const instances = detail ? instanceStats(detail) : [];
  const totalParticipants = detail?.events.reduce((s, e) => s + e.participants, 0) ?? 0;
  const totalValue = detail?.events.reduce((s, e) => s + e.total_value, 0) ?? 0;
  const totalPoints = detail?.events.reduce((s, e) => s + e.total_points, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RankByActivity
          value={key ?? ""}
          onChange={(k) => navigate(`/activities/${k}`)}
          activities={activities}
          label={t("common.activity")}
          allowAll={false}
        />
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : busy ? (
        <LoadingState />
      ) : !detail ? (
        <EmptyState message={t("activity.unknown", { key: key ?? "" })} />
      ) : detail.events.length === 0 ? (
        <EmptyState message={t("activity.empty")} />
      ) : (
        <>
          <Card className="flex flex-wrap gap-x-8 gap-y-3 p-3 md:p-[18px]">
            <Stat label={t("attendance.eventDays", { count: detail.event_days })} value={formatNumber(detail.event_days)} />
            <Stat label={t("activity.participants")} value={formatNumber(totalParticipants)} />
            <Stat label={`${t("activity.total")} ${unit}`} value={formatNumber(totalValue)} />
            <Stat label={t("common.points")} value={formatNumber(totalPoints)} />
          </Card>

          {detail.activity.max_instance > 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {instances.map((s) => (
                <Card key={s.instance} className="flex flex-col gap-3 p-3 md:p-[18px]">
                  <div className="text-[14px] font-semibold">{t("activity.instance", { n: s.instance })}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label={t("activity.events", { count: s.events })} value={formatNumber(s.events)} />
                    <Stat label={t("activity.avgParticipants")} value={formatNumber(Math.round(s.avg_participants))} />
                    <Stat label={`${t("activity.avg")} ${unit}`} value={formatNumber(Math.round(s.avg_value))} />
                    <Stat label={`${t("activity.total")} ${unit}`} value={formatNumber(s.total_value)} />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Task 4: value-over-time chart */}
          {/* Task 5: by-day and by-member tables */}
        </>
      )}
    </div>
  );
}
