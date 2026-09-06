import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Top-bar control to swap the API key (persisted to localStorage), e.g. viewer -> manager for writes. */
export function ApiKeyDialog() {
  const { t } = useTranslation();
  const { apiKey, setApiKey } = useApiKey();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const save = () => {
    setApiKey(draft);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(apiKey);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="relative max-md:size-9 max-md:p-0"
          aria-label={apiKey ? t("apiKey.set") : t("apiKey.unset")}
        >
          <KeyRound />
          <span className="hidden md:inline">{apiKey ? t("apiKey.set") : t("apiKey.unset")}</span>
          {/* Status dot: inline after the label on desktop, pinned to the top-end corner on a phone. */}
          <span
            className={cn(
              "size-1.5 rounded-full max-md:absolute max-md:end-1.5 max-md:top-1.5",
              apiKey ? "bg-up" : "bg-faint",
            )}
            aria-hidden
          />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("apiKey.title")}</DialogTitle>
          <DialogDescription>{t("apiKey.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Input
            type="password"
            placeholder={t("apiKey.placeholder")}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <div className="flex items-center justify-between">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                {t("common.actions.cancel")}
              </Button>
            </DialogClose>
            <Button size="sm" onClick={save}>
              {t("apiKey.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
