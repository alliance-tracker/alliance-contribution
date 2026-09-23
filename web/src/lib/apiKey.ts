import { createContext, useContext } from "react";
import { API_KEY_STORAGE, type AuthMe } from "./api";

export function readApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function writeApiKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(API_KEY_STORAGE, trimmed);
  else localStorage.removeItem(API_KEY_STORAGE);
}

/**
 * Reads a `?key=` sign-in link (a key holder's URL), stores it, and strips it from the address bar
 * before anything else can log or share it. A URL key wins over any stored key — the link is how a
 * holder signs in. No-op when the param is absent or empty.
 */
export function consumeUrlKey(): void {
  const params = new URLSearchParams(location.search);
  const key = params.get("key");
  if (!key) return;
  writeApiKey(key);
  params.delete("key");
  const rest = params.toString();
  const url = location.pathname + (rest ? `?${rest}` : "") + location.hash;
  history.replaceState(null, "", url);
}

export type Role = "admin" | "manager" | "viewer" | "kvk" | null;

export type ApiKeyContextValue = {
  /** The current API key ("" when unset). Every request needs one — viewer tier is the read floor. */
  apiKey: string;
  /** Persist a new key (or clear it with an empty string). */
  setApiKey: (key: string) => void;
  /** Role resolved from the current key via GET /api/auth/me (null when unset or not recognised). */
  role: Role;
  /** Whether this deployment runs the reminder scheduler — hides the Schedule tab and page when off. */
  scheduler: boolean;
  /** KvK Prep open flag (+ alliance card for a key holder), from the last /api/auth/me answer. */
  kvk: NonNullable<AuthMe["kvk"]>;
  /** Flips the LIVE pill immediately after Event settings saves, without a second /auth/me round trip. */
  setKvkEnabled: (enabled: boolean) => void;
  /** True until the first /api/auth/me answer lands, so the gate doesn't flash on load. */
  checking: boolean;
};

export const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

export function useApiKey(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used within an ApiKeyProvider");
  return ctx;
}
