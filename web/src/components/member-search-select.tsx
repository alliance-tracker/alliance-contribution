import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { Member } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Self-contained member search-select: filter the ~86 members by governor substring and pick one.
 * Plain Input + Array.filter list in a Popover — the same pattern as web/src/pages/Members.tsx —
 * plus a `highlighted` index for arrow-key navigation.
 */
export function MemberSearchSelect({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const ph = t("memberSearch.placeholder");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const selected = value === null ? undefined : members.find((m) => m.id === value);

  const filtered = useMemo(() => {
    const sorted = members.slice().sort((a, b) => a.governor.localeCompare(b.governor));
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((m) => m.governor.toLowerCase().includes(needle));
  }, [members, query]);

  function pick(id: number) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[highlighted];
      if (m) pick(m.id);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-[6px] border border-border bg-surface px-3 py-2">
        <span className="text-[13px] font-medium text-foreground">{selected.governor}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            setOpen(true);
          }}
        >
          {t("common.actions.change")}
        </Button>
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
        setHighlighted(0);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-[8px] border border-border bg-surface px-3 text-start text-[13px] text-muted outline-none transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <Search className="size-4 shrink-0 text-muted" />
          {ph}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          autoFocus
          placeholder={ph}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="mt-2 max-h-64 overflow-y-auto overflow-x-hidden" role="listbox">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-muted">{t("memberSearch.empty")}</div>
          ) : (
            filtered.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                ref={(el) => {
                  if (i === highlighted) el?.scrollIntoView({ block: "nearest" });
                }}
                onClick={() => pick(m.id)}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-[13px] text-foreground",
                  i === highlighted && "bg-accent-subtle text-accent",
                )}
              >
                <span>{m.governor}</span>
                {m.alliance_rank && <span className="text-[11px] text-muted">{m.alliance_rank}</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
