import type { TFunction } from "i18next";
import { ApiError } from "@/lib/api";
import type { TKey } from "@/i18n";

/** Map a thrown error to a clear, actionable message. 401 → API-key hint (`needKeyKey`, page-specific);
 *  403 → admin-key hint when `hasAdminGate` (Backup/Rewards gate admin-only routes); else the server's
 *  own text. */
export function writeErrorMessage(
  e: unknown,
  t: TFunction,
  needKeyKey: TKey,
  hasAdminGate = false,
): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return t(needKeyKey);
    if (hasAdminGate && e.status === 403) return t("common.errors.adminKey");
    return e.message;
  }
  return e instanceof Error ? e.message : t("common.errors.generic");
}
