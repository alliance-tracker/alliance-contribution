import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Link } from "lucide-react";
import type { KvkKey } from "@shared/types";
import { api } from "@/lib/api";
import { writeErrorMessage } from "@/lib/errors";
import { firstFreeColor, KVK_COLORS } from "@/lib/kvk";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";
import { ErrorNote, Field, SHEET, SHEET_FOOT } from "@/components/schedule/parts";

/** New/edit an alliance access key. A successful create switches the dialog to a "revealed" view
 *  showing the plaintext key (the only time it's shown in full besides the keys table) — Save on an
 *  edit just closes. Delete is delegated to the caller (`onDelete`), which owns the confirm dialog. */
export function KeyDialog({
  target,
  usedColors,
  onClose,
  onChanged,
  onCopy,
  onDelete,
}: {
  target: { key: KvkKey | null } | null;
  usedColors: string[];
  onClose: () => void;
  onChanged: (message?: string) => void;
  onCopy: (k: KvkKey, what: "key" | "link") => void;
  onDelete: (k: KvkKey) => void;
}) {
  const { t } = useTranslation();
  const [allianceName, setAllianceName] = useState("");
  const [representative, setRepresentative] = useState("");
  const [color, setColor] = useState("");
  const [revealed, setRevealed] = useState<KvkKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setAllianceName(target.key?.alliance_name ?? "");
    setRepresentative(target.key?.representative ?? "");
    setColor(target.key?.color ?? firstFreeColor(usedColors));
    setRevealed(null);
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const trimmedName = allianceName.trim();
  const trimmedRep = representative.trim();
  const canSave = !busy && trimmedName !== "" && trimmedRep !== "" && color !== "";

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const body = { alliance_name: trimmedName, representative: trimmedRep, color };
    try {
      if (target?.key) {
        await api.kvk.updateKey(target.key.id, body);
        onChanged();
        onClose();
      } else {
        const created = await api.kvk.createKey(body);
        setBusy(false);
        setRevealed(created);
        onChanged();
      }
    } catch (e) {
      setError(writeErrorMessage(e, t, "kvk.needKey", true));
      setBusy(false);
    }
  };

  const title = revealed ? t("kvk.keyDialog.created") : target?.key ? t("kvk.keyDialog.editTitle") : t("kvk.keyDialog.newTitle");
  const sub = revealed ? t("kvk.keyDialog.createdSub") : t("kvk.keyDialog.sub");

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={cn("max-w-[440px]", SHEET)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{sub}</DialogDescription>
        </DialogHeader>

        {revealed ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: revealed.color }} aria-hidden />
              {revealed.alliance_name}
              <span className="font-normal text-muted">· {revealed.representative}</span>
            </div>
            <div dir="ltr" className="break-all rounded-[9px] bg-sidebar px-3.5 py-3 font-mono text-[13.5px] font-medium tracking-[0.02em] text-sidebar-fg">
              {revealed.key}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => onCopy(revealed, "key")}>
                <Copy className="size-4" />
                {t("kvk.keyDialog.copyKey")}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => onCopy(revealed, "link")}>
                <Link className="size-4" />
                {t("kvk.keyDialog.copyLink")}
              </Button>
            </div>
            <p className="text-[12px] text-muted">{t("kvk.keyDialog.help")}</p>
            <Button className="w-full" onClick={onClose}>
              {t("common.actions.done")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3.5">
              {error && <ErrorNote message={error} />}
              <Field label={t("kvk.keyDialog.allianceName")}>
                <Input
                  value={allianceName}
                  onChange={(e) => setAllianceName(e.target.value)}
                  placeholder={t("kvk.keyDialog.allianceNamePlaceholder")}
                  autoFocus
                />
              </Field>
              <Field label={t("kvk.keyDialog.representative")}>
                <Input
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder={t("kvk.keyDialog.representativePlaceholder")}
                />
              </Field>
              <Field label={t("kvk.keyDialog.colour")}>
                <ColorSwatchPicker value={color} onChange={setColor} palette={KVK_COLORS} dimmed={usedColors} />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {target?.key ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-down hover:bg-tone-red-bg"
                  disabled={busy}
                  onClick={() => {
                    const k = target.key!;
                    onClose();
                    onDelete(k);
                  }}
                >
                  {t("kvk.keyDialog.deleteKey")}
                </Button>
              ) : (
                <span />
              )}
              <div className={cn("ms-auto flex items-center gap-2 max-md:w-full", SHEET_FOOT)}>
                <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                  {t("common.actions.cancel")}
                </Button>
                <Button size="sm" onClick={save} disabled={!canSave}>
                  {busy ? t("common.actions.saving") : target?.key ? t("common.actions.save") : t("kvk.keyDialog.createKey")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
