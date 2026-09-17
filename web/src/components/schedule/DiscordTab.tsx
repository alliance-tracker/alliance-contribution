import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, Globe, Hash, Info, Lock, Plus, Trash2, X } from "lucide-react";
import type { DiscordRole, DiscordWebhook, ScheduleLanguages } from "@shared/types";
import type { TKey } from "@/i18n";
import { languageFlag, languageName, parseLanguageInput } from "@/lib/schedule-languages";
import { writeErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorNote } from "./parts";

const SOURCE_NOTE: Record<ScheduleLanguages["source"], TKey> = {
  settings: "schedule.discord.languages.source.settings",
  env: "schedule.discord.languages.source.env",
  default: "schedule.discord.languages.source.default",
};

function CardHead({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-muted-surface text-secondary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-foreground">{title}</div>
        <div className="truncate text-[12px] text-muted">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

export function DiscordTab({
  webhooks,
  roles,
  languages,
  isAdmin,
  onAddChannel,
  onDeleteChannel,
  onAddRole,
  onDeleteRole,
  onSaveLanguages,
}: {
  webhooks: DiscordWebhook[];
  roles: DiscordRole[];
  languages: ScheduleLanguages;
  isAdmin: boolean;
  onAddChannel: () => void;
  onDeleteChannel: (webhook: DiscordWebhook) => void;
  onAddRole: () => void;
  onDeleteRole: (role: DiscordRole) => void;
  onSaveLanguages: (languages: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [langError, setLangError] = useState<string | null>(null);

  const save = (next: string[]) => {
    setLangError(null);
    onSaveLanguages(next).catch((e: unknown) => setLangError(writeErrorMessage(e, t, "schedule.needKey", true)));
  };

  const add = () => {
    const code = parseLanguageInput(draft);
    if (!code) {
      setLangError(t("schedule.discord.languages.unknown", { value: draft.trim() }));
      return;
    }
    setDraft("");
    if (languages.languages.includes(code)) return;
    save([...languages.languages, code]);
  };

  return (
    <div className="grid gap-3.5 md:grid-cols-3 md:items-start">
      <Card className="overflow-hidden">
        <CardHead
          icon={<Hash className="size-[15px]" />}
          title={t("schedule.discord.channels.title")}
          subtitle={t("schedule.discord.channels.subtitle")}
          action={
            isAdmin && (
              <Button variant="primary" size="sm" className="h-7 shrink-0 px-2.5 text-[12px]" onClick={onAddChannel}>
                <Plus className="size-3.5" />
                {t("schedule.discord.add")}
              </Button>
            )
          }
        />
        {webhooks.length === 0 ? (
          <p className="p-4 text-[12.5px] text-muted">{t("schedule.discord.channels.empty")}</p>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id} className="flex items-center gap-2 border-b border-border p-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-foreground">{webhook.name}</span>
                  {webhook.channel_id && (
                    <span className="truncate font-mono text-[10.5px] text-muted">→ {webhook.channel_id}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-[10.5px] text-faint">
                  <span>{t("schedule.discord.channels.id", { id: webhook.webhook_id })}</span>
                  <span>{"•".repeat(16)}{webhook.token_tail}</span>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 hover:bg-down/10 hover:text-down"
                  title={t("schedule.discord.channels.delete")}
                  onClick={() => onDeleteChannel(webhook)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
        <div className="border-t border-border bg-background px-4 py-2.5 text-[11.5px] text-muted">
          {t("schedule.discord.channels.footer")}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHead
          icon={<AtSign className="size-[15px]" />}
          title={t("schedule.discord.roles.title")}
          subtitle={t("schedule.discord.roles.subtitle")}
          action={
            isAdmin && (
              <Button variant="primary" size="sm" className="h-7 shrink-0 px-2.5 text-[12px]" onClick={onAddRole}>
                <Plus className="size-3.5" />
                {t("schedule.discord.add")}
              </Button>
            )
          }
        />
        {roles.length === 0 ? (
          <p className="p-4 text-[12.5px] text-muted">{t("schedule.discord.roles.empty")}</p>
        ) : (
          roles.map((role) => (
            <div key={role.id} className="flex items-center gap-2 border-b border-border p-3.5 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{role.name}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-faint">{role.role_id}</span>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 hover:bg-down/10 hover:text-down"
                  title={t("schedule.discord.roles.delete")}
                  onClick={() => onDeleteRole(role)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHead
          icon={<Globe className="size-[15px]" />}
          title={t("schedule.discord.languages.title")}
          subtitle={t("schedule.discord.languages.subtitle")}
        />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {languages.languages.map((code) => (
              <span
                key={code}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-border bg-surface ps-2.5 pe-1.5 text-[12.5px] text-foreground"
              >
                <span>{languageFlag(code)}</span>
                <span>{languageName(code)}</span>
                <span className="font-mono text-[10.5px] text-faint">{code}</span>
                {code === "en" ? (
                  <Lock className="size-3 text-faint" />
                ) : (
                  isAdmin && (
                    <button
                      type="button"
                      title={t("schedule.discord.languages.remove")}
                      onClick={() => save(languages.languages.filter((c) => c !== code))}
                      className="rounded-[4px] p-0.5 text-faint transition-colors hover:bg-down/10 hover:text-down"
                    >
                      <X className="size-3" />
                    </button>
                  )
                )}
              </span>
            ))}
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                }}
                placeholder={t("schedule.discord.languages.placeholder")}
              />
              <Button variant="secondary" size="md" className="shrink-0" onClick={add} disabled={draft.trim() === ""}>
                {t("schedule.discord.languages.add")}
              </Button>
            </div>
          )}

          {langError && <ErrorNote message={langError} />}

          <p className={cn("flex items-start gap-1.5 text-[11.5px] text-muted")}>
            <Info className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <span>
              {t(SOURCE_NOTE[languages.source])} {t("schedule.discord.languages.note")}
            </span>
          </p>
        </div>
      </Card>
    </div>
  );
}
