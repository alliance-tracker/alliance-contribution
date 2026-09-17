import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { ApiKeyContext, type Role } from "@/lib/apiKey";
import { readApiKey, writeApiKey } from "@/lib/apiKey";

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>(() => readApiKey());
  const [role, setRole] = useState<Role>(null);
  const [scheduler, setScheduler] = useState(false);
  const [checking, setChecking] = useState<boolean>(() => readApiKey() !== "");

  useEffect(() => {
    if (!apiKey) {
      setRole(null);
      setScheduler(false);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    api
      .authMe()
      .then((res) => {
        if (cancelled) return;
        setRole(res.role);
        setScheduler(res.scheduler);
      })
      .catch(() => {
        if (cancelled) return;
        setRole(null);
        setScheduler(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const setApiKey = (key: string) => {
    writeApiKey(key);
    setApiKeyState(readApiKey());
  };

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey, role, scheduler, checking }}>
      {children}
    </ApiKeyContext.Provider>
  );
}
