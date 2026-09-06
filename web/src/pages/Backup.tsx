import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Download, Upload, CheckCircle2, TriangleAlert } from "lucide-react";
import { api, ApiError, type ImportResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertContent } from "@/components/ui/alert";
import { ErrorState } from "@/components/States";

type ParsedBackup = {
  exported_at?: string;
  tables?: Record<string, unknown[]>;
};

/** Map a thrown error to a clear, actionable message. 401 → API-key hint; 403 → admin-key hint. */
function writeErrorMessage(e: unknown, t: TFunction): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return t("backup.needKey");
    if (e.status === 403) return t("common.errors.adminKey");
    return e.message;
  }
  return e instanceof Error ? e.message : t("common.errors.generic");
}

/**
 * Trigger a browser download of `text` as `filename`. The anchor has to be in the document and the
 * object URL has to outlive the click: Firefox and Safari cancel a download started from a detached
 * anchor or from a URL revoked in the same tick.
 */
function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Post-import result: recompute success banner, or a warning when rows loaded but recompute failed. */
function ImportResultPanel({ result }: { result: ImportResult }) {
  const { t } = useTranslation();
  const counts = Object.entries(result.imported)
    .map(([table, n]) => `${table}: ${n}`)
    .join(", ");

  if (result.recomputed) {
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertContent>{t("backup.imported", { counts })}</AlertContent>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertContent>
        <AlertTitle>{t("backup.importedNoRecompute", { counts })}</AlertTitle>
        <span>{t("backup.retryHint", { error: result.error ?? t("backup.unknownError") })}</span>
      </AlertContent>
    </Alert>
  );
}

export function Backup() {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);

  async function handleExport() {
    setError(null);
    setBusy(true);
    try {
      const text = await api.admin.export();
      downloadText(`alliance-backup-${new Date().toISOString().slice(0, 10)}.json`, text);
    } catch (e) {
      setError(writeErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const text = await file.text();
      setPending(JSON.parse(text) as ParsedBackup);
    } catch {
      setError(t("backup.invalidJson"));
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      // Safety net: download the CURRENT database before overwriting it.
      const current = await api.admin.export();
      downloadText(`alliance-backup-before-restore-${new Date().toISOString().slice(0, 10)}.json`, current);

      const res = await api.admin.import(pending);
      setResult(res);
      setPending(null);
    } catch (e) {
      setError(writeErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  const counts = pending?.tables
    ? Object.entries(pending.tables)
        .map(([table, rows]) => `${table}: ${Array.isArray(rows) ? rows.length : 0}`)
        .join(", ")
    : "";

  return (
    <div className="flex flex-col gap-3.5 md:gap-6">
      {error && <ErrorState message={error} />}
      {result && <ImportResultPanel result={result} />}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13.5px] font-semibold text-foreground">{t("backup.exportTitle")}</span>
          <span className="text-[12px] text-muted">{t("backup.exportDesc")}</span>
        </div>
        <div>
          <Button size="sm" className="h-11 w-full md:h-8 md:w-auto" onClick={handleExport} disabled={busy}>
            <Download />
            {t("backup.exportButton")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13.5px] font-semibold text-foreground">{t("backup.importTitle")}</span>
          <span className="text-[12px] text-muted">{t("backup.importDesc")}</span>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-11 w-full md:h-8 md:w-auto"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <Upload />
            {t("backup.chooseFile")}
          </Button>
        </div>
      </Card>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("backup.replaceTitle")}</DialogTitle>
            <DialogDescription>
              {t("backup.replaceDesc", { date: pending?.exported_at ?? t("backup.unknownDate"), counts })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={busy}>
              {t("common.actions.cancel")}
            </Button>
            <Button variant="danger" size="sm" onClick={confirmImport} disabled={busy}>
              {busy ? t("backup.restoring") : t("backup.restore")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
