import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { writeErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Below `md` a schedule dialog sits as a bottom sheet (design 2b–2e); from `md` up it keeps the
 * centred card. left/right rather than logical insets on purpose: the override is symmetric and has
 * to beat the base `left-1/2`, which is physical too.
 */
export const SHEET =
  "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:translate-x-0 max-md:translate-y-0 max-md:max-w-none max-md:rounded-b-none max-md:max-h-[92dvh] max-md:overflow-y-auto";

/** Uppercase mono micro-label above a field, sentence-case hint beside it. */
export function Field({
  label,
  hint,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-faint">
          {label}
          {hint && (
            <span className="ms-1 font-sans font-medium normal-case tracking-normal text-muted">{hint}</span>
          )}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

/** Pill segmented control — the design's `seg`, used for tabs, day/week, before/after, URL/ID. */
export function SegToggle<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-[8px] bg-muted-surface p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-semibold transition-colors duration-150",
            option.value === value
              ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.07)]"
              : "text-faint hover:text-secondary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Inline error strip for a write failure (the page-level ErrorState carries a reload button). */
export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-down/20 bg-down/5 p-3 text-[12.5px] text-down">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
    </div>
  );
}

export type ConfirmTarget = {
  /** Already-translated noun for the title ("event", "channel", …). */
  kind: string;
  /** The thing's own name, shown in bold. */
  label: string;
  /** Sentence completing the bold label. */
  body: string;
  run: () => Promise<void>;
};

/** Shared destructive confirm — one dialog for events, reminders, messages, channels and roles. */
export function ConfirmDialog({ target, onClose }: { target: ConfirmTarget | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [target]);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await target.run();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-sm", SHEET)}>
        <DialogHeader className="mb-4 flex-row items-start gap-3 pe-7">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-down/10 text-down">
            <TriangleAlert className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{t("schedule.confirm.title", { kind: target?.kind ?? "" })}</DialogTitle>
            <DialogDescription>
              <b className="font-semibold text-foreground">{target?.label}</b> {target?.body}
            </DialogDescription>
          </div>
        </DialogHeader>
        {error && <ErrorNote message={error} />}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button variant="danger" size="sm" onClick={confirm} disabled={busy}>
            {busy ? t("common.actions.deleting") : t("common.actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dark pill, bottom centre, 2.6 s — the only feedback a Test post or a new channel gets. */
export function Toast({ toast }: { toast: { title: string; sub: string } | null }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-[10px] bg-foreground px-4 py-2.5 text-center shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <div className="text-[13px] font-semibold text-accent-foreground">{toast.title}</div>
      <div className="text-[11.5px] text-accent-foreground/70">{toast.sub}</div>
    </div>
  );
}
