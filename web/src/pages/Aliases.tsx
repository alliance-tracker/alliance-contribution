import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import { Plus, Trash2, CheckCircle2, TriangleAlert, Tag } from "lucide-react";
import type { ActivityType, Alias, Member } from "@shared/types";
import { DEFAULT_ACTIVITY_COLOR } from "@shared/colors";
import { api } from "@/lib/api";
import type { AliasChangeResult, AliasConflict, UnmappedRow } from "@/lib/api";
import { useApi, firstError } from "@/lib/useApi";
import { useApiKey } from "@/lib/apiKey";
import { writeErrorMessage } from "@/lib/errors";
import { normalizeName } from "@/lib/normalize";
import { activityBadgeClass } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { MemberSearchSelect } from "@/components/member-search-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { IconTile, Strip } from "@/components/ui/tone";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertContent } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

/** One conflict rendered as a plain, unambiguous sentence keyed to its type. */
function conflictText(c: AliasConflict, t: TFunction): string {
  const names = c.raw_names.join(", ");
  return c.type === "within_event_duplicate"
    ? t("aliases.conflictDuplicate", { event: c.event_id, names })
    : t("aliases.conflictBear", { date: c.date, names });
}

/**
 * Post-write result: recompute count (success) and any retroactive conflicts (warning).
 * A write SUCCEEDS even with conflicts — they are surfaced, not treated as failure.
 */
function AliasChangeResultPanel({ result }: { result: AliasChangeResult }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="success">
        <CheckCircle2 />
        <AlertContent>
          <Trans
            i18nKey="aliases.recomputed"
            count={result.recomputed}
            components={{ 1: <span className="num font-semibold" /> }}
          />
        </AlertContent>
      </Alert>

      {result.conflicts.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertContent>
            <AlertTitle>{t("aliases.conflicts", { count: result.conflicts.length })}</AlertTitle>
            <ul className="flex flex-col gap-1">
              {result.conflicts.map((c, i) => (
                <li key={i}>{conflictText(c, t)}</li>
              ))}
            </ul>
          </AlertContent>
        </Alert>
      )}
    </div>
  );
}

type MemberMode = "existing" | "new";

