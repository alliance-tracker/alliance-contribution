import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type JSX } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Check, ClipboardPaste, Clock, Image as ImageIcon, Loader2, Plus, WifiOff, X } from "lucide-react";
import type { ScreenshotKind, ScreenshotUsage } from "../../../shared/types";
import { api, ApiError } from "@/lib/api";
import { formatNumber, localeTag } from "@/lib/format";
import {
  counts,
  etaMs,
  initialQueue,
  meterState,
  nextToRead,
  queueReducer,
  readsLeft,
  type FailReason,
  type QueueItem,
} from "@/lib/screenshot-queue";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type IngestMode = "paste" | "screenshots";
export const INGEST_MODE_STORAGE = "ic_ingest_mode";

const STATUS_KEY = {
  waiting: "screenshots.status.waiting",
  reading: "screenshots.status.reading",
  failed: "screenshots.status.failed",
  not_read: "screenshots.status.not_read",
  retry_wait: "screenshots.status.retry_wait",
} as const;
const REASON_KEY = {
  read_failed: "screenshots.reason.read_failed",
  bad_type: "screenshots.reason.bad_type",
  not_a_screen_event: "screenshots.reason.not_a_screen_event",
  not_a_screen_roster: "screenshots.reason.not_a_screen_roster",
} as const;

function readStoredMode(): IngestMode {
  try {
    return localStorage.getItem(INGEST_MODE_STORAGE) === "paste" ? "paste" : "screenshots";
  } catch {
    return "screenshots";
  }
}

