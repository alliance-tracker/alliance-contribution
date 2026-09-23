import { useTranslation } from "react-i18next";
import { Copy, Key, Link, Plus } from "lucide-react";
import type { KvkKey } from "@shared/types";
import { maskKey } from "@/lib/kvk";
import { relativeTime } from "@/lib/schedule-format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile, Strip } from "@/components/ui/tone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/States";

/** Admin's alliance access keys — create/edit a key per alliance, copy its plaintext value or
 *  sign-in link. `keys` carries the plaintext `key` (admin-only fetch — the caller never requests
 *  it for manager/viewer). */
export function AccessKeysTab({
  keys,
  onNew,
  onEdit,
  onCopy,
}: {
  keys: KvkKey[];
  onNew: () => void;
  onEdit: (k: KvkKey) => void;
  onCopy: (k: KvkKey, what: "key" | "link") => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="max-w-[1100px] overflow-hidden">
      <Strip tone="blue" always className="flex items-center gap-3 border-b px-[18px] py-[13px]">
        <IconTile icon={Key} tone="blue" always />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-foreground">{t("kvk.keys.title")}</div>
          <div className="text-[12px] text-muted">{t("kvk.keys.subtitle")}</div>
        </div>
        <Button size="sm" className="h-[34px] shrink-0" onClick={onNew}>
          <Plus className="size-3.5" />
          {t("kvk.keys.new")}
        </Button>
      </Strip>

      {keys.length === 0 ? (
        <EmptyState message={t("kvk.keys.empty")} />
      ) : (
        <Table className="min-w-[760px] whitespace-nowrap">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("kvk.keys.colAlliance")}</TableHead>
              <TableHead>{t("kvk.keys.colRep")}</TableHead>
              <TableHead>{t("kvk.keys.colKey")}</TableHead>
              <TableHead className="text-end">{t("kvk.keys.colSlots")}</TableHead>
              <TableHead>{t("kvk.keys.colLastUsed")}</TableHead>
              <TableHead className="text-end">{t("common.actions.edit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <span className="size-3.5 shrink-0 rounded-[4px]" style={{ background: k.color }} aria-hidden />
                    {k.alliance_name}
                  </span>
                </TableCell>
                <TableCell className="text-secondary">{k.representative}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span dir="ltr" className="font-mono text-[12px] font-medium text-foreground">
                      {maskKey(k.key)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-1 rounded-[7px] px-2 text-[12px] font-medium"
                      title={t("kvk.keys.copyKeyTitle")}
                      onClick={() => onCopy(k, "key")}
                    >
                      <Copy className="size-[13px]" />
                      {t("kvk.keys.keyBtn")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-1 rounded-[7px] px-2 text-[12px] font-medium"
                      title={t("kvk.keys.copyLinkTitle")}
                      onClick={() => onCopy(k, "link")}
                    >
                      <Link className="size-[13px]" />
                      {t("kvk.keys.linkBtn")}
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="num text-end">{k.slot_count}</TableCell>
                <TableCell className="text-muted">
                  {k.last_used_at === null ? t("kvk.keys.never") : relativeTime(new Date(k.last_used_at).toISOString(), t)}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-[7px] border-none bg-muted-surface px-2.5 text-[12.5px] font-semibold hover:bg-border"
                    onClick={() => onEdit(k)}
                  >
                    {t("common.actions.edit")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
