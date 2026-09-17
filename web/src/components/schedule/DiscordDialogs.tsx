import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, Hash, Lock } from "lucide-react";
import type { WebhookInput } from "@shared/types";
import { api } from "@/lib/api";
import { writeErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFoot, DialogHead } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorNote, Field, SegToggle, SHEET } from "./parts";

type Mode = "url" | "id";

export function ChannelDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [webhookId, setWebhookId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setMode("url");
    setUrl("");
    setWebhookId("");
    setToken("");
    setBusy(false);
    setError(null);
  }, [open]);

  const canSave =
    !busy &&
    name.trim() !== "" &&
    (mode === "url" ? /webhooks\/\d+\/\S+/.test(url) : webhookId.trim() !== "" && token.trim() !== "");

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const body: WebhookInput =
      mode === "url"
        ? { name: name.trim(), url: url.trim() }
        : { name: name.trim(), webhook_id: webhookId.trim(), token: token.trim() };
    try {
      await api.schedule.addWebhook(body);
      onSaved(name.trim());
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn("max-w-lg", SHEET)}>
        <DialogHead
          icon={Hash}
          tone="blue"
          title={t("schedule.channelDialog.title")}
          description={t("schedule.channelDialog.desc")}
        />

        <div className="flex flex-col gap-4">
          {error && <ErrorNote message={error} />}

          <Field label={t("schedule.channelDialog.name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("schedule.channelDialog.namePlaceholder")}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <SegToggle
              value={mode}
              onChange={setMode}
              className="self-start"
              options={[
                { value: "url", label: t("schedule.channelDialog.modeUrl") },
                { value: "id", label: t("schedule.channelDialog.modeId") },
              ]}
            />
            {mode === "url" ? (
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("schedule.channelDialog.urlPlaceholder")}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("schedule.channelDialog.webhookId")}>
                  <Input
                    value={webhookId}
                    onChange={(e) => setWebhookId(e.target.value)}
                    placeholder={t("schedule.channelDialog.webhookIdPlaceholder")}
                  />
                </Field>
                <Field label={t("schedule.channelDialog.token")}>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>
              </div>
            )}
          </div>

          <p className="flex items-start gap-1.5 rounded-[8px] bg-background p-2.5 text-[11.5px] text-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <span>{t("schedule.channelDialog.lockNote")}</span>
          </p>
        </div>

        <DialogFoot>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave}>
            {busy ? t("common.actions.saving") : t("schedule.channelDialog.submit")}
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}

export function RoleDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setRoleId("");
    setBusy(false);
    setError(null);
  }, [open]);

  const canSave = !busy && name.trim() !== "" && /^\d{17,20}$/.test(roleId.trim());

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const trimmed = name.trim();
    try {
      await api.schedule.addRole({
        name: trimmed.startsWith("@") ? trimmed : `@${trimmed}`,
        role_id: roleId.trim(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, t, "schedule.needKey", true));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn("max-w-md", SHEET)}>
        <DialogHead
          icon={AtSign}
          tone="blue"
          title={t("schedule.roleDialog.title")}
          description={t("schedule.roleDialog.desc")}
        />

        <div className="flex flex-col gap-4">
          {error && <ErrorNote message={error} />}
          <Field label={t("schedule.roleDialog.name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("schedule.roleDialog.namePlaceholder")}
            />
          </Field>
          <Field label={t("schedule.roleDialog.roleId")}>
            <Input
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              placeholder={t("schedule.roleDialog.roleIdPlaceholder")}
            />
          </Field>
        </div>

        <DialogFoot>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave}>
            {busy ? t("common.actions.saving") : t("schedule.roleDialog.submit")}
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}