function formatResetTime(iso: string): string {
  return new Intl.DateTimeFormat(localeTag(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function ScreenshotIngest({
  kind,
  unitLabel,
  onLines,
  onModeChange,
  onBatchChange,
  disabled = false,
}: {
  kind: ScreenshotKind;
  unitLabel?: string;
  onLines: (lines: string[]) => void;
  onModeChange: (mode: IngestMode) => void;
  onBatchChange?: (state: { blocking: boolean }) => void;
  disabled?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const [mode, setModeState] = useState<IngestMode>(readStoredMode);
  const [usage, setUsage] = useState<ScreenshotUsage | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [state, dispatch] = useReducer(queueReducer, initialQueue);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef(new Map<string, string>());

  const setMode = useCallback(
    (next: IngestMode) => {
      setModeState(next);
      try {
        localStorage.setItem(INGEST_MODE_STORAGE, next);
      } catch {
        /* storage unavailable — mode just isn't remembered */
      }
    },
    [],
  );

  // Parent learns the initial mode and every change (it hides the paste hint in screenshot mode).
  useEffect(() => onModeChange(mode), [mode, onModeChange]);

  useEffect(() => {
    let cancelled = false;
    api.screenshots
      .usage()
      .then((u) => { if (!cancelled) setUsage(u); })
      .catch(() => { /* meter stays hidden until a read reports usage */ });
    return () => { cancelled = true; };
  }, []);

  const meter = usage ? meterState(usage, exhausted) : "plenty";
  const screenshotsDisabled = disabled || meter === "used_up";

  // Used up forces paste for this open; the stored preference is left alone.
  useEffect(() => {
    if (meter === "used_up" && mode === "screenshots") setModeState("paste");
  }, [meter, mode]);

  // Roster guard: unread or failed screenshots would make members look absent.
  const blocking = state.items.some((i) => i.status === "failed" || i.status === "not_read" || i.status === "retry_wait");
  useEffect(() => onBatchChange?.({ blocking }), [blocking, onBatchChange]);

  // Sequential reader: one in-flight request, driven purely by reducer state.
  useEffect(() => {
    const next = nextToRead(state);
    if (!next) return;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "began", id: next.id });
    const started = Date.now();
    const form = new FormData();
    form.append("kind", kind);
    if (unitLabel) form.append("unitLabel", unitLabel);
    form.append("image", next.file, next.file.name);
    api.screenshots
      .read(form, controller.signal)
      .then((r) => {
        setUsage(r.usage);
        onLines(r.lines); // per file, immediately: a killed mobile tab must not lose read rows
        dispatch({ type: "succeeded", id: next.id, rows: r.rowCount, ms: Date.now() - started });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // cancel already re-labelled the row
        if (err instanceof ApiError) {
          const body = err.body as { usage?: ScreenshotUsage } | undefined;
          if (body?.usage) setUsage(body.usage);
          if (err.status === 429) { setExhausted(true); dispatch({ type: "exhausted" }); return; }
          const reason: FailReason = err.status === 422 ? "not_a_screen" : "read_failed";
          dispatch({ type: "failed", id: next.id, reason });
          return;
        }
        dispatch({ type: "offline" }); // fetch TypeError: no response at all
      });
  }, [state, kind, unitLabel, onLines]);

  const thumb = (item: QueueItem): string => {
    let url = urlsRef.current.get(item.id);
    if (!url) {
      url = URL.createObjectURL(item.file);
      urlsRef.current.set(item.id, url);
    }
    return url;
  };
  useEffect(() => {
    const urls = urlsRef.current;
    return () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    dispatch({ type: "add", files: list });
    dispatch({ type: "start" });
    setShowDetails(false);
  };
  const cancel = () => { abortRef.current?.abort(); dispatch({ type: "cancel" }); };
  const resume = () => { setExhausted(false); dispatch({ type: "resume" }); };

  const c = counts(state);
  const reason = (r: FailReason | undefined) =>
    r === "not_a_screen" ? t(kind === "event" ? REASON_KEY.not_a_screen_event : REASON_KEY.not_a_screen_roster) : r ? t(REASON_KEY[r]) : "";

  const meterLine = useMemo(() => {
    if (!usage) return null;
    const time = formatResetTime(usage.resetsAt);
    if (meter === "used_up") {
      return <Trans i18nKey="screenshots.meter.usedUp" values={{ time }} components={{ 1: <span className="font-semibold text-secondary" /> }} />;
    }
    if (meter === "low") {
      return <Trans i18nKey="screenshots.meter.low" values={{ left: formatNumber(readsLeft(usage)) }} components={{ 1: <span className="font-semibold" /> }} />;
    }
    return (
      <Trans
        i18nKey="screenshots.meter.plenty"
        values={{ used: formatNumber(usage.used), limit: formatNumber(usage.limit), left: formatNumber(readsLeft(usage)) }}
        components={{ 1: <span className="num" />, 2: <span className="num" />, 3: <span className="num" /> }}
      />
    );
  }, [usage, meter]);

  const segment = (value: IngestMode, icon: JSX.Element, label: string, isDisabled: boolean) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      disabled={isDisabled}
      onClick={() => setMode(value)}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[13px] font-semibold transition-colors md:h-[30px] md:flex-none md:px-3 md:text-[12.5px]",
        mode === value ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-secondary",
        isDisabled && "opacity-60",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3.5">
        <div role="tablist" className="flex gap-0.5 rounded-[8px] bg-background p-[3px] md:flex-none">
          {segment("paste", <ClipboardPaste className="size-[15px]" />, t("screenshots.mode.paste"), disabled)}
          {segment("screenshots", <ImageIcon className="size-[15px]" />, t("screenshots.mode.screenshots"), screenshotsDisabled)}
        </div>
        {usage && (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className={cn("flex justify-between gap-2.5 text-[11.5px] leading-snug", meter === "low" ? "text-warn" : "text-muted")}>
              <span>{meterLine}</span>
              <span className="num whitespace-nowrap">{t("screenshots.meter.resets", { time: formatResetTime(usage.resetsAt) })}</span>
            </div>
            <Progress
              value={Math.min(100, (usage.used / usage.limit) * 100)}
              className="h-[3px]"
              indicatorClassName={meter === "low" ? "bg-warn" : meter === "used_up" ? "bg-muted" : "bg-foreground"}
            />
          </div>
        )}
      </div>

      {mode === "screenshots" && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />

          {state.items.length === 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={screenshotsDisabled}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                className={cn(
                  "flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-background text-[14px] font-semibold md:min-h-28 md:flex-col md:gap-1.5 md:text-[13.5px]",
                  dragOver && "border-foreground",
                )}
              >
                <ImageIcon className="size-[17px] text-muted" />
                <span className="md:hidden">{t("screenshots.picker.choose")}</span>
                <span className="hidden md:inline">
                  <Trans i18nKey="screenshots.picker.drop" components={{ 1: <span className="underline" /> }} />
                </span>
                <span className="hidden text-[12px] font-normal text-muted md:inline">
                  {t(kind === "event" ? "screenshots.picker.hintEvent" : "screenshots.picker.hintRoster")}
                </span>
              </button>
              <p className="text-[12px] leading-relaxed text-muted md:hidden">
                {t(kind === "event" ? "screenshots.picker.hintEvent" : "screenshots.picker.hintRoster")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-border">
              {/* Header: one of reading / stopped / exhausted / offline / summary */}
              {state.batch === "reading" && (
                <div className="flex items-center justify-between gap-2.5 px-3.5 py-3">
                  <div className="leading-tight">
                    <div className="text-[13.5px] font-semibold">{t("screenshots.progress.reading", { i: c.done + c.failed + 1, n: c.total })}</div>
                    <div className="num mt-0.5 text-[11.5px] text-muted">{t("screenshots.progress.eta", { s: Math.max(1, Math.round(etaMs(state) / 1000)) })}</div>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={cancel}>{t("screenshots.progress.cancel")}</Button>
                </div>
              )}
              {state.batch === "stopped" && (
                <div className="flex items-center justify-between gap-2.5 px-3.5 py-3">
                  <div className="leading-tight">
                    <div className="text-[13.5px] font-semibold">{t("screenshots.progress.stopped", { i: c.done + c.failed, n: c.total })}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted">{t("screenshots.progress.kept", { count: c.rows })}</div>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={resume}>{t("screenshots.progress.readRest")}</Button>
                </div>
              )}
              {state.batch === "exhausted" && (
                <div className="flex gap-2.5 border-b border-border bg-background p-3.5">
                  <Clock className="mt-0.5 size-4 flex-none text-muted" />
                  <div className="min-w-0 flex-1 leading-snug">
                    <div className="text-[13.5px] font-semibold">{t("screenshots.progress.exhaustedTitle")}</div>
                    <div className="mt-0.5 text-[12px] text-muted">{t("screenshots.progress.exhaustedBody")}</div>
                    <div className="mt-2.5 flex gap-2">
                      <Button type="button" size="sm" onClick={resume}>{t("screenshots.progress.tryAgain")}</Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setMode("paste")}>{t("screenshots.progress.pasteText")}</Button>
                    </div>
                  </div>
                </div>
              )}
              {state.batch === "offline" && (
                <div className="flex items-center justify-between gap-2.5 px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <WifiOff className="size-4 flex-none text-muted" />
                    <div className="leading-tight">
                      <div className="text-[13.5px] font-semibold">{t("screenshots.progress.offlineTitle")}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted">{t("screenshots.progress.offlineBody", { i: c.done + c.failed, n: c.total })}</div>
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={resume}>{t("screenshots.progress.retry")}</Button>
                </div>
              )}
              {state.batch === "done" && (
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <div className="flex">
                    {state.items.slice(0, 3).map((item, idx) => (
                      <img key={item.id} src={thumb(item)} alt="" className={cn("h-9 w-[26px] rounded-[4px] border border-border object-cover", idx > 0 && "-ms-3.5")} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[13.5px] font-semibold">{t("screenshots.progress.summary", { k: c.done, n: c.total, count: c.rows })}</div>
                    {c.failed > 0 && <div className="mt-0.5 text-[11.5px] text-down">{t("screenshots.progress.summaryFailed", { count: c.failed })}</div>}
                  </div>
                  <button type="button" className="text-[12.5px] font-semibold underline" onClick={() => setShowDetails((v) => !v)}>
                    {showDetails ? t("screenshots.progress.hide") : t("screenshots.progress.details")}
                  </button>
                </div>
              )}

              {state.batch === "reading" && <Progress value={((c.done + c.failed) / c.total) * 100} className="h-1 rounded-none" indicatorClassName="bg-foreground" />}
              {state.batch === "stopped" && <Progress value={((c.done + c.failed) / c.total) * 100} className="h-1 rounded-none" indicatorClassName="bg-muted" />}

              {(state.batch !== "done" || showDetails) &&
                state.items.map((item) => (
                  <div key={item.id} className={cn("flex items-center gap-3 border-t border-border/60 px-3.5 py-2.5", item.status === "reading" && "bg-background")}>
                    <img src={thumb(item)} alt="" className={cn("h-11 w-8 flex-none rounded-[5px] border border-border object-cover", item.status === "not_read" && "opacity-60")} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className={cn("num truncate text-[12px] font-medium", item.status === "waiting" || item.status === "not_read" ? "text-muted" : "text-secondary")}>{item.name}</div>
                      {item.status === "failed" && <div className="mt-0.5 text-[11.5px] text-down">{reason(item.reason)}</div>}
                    </div>
                    {item.status === "done" ? (
                      <span className="flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-up"><Check className="size-3.5" />{t("screenshots.status.done", { count: item.rows ?? 0 })}</span>
                    ) : item.status === "reading" ? (
                      <span className="flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold"><Loader2 className="size-3.5 animate-spin" />{t(STATUS_KEY.reading)}</span>
                    ) : item.status === "failed" ? (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-[12px] font-semibold text-down"><X className="size-3.5" />{t(STATUS_KEY.failed)}</span>
                        <button type="button" className="text-[12px] font-semibold underline" onClick={() => dispatch({ type: "remove", id: item.id })}>{t("screenshots.status.remove")}</button>
                      </span>
                    ) : item.status === "not_read" || item.status === "retry_wait" ? (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-[12px] font-medium text-muted">{t(STATUS_KEY[item.status])}</span>
                        <button type="button" className="text-[12px] font-semibold underline" onClick={() => dispatch({ type: "remove", id: item.id })}>{t("screenshots.status.remove")}</button>
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-[12px] font-medium text-muted">{t(STATUS_KEY[item.status])}</span>
                    )}
                  </div>
                ))}
            </div>
          )}

          {state.items.length > 0 && state.batch !== "reading" && (
            <button
              type="button"
              disabled={screenshotsDisabled}
              onClick={() => inputRef.current?.click()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-background text-[13.5px] font-semibold"
            >
              <Plus className="size-[15px]" />
              {t("screenshots.picker.addMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
