import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import type { KvkAlliance, KvkAppointmentRow, KvkBoardAppointment } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { writeErrorMessage } from "@/lib/errors";
import { DAYS, dayIso, otherSlotsFor, slotLabel, type KvkSlotRef } from "@/lib/kvk";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorNote, Field, SHEET, SHEET_FOOT } from "@/components/schedule/parts";

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

/** Appoint / edit / remove a single slot. Handles both roles: admin picks any alliance from
 *  `alliances`; a p3 key holder gets `lockedKeyId` and a locked chip instead (its `key_id` is never
 *  sent — the server always books/edits under the caller's own key in that case). */
export function SlotDialog({
  target,
  alliances,
  appointments,
  startDate,
  lockedKeyId,
  onClose,
  onSaved,
  onConflict,
}: {
  target: { ref: KvkSlotRef; appt: KvkAppointmentRow | null } | null;
  alliances: KvkAlliance[];
  appointments: KvkBoardAppointment[];
  startDate: string | null;
  lockedKeyId: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onConflict: (reason: "conflict" | "changed") => void;
}) {
  const { t } = useTranslation();
  const appt = target?.appt ?? null;
  const ref = target?.ref ?? null;
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [keyId, setKeyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setPlayerId(target.appt?.player_id ?? "");
    setPlayerName(target.appt?.player_name ?? "");
    setKeyId(lockedKeyId ?? target.appt?.key_id ?? alliances[0]?.id ?? null);
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const trimmedId = playerId.trim();
  const trimmedName = playerName.trim();
  const canSave = !busy && trimmedId !== "" && trimmedName !== "" && keyId !== null;
  const duplicateCount = ref ? otherSlotsFor(appointments, trimmedId, ref) : 0;

  const finish = (e: unknown): void => {
    if (e instanceof ApiError && e.status === 409) {
      onConflict("conflict");
      onClose();
      return;
    }
    // A holder's 404/403 means the row changed hands (or was freed) under them: same refresh as a
    // conflict, just with neutral wording since nothing was actually contested.
    if (e instanceof ApiError && lockedKeyId !== null && (e.status === 404 || e.status === 403)) {
      onConflict("changed");
      onClose();
      return;
    }
    setError(writeErrorMessage(e, t, lockedKeyId !== null ? "kvk.holder.closedError" : "kvk.needKey", true));
    setBusy(false);
  };

  const save = async () => {
    if (!canSave || !ref) return;
    setBusy(true);
    setError(null);
    try {
      if (appt) {
        await api.kvk.updateAppointment(ref, {
          player_id: trimmedId,
          player_name: trimmedName,
          ...(lockedKeyId === null ? { key_id: keyId! } : {}),
        });
        onSaved(t("kvk.toast.updated", { name: trimmedName }));
      } else {
        await api.kvk.appoint({ ...ref, player_id: trimmedId, player_name: trimmedName, key_id: keyId! });
        onSaved(t("kvk.toast.appointed", { name: trimmedName }));
      }
      onClose();
    } catch (e) {
      finish(e);
    }
  };

  const remove = async () => {
    if (!ref) return;
    setBusy(true);
    setError(null);
    try {
      await api.kvk.deleteAppointment(ref);
      onSaved(t("kvk.toast.freed"));
      onClose();
    } catch (e) {
      finish(e);
    }
  };

  const theme = ref ? DAYS[ref.day - 1]!.theme : null;
  const dateIso = ref && startDate ? dayIso(startDate, ref.day) : null;
  const { start, end } = ref ? slotLabel(ref.slot) : { start: "", end: "" };
  const positionName = ref ? t(`kvk.positions.${ref.position}.name` as const) : "";
  const lockedAlliance = lockedKeyId !== null ? (alliances.find((a) => a.id === lockedKeyId) ?? null) : null;
  const createdByAlliance = appt ? (alliances.find((a) => a.id === appt.key_id)?.alliance_name ?? t("kvk.deletedKey")) : "";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={cn("max-w-[440px]", SHEET)}>
        <DialogHeader>
          <DialogTitle>
            {appt ? t("kvk.slot.edit", { position: positionName }) : t("kvk.slot.appoint", { position: positionName })}
          </DialogTitle>
          {ref && (
            <p className="font-mono text-[12px] font-medium text-muted">
              <span className="uppercase">{t("kvk.grid.day", { n: ref.day })}</span>
              {" · "}
              {theme && <span className="uppercase">{t(`kvk.days.${theme}` as const)}</span>}
              {" · "}
              {dateIso && formatDate(dateIso, DATE_OPTS)}
              {" · "}
              <span dir="ltr">
                {start}–{end}
              </span>{" "}
              {t("kvk.grid.utc")}
            </p>
          )}
          {ref && (
            <p className="text-[12.5px] text-secondary">
              <Trans
                i18nKey={`kvk.positions.${ref.position}.boosts` as const}
                components={{
                  1: <b className="font-semibold text-foreground" />,
                  2: <b className="font-semibold text-foreground" />,
                }}
              />
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          {error && <ErrorNote message={error} />}

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("kvk.slot.playerId")}>
              <Input
                dir="ltr"
                inputMode="numeric"
                maxLength={20}
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value.replace(/\D/g, ""))}
                placeholder={t("kvk.slot.playerIdPlaceholder")}
              />
            </Field>
            <Field label={t("kvk.slot.playerName")}>
              <Input
                value={playerName}
                maxLength={40}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t("kvk.slot.playerNamePlaceholder")}
              />
            </Field>
          </div>

          <Field label={t("kvk.slot.alliance")}>
            {lockedKeyId !== null ? (
              <span className="inline-flex h-[34px] w-fit items-center gap-2 rounded-[8px] border border-border bg-muted-surface px-2.5 text-[12.5px] font-semibold text-foreground">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: lockedAlliance?.color }} aria-hidden />
                {lockedAlliance?.alliance_name}
                <Lock className="size-[13px] text-faint" aria-hidden />
              </span>
            ) : alliances.length === 0 ? (
              <p className="text-[12.5px] text-warn">{t("kvk.slot.noKeys")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {alliances.map((a) => {
                  const selected = keyId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setKeyId(a.id)}
                      className={cn(
                        "flex h-[34px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] font-semibold transition-colors duration-150",
                        selected ? "text-foreground" : "border-border bg-surface text-muted hover:text-foreground",
                      )}
                      style={selected ? { background: `${a.color}1a`, borderColor: a.color } : undefined}
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                      {a.alliance_name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>

          {duplicateCount > 0 && (
            <p className="rounded-[8px] bg-muted-surface px-[11px] py-2 text-[12.5px] text-secondary">
              {t("kvk.slot.duplicate", { count: duplicateCount, name: trimmedName })}
            </p>
          )}

          {appt && (
            <p className="text-[12px] text-faint">
              {appt.created_by === "admin" ? t("kvk.slot.createdByAdmin") : t("kvk.slot.createdBy", { rep: appt.created_by, alliance: createdByAlliance })}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {appt ? (
            <Button type="button" variant="ghost" size="sm" className="text-down hover:bg-tone-red-bg" onClick={remove} disabled={busy}>
              {t("kvk.slot.remove")}
            </Button>
          ) : (
            <span />
          )}
          <div className={cn("ms-auto flex items-center gap-2 max-md:w-full", SHEET_FOOT)}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              {t("common.actions.cancel")}
            </Button>
            <Button size="sm" onClick={save} disabled={!canSave}>
              {busy ? t("common.actions.saving") : appt ? t("common.actions.save") : t("kvk.slot.appointBtn")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
