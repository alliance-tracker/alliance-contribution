import { useTranslation } from "react-i18next";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import type { MessageTemplate } from "@shared/types";
import { languageFlag } from "@/lib/schedule-languages";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile, Strip } from "@/components/ui/tone";
import { EmptyState } from "@/components/States";

export function MessagesTab({
  templates,
  languages,
  languageNames,
  isAdmin,
  onEdit,
  onDelete,
}: {
  templates: MessageTemplate[];
  languages: string[];
  /** "English, Spanish, French" — Discord-side language names, deliberately untranslated. */
  languageNames: string;
  isAdmin: boolean;
  onEdit: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden">
      <Strip tone="blue" always className="flex items-center gap-3 border-b p-4">
        <IconTile icon={MessageSquare} tone="blue" always />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-foreground">{t("schedule.messages.title")}</div>
          <div className="text-[12px] text-muted">
            {t("schedule.messages.subtitle", { langs: languageNames })}
          </div>
        </div>
      </Strip>

      {templates.length === 0 ? (
        <EmptyState message={t("schedule.messages.empty")} />
      ) : (
        templates.map((template) => {
          const missing = languages.some((code) => !(template.texts[code] ?? "").trim());
          return (
            <div
              key={template.id}
              className="flex flex-col gap-2 border-b border-border p-3.5 last:border-b-0 md:flex-row md:items-center md:gap-4"
            >
              <div className="flex min-w-0 shrink-0 items-center gap-2 md:w-[150px]">
                <span className="truncate text-[13.5px] font-semibold text-foreground">{template.name}</span>
                {template.is_default && (
                  <span className="shrink-0 rounded-[4px] bg-muted-surface px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted">
                    {t("schedule.messages.default")}
                  </span>
                )}
              </div>

              <p className="min-w-0 flex-1 truncate text-[12.5px] text-secondary">
                {template.texts.en ?? ""}
              </p>

              <div className="flex flex-wrap items-center gap-1">
                {languages
                  .filter((code) => (template.texts[code] ?? "").trim())
                  .map((code) => (
                    <span
                      key={code}
                      title={template.texts[code]}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-border bg-muted-surface px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-secondary"
                    >
                      {languageFlag(code)} {code.toUpperCase()}
                    </span>
                  ))}
                {missing && (
                  <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-warn">
                    <span className="size-1.5 rounded-full bg-warn" />
                    {t("schedule.messages.notTranslated")}
                  </span>
                )}
              </div>

              {isAdmin && (
                <div className="flex shrink-0 items-center gap-1 md:justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title={t("schedule.messages.edit")}
                    onClick={() => onEdit(template)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("size-7 hover:bg-down/10 hover:text-down", template.is_default && "invisible")}
                    title={t("schedule.messages.delete")}
                    disabled={template.is_default}
                    onClick={() => onDelete(template)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}

      <div className="border-t border-border bg-background px-4 py-2.5 text-[11.5px] text-muted">
        {t("schedule.messages.footer")}
      </div>
    </Card>
  );
}