/** Add-alias dialog. `prefillAlias` seeds the alias text (from the unmapped queue), still editable. */
function AddAliasDialog({
  open,
  onOpenChange,
  members,
  prefillAlias,
  prefillMode = "existing",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  prefillAlias: string;
  prefillMode?: MemberMode;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState("");
  const [mode, setMode] = useState<MemberMode>("existing");
  const [memberId, setMemberId] = useState<number | null>(null);
  const [governor, setGovernor] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AliasChangeResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setAlias(prefillAlias);
    setMode(prefillMode);
    setMemberId(null);
    setGovernor(prefillAlias);
    setNote("");
    setSubmitting(false);
    setError(null);
    setResult(null);
  }, [open, prefillAlias, prefillMode]);

  const canSubmit =
    !submitting &&
    alias.trim() !== "" &&
    (mode === "existing" ? memberId !== null : governor.trim() !== "");

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const noteVal = note.trim() === "" ? null : note.trim();
    try {
      if (mode === "existing") {
        if (memberId === null) return;
        const res = await api.aliases.add({ alias: alias.trim(), member_id: memberId, note: noteVal });
        setResult(res);
      } else {
        // Create the member, then map the raw name to it. When the new governor equals the raw name it
        // already resolves via the governor (adding that alias would be rejected), so just recompute.
        const gov = governor.trim();
        const rawName = alias.trim();
        const member = await api.members.create({ governor: gov });
        try {
          if (normalizeName(rawName) === normalizeName(gov)) {
            const { recomputed } = await api.admin.recompute();
            setResult({ recomputed, conflicts: [] });
          } else {
            const res = await api.aliases.add({ alias: rawName, member_id: member.id, note: noteVal });
            setResult(res);
          }
        } catch (e) {
          // The member exists now and there is no member-delete API to roll it back. Re-running this
          // dialog would also fail on the duplicate governor, so name the partial state instead.
          setError(
            t("aliases.partialError", { governor: gov, error: writeErrorMessage(e, t, "aliases.needKey"), alias: rawName }),
          );
          onSuccess();
          return;
        }
      }
      onSuccess();
    } catch (e) {
      setError(writeErrorMessage(e, t, "aliases.needKey"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("aliases.addTitle")}</DialogTitle>
          <DialogDescription>{t("aliases.addDesc")}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <AliasChangeResultPanel result={result} />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {t("common.actions.done")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <ErrorState message={error} />}

            <Field label={t("aliases.alias")}>
              <Input
                placeholder={t("aliases.aliasPlaceholder")}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </Field>

            <Field label={t("common.member")}>
              <div className="flex flex-col gap-2">
                <Tabs value={mode} onValueChange={(v) => setMode(v as MemberMode)}>
                  <TabsList className="rounded-[8px] border border-border bg-background p-0.5">
                    <TabsTrigger
                      value="existing"
                      className="rounded-[6px] border-none px-3 py-1 text-[12px] font-medium text-secondary transition-colors hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                    >
                      {t("aliases.existing")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="new"
                      className="rounded-[6px] border-none px-3 py-1 text-[12px] font-medium text-secondary transition-colors hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                    >
                      {t("aliases.newMember")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {mode === "existing" ? (
                  <MemberSearchSelect members={members} value={memberId} onChange={setMemberId} />
                ) : (
                  <Input
                    placeholder={t("aliases.governorPlaceholder")}
                    value={governor}
                    onChange={(e) => setGovernor(e.target.value)}
                  />
                )}
              </div>
            </Field>

            <Field label={t("aliases.note")} hint={t("common.optional")}>
              <Input
                placeholder={t("aliases.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            <div className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  {t("common.actions.cancel")}
                </Button>
              </DialogClose>
              <Button size="sm" onClick={submit} disabled={!canSubmit}>
                {mode === "new"
                  ? submitting
                    ? t("aliases.creating")
                    : t("aliases.createAndMap")
                  : submitting
                    ? t("aliases.adding")
                    : t("aliases.addTitle")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Remove-alias confirm dialog — removing can also change resolution, so surface the result. */
function RemoveAliasDialog({
  alias,
  governor,
  onCancel,
  onDone,
}: {
  alias: Alias | null;
  governor: string | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AliasChangeResult | null>(null);

  useEffect(() => {
    if (alias) {
      setSubmitting(false);
      setError(null);
      setResult(null);
    }
  }, [alias]);

  const confirm = async () => {
    if (!alias) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.aliases.remove(alias.id);
      setResult(res);
      onDone();
    } catch (e) {
      setError(writeErrorMessage(e, t, "aliases.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={alias !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aliases.removeTitle")}</DialogTitle>
          {alias && !result && (
            <DialogDescription>
              {governor ? (
                <Trans
                  i18nKey="aliases.removeDescWithGovernor"
                  values={{ alias: alias.alias, governor }}
                  components={{
                    1: <span className="num font-medium text-foreground" />,
                    2: <span className="font-medium text-foreground" />,
                  }}
                />
              ) : (
                <Trans
                  i18nKey="aliases.removeDesc"
                  values={{ alias: alias.alias }}
                  components={{ 1: <span className="num font-medium text-foreground" /> }}
                />
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <AliasChangeResultPanel result={result} />
            <div className="flex justify-end">
              <Button size="sm" onClick={onCancel}>
                {t("common.actions.done")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} />}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
                {t("common.actions.cancel")}
              </Button>
              <Button variant="danger" size="sm" onClick={confirm} disabled={submitting}>
                {submitting ? t("aliases.removing") : t("aliases.removeTitle")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Compact "activity date #instance" descriptor for an unmapped appearance. */
function appearanceLabel(a: UnmappedRow["appearances"][number]): string {
  return `${a.activity} ${a.date} #${a.instance}`;
}

/** Activity color for an appearance — looked up by key from the loaded activity types. */
function appearanceColor(
  a: UnmappedRow["appearances"][number],
  colorByKey: Map<string, string>,
): string {
  return colorByKey.get(a.activity) ?? DEFAULT_ACTIVITY_COLOR;
}

export function Aliases() {
  const { t } = useTranslation();
  const { role } = useApiKey();
  const [reloadKey, setReloadKey] = useState(0);

  const aliasesState = useApi<Alias[]>(() => api.aliases.list(), [reloadKey]);
  const unmappedState = useApi<UnmappedRow[]>(() => api.unmapped(), [reloadKey]);
  const membersState = useApi<Member[]>(() => api.members.list(), [reloadKey]);
  const activitiesState = useApi<ActivityType[]>(() => api.activityTypes.list(), []);

  const colorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activitiesState.data ?? []) m.set(a.key, a.color);
    return m;
  }, [activitiesState.data]);

  const members = membersState.data ?? [];
  const membersById = useMemo(() => {
    const m = new Map<number, Member>();
    for (const mem of members) m.set(mem.id, mem);
    return m;
  }, [members]);

  const aliases = useMemo(
    () =>
      (aliasesState.data ?? []).slice().sort((a, b) => {
        const ga = membersById.get(a.member_id)?.governor ?? "";
        const gb = membersById.get(b.member_id)?.governor ?? "";
        return ga.localeCompare(gb) || a.alias.localeCompare(b.alias);
      }),
    [aliasesState.data, membersById],
  );

  /** Aliases grouped by their canonical member, in the same order as the sorted list above. */
  const aliasGroups = useMemo(() => {
    const groups = new Map<number, { memberId: number; governor: string; aliases: Alias[] }>();
    for (const a of aliases) {
      let group = groups.get(a.member_id);
      if (!group) {
        group = {
          memberId: a.member_id,
          governor: membersById.get(a.member_id)?.governor ?? `#${a.member_id}`,
          aliases: [],
        };
        groups.set(a.member_id, group);
      }
      group.aliases.push(a);
    }
    return Array.from(groups.values());
  }, [aliases, membersById]);

  const unmapped = unmappedState.data ?? [];
  const error = firstError(aliasesState, unmappedState, membersState, activitiesState);
  const loading =
    aliasesState.loading || unmappedState.loading || membersState.loading || activitiesState.loading;

  const [addOpen, setAddOpen] = useState(false);
  const [prefillAlias, setPrefillAlias] = useState("");
  const [prefillMode, setPrefillMode] = useState<MemberMode>("existing");
  const [removeAlias, setRemoveAlias] = useState<Alias | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  /** Client-side filter over the grouped alias directory — no fetch, just a substring match. */
  const filteredAliasGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aliasGroups;
    return aliasGroups.filter(
      (g) => g.governor.toLowerCase().includes(q) || g.aliases.some((a) => a.alias.toLowerCase().includes(q)),
    );
  }, [aliasGroups, search]);

  const refresh = () => setReloadKey((k) => k + 1);

  const openAdd = (prefill: string, mode: MemberMode = "existing") => {
    setPrefillAlias(prefill);
    setPrefillMode(mode);
    setAddOpen(true);
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorState message={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-6">
      {note && (
        <Alert variant="success" className="items-center">
          <AlertContent>{note}</AlertContent>
          <Button variant="ghost" size="sm" onClick={() => setNote(null)}>
            {t("common.actions.dismiss")}
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3.5 md:gap-6 lg:grid-cols-2">
        {/* Alias directory — member → aliases, grouped and searchable. */}
        <Card className="overflow-hidden">
          <Strip tone="blue" className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex min-w-0 items-center gap-[11px]">
              <IconTile icon={Tag} tone="blue" />
              <div className="flex flex-col">
                <span className="text-[13.5px] font-semibold text-foreground">
                  {t("aliases.directoryTitle")}
                </span>
                <span className="text-[11.5px] text-secondary">{t("aliases.directorySubtitle")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t("aliases.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" className="h-10 md:h-8" onClick={() => openAdd("")}>
                <Plus />
                {t("aliases.addTitle")}
              </Button>
            </div>
          </Strip>

          <div className="flex flex-col gap-4 p-4">
            {loading ? (
              <LoadingState />
            ) : filteredAliasGroups.length === 0 ? (
              <EmptyState
                message={
                  search.trim() === "" ? t("aliases.emptyNoAliases") : t("aliases.emptyNoMatch")
                }
              />
            ) : (
              filteredAliasGroups.map((group) => (
                <div key={group.memberId} className="flex flex-col gap-2">
                  <Link
                    to={`/members/${group.memberId}`}
                    className="flex items-center gap-2 text-secondary transition-colors hover:text-accent"
                  >
                    <Avatar name={group.governor} size={28} />
                    <span className="text-[13px] font-medium text-foreground">{group.governor}</span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 ps-[calc(28px+0.5rem)]">
                    <span className="rounded-[6px] bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground">
                      {group.governor}
                    </span>
                    {group.aliases.map((a) => (
                      <span
                        key={a.id}
                        className="group inline-flex items-center gap-1 rounded-[6px] border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-secondary"
                      >
                        {a.alias}
                        {role === "admin" && (
                          <button
                            type="button"
                            aria-label={t("aliases.removeAria", { alias: a.alias })}
                            onClick={() => setRemoveAlias(a)}
                            className="text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-down"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Unmapped queue — the primary operator task. */}
        <Card className="order-first overflow-hidden border-flag-border bg-flag-bg lg:order-none">
          <div className="flex items-center justify-between gap-2 border-b border-flag-border p-3">
            <div className="flex items-center gap-2">
              <TriangleAlert className="size-[17px] text-flag-accent" />
              <div className="flex flex-col">
                <span className="text-[13.5px] font-semibold text-flag-fg">
                  {t("aliases.queueTitle")}
                </span>
                <span className="text-[11.5px] text-flag-accent">
                  {t("aliases.queueSubtitle", { count: unmapped.length })}
                </span>
              </div>
            </div>
            {unmapped.length > 0 && (
              <Badge variant="warn">
                <span className="num">{unmapped.length}</span>
              </Badge>
            )}
          </div>

          <div className="p-3">
            {loading ? (
              <LoadingState />
            ) : unmapped.length === 0 ? (
              <EmptyState message={t("aliases.queueEmpty")} />
            ) : (
              unmapped.map((row) => (
                <div
                  key={row.raw_name}
                  className="mb-2 flex flex-col gap-2.5 rounded-[9px] border border-flag-border bg-surface p-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-3"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="num text-[13px] font-semibold text-foreground">
                      {row.raw_name}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {row.appearances.map((a, i) => (
                        <Badge
                          key={i}
                          className={cn(
                            "rounded-[5px] font-mono text-[10.5px]",
                            activityBadgeClass(appearanceColor(a, colorByKey)),
                          )}
                        >
                          {appearanceLabel(a)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9 flex-1 md:h-8 md:flex-none" onClick={() => openAdd(row.raw_name)}>
                      {t("aliases.mapToMember")}
                    </Button>
                    <Button size="sm" variant="secondary" className="h-9 md:h-8" onClick={() => openAdd(row.raw_name, "new")}>
                      {t("aliases.newMember")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <AddAliasDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        members={members}
        prefillAlias={prefillAlias}
        prefillMode={prefillMode}
        onSuccess={refresh}
      />

      <RemoveAliasDialog
        alias={removeAlias}
        governor={removeAlias ? membersById.get(removeAlias.member_id)?.governor ?? null : null}
        onCancel={() => {
          setRemoveAlias(null);
          refresh();
        }}
        onDone={() => {
          setNote(t("aliases.removedNote"));
          refresh();
        }}
      />
    </div>
  );
}
