import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, MessageSquare } from "lucide-react";
import { TEMPLATE_PLACEHOLDERS, type MessageTemplate } from "@shared/types";
import { api } from "@/lib/api";
import { writeErrorMessage } from "@/lib/errors";
import type { TKey } from "@/i18n";
import { languageFlag, languageName } from "@/lib/schedule-languages";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFoot, DialogHead } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, Field, SHEET } from "./parts";

const CHIP_TITLE: Record<string, TKey> = {
  "{event}": "schedule.messageDialog.chipEvent",
  "{time}": "schedule.messageDialog.chipTime",
  "{end}": "schedule.messageDialog.chipEnd",
};

export function MessageDialog({
  target,
  languages,
  onClose,
  onSaved,
}: {
  target: { template: MessageTemplate | null } | null;
  languages: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const template = target?.template ?? null;
  const [name, setName] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which textarea a placeholder chip drops into — the last one that had focus, English by default.
  const focused = useRef("en");

  useEffect(() => {
    if (!target) return;
    setName(template?.name ?? "");
    setTexts({ ...(template?.texts ?? {}) });
    focused.current = "en";
    setBusy(false);
    setTranslating(false);
    setError(null);
  }, [target, template]);

  const canSave = !busy && !translating && name.trim() !== "" && (texts.en ?? "").trim() !== "";

  const insert = (placeholder: string) => {
    const code = focused.current;
    setTexts((prev) => ({ ...prev, [code]: `${(prev[code] ?? "").replace(/\s+$/, "")} ${placeholder}`.trim() }));
  };

  /** Save first, then translate: the Worker translates the stored `en`, not what is on screen. */
  const translate = async () => {
    if (!template) return;
    setTranslating(true);
    setError(null);
    try {
      await api.schedule.updateTemplate(template.id, { name: name.trim(), texts });
      const filled = await api.schedule.translateTemplate(template.id);
      setTexts({ ...filled.texts });
      onSaved();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
    }
    setTranslating(false);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      if (template) await api.schedule.updateTemplate(template.id, { name: name.trim(), texts });
      else await api.schedule.addTemplate({ name: name.trim(), texts });
      onSaved();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
      setBusy(false);
    }
  };

  const sample = (text: string) =>
    text
      .replaceAll("{event}", t("schedule.messageDialog.previewEvent"))
      .replaceAll("{time}", t("schedule.messageDialog.previewTime"))
      .replaceAll("{end}", t("schedule.messageDialog.previewEnd"));

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-[600px] md:max-h-[88vh] md:overflow-y-auto", SHEET)}>
        <DialogHead
          icon={MessageSquare}
          tone="blue"
          title={template ? t("schedule.messageDialog.edit") : t("schedule.messageDialog.add")}
          description={t("schedule.messageDialog.desc")}
        />

        <div className="flex flex-col gap-4">
          {error && <ErrorNote message={error} />}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("schedule.messageDialog.name")}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("schedule.messageDialog.namePlaceholder")}
              />
            </Field>
            <Field label={t("schedule.messageDialog.insert")}>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                  <button
                    key={placeholder}
                    type="button"
                    title={t(CHIP_TITLE[placeholder])}
                    onClick={() => insert(placeholder)}
                    className="h-7 rounded-[6px] bg-muted-surface px-2 font-mono text-[11.5px] font-semibold text-secondary transition-colors hover:bg-border hover:text-foreground"
                  >
                    {placeholder}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {languages.map((code) => {
            const empty = code !== "en" && (texts[code] ?? "").trim() === "";
            return (
              <div key={code} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-faint">
                    <span className="text-[13px]">{languageFlag(code)}</span>
                    {languageName(code)} · {code}
                    {code === "en" && (
                      <span className="font-sans font-medium normal-case tracking-normal text-muted">
                        {t("schedule.messageDialog.source")}
                      </span>
                    )}
                    {empty && (
                      <span className="rounded-[5px] bg-warn/10 px-1.5 py-0.5 font-sans font-semibold normal-case tracking-normal text-warn">
                        {t("schedule.messages.notTranslated")}
                      </span>
                    )}
                  </span>
                  {code === "en" && template && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 border-tone-blue-border bg-tone-blue-bg px-2 text-[12px] text-tone-blue-fg hover:bg-tone-blue-bg hover:brightness-95"
                      onClick={translate}
                      disabled={translating || busy}
                    >
                      <Languages className="size-3.5" />
                      {translating
                        ? t("schedule.messageDialog.translating")
                        : t("schedule.messageDialog.translate")}
                    </Button>
                  )}
                </div>
                <Textarea
                  rows={2}
                  value={texts[code] ?? ""}
                  onFocus={() => {
                    focused.current = code;
                  }}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [code]: e.target.value }))}
                  placeholder={
                    code === "en"
                      ? t("schedule.messageDialog.enPlaceholder")
                      : t("schedule.messageDialog.trPlaceholder")
                  }
                />
              </div>
            );
          })}

          <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-background p-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
              {t("schedule.messageDialog.preview")}
            </span>
            {languages.map((code) => {
              const text = (texts[code] ?? "").trim();
              return (
                <div key={code} className={cn("text-[12.5px]", text ? "text-secondary" : "italic text-faint")}>
                  <span className="me-1">{languageFlag(code)}</span>
                  {text ? sample(text) : t("schedule.messageDialog.previewMissing")}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFoot>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave}>
            {busy
              ? t("common.actions.saving")
              : template
                ? t("common.actions.saveChanges")
                : t("schedule.messageDialog.add")}
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}
