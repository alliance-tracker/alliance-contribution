import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertContent } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Dismissible success banner (matches roster/aliases note style). */
export function SuccessNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert variant="success">
      <CheckCircle2 />
      <AlertContent className="flex-row items-center justify-between gap-3">
        <span>{message}</span>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t("common.actions.dismiss")}
        </Button>
      </AlertContent>
    </Alert>
  );
}
