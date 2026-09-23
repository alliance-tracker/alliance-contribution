import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { ApiKeyContext, type Role } from "@/lib/apiKey";
import { consumeUrlKey, readApiKey, writeApiKey } from "@/lib/apiKey";
import type { AuthMe } from "@/lib/api";

const KVK_DISABLED: NonNullable<AuthMe["kvk"]> = { enabled: false };

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string>(() => {
    consumeUrlKey();
    return readApiKey();
  });
  const [role, setRole] = useState<Role>(null);
  const [scheduler, setScheduler] = useState(false);
  const [kvk, setKvk] = useState<NonNullable<AuthMe["kvk"]>>(KVK_DISABLED);
  const [checking, setChecking] = useState<boolean>(() => readApiKey() !== "");

  useEffect(() => {
    if (!apiKey) {
      setRole(null);
      setScheduler(false);
      setKvk(KVK_DISABLED);
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
        setKvk(res.kvk ?? KVK_DISABLED);
      })
      .catch(() => {
        if (cancelled) return;
        setRole(null);
        setScheduler(false);
        setKvk(KVK_DISABLED);
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

  const setKvkEnabled = (enabled: boolean) => setKvk((prev) => ({ ...prev, enabled }));

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey, role, scheduler, kvk, setKvkEnabled, checking }}>
      {children}
    </ApiKeyContext.Provider>
  );
}
