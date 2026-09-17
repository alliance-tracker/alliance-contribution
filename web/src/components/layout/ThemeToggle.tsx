import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

// Single button flipping light <-> dark in one click.
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={dark ? t("theme.dark") : t("theme.light")}
      aria-label={dark ? t("theme.switchToLight") : t("theme.switchToDark")}
    >
      {dark ? <Moon /> : <Sun />}
    </Button>
  );
}
