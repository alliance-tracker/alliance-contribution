import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import {
  ArrowUpDown,
  Merge,
  Plus,
  Pencil,
  Tag,
  UserMinus,
  UserCheck,
  CalendarDays,
  CheckCircle2,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import type {
  Alias,
  Attendance,
  CaptureRosterRow,
  CaptureSummary,
  Member,
  MemberDelta,
  RosterImportBatch,
  RosterImportResult,
} from "@shared/types";
import { rosterChatPrompt } from "@shared/prompts";
import { api } from "@/lib/api";
import type { MergeResult, RenameResult } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useApiKey } from "@/lib/apiKey";
import type { TKey } from "@/i18n";
import { writeErrorMessage } from "@/lib/errors";
import { normalizeName } from "@/lib/normalize";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buildRosterRows,
  captureRosterInput,
  filterRows,
  rosterScales,
  sortRows,
  summarizeRoster,
  topPowerIds,
  type RosterMember,
  type RosterRow,
  type RosterSort,
} from "@/lib/roster-view";
import {
  MoveCell,
  PowerCell,
  PowerChangeCell,
  RankChangeChip,
  RankChip,
  RosterLegend,
  RosterStats,
  StatusCell,
  riskEdgeClass,
  rowClass,
} from "@/components/roster-cells";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Alert, AlertContent } from "@/components/ui/alert";
import { RosterDeltaPanel } from "@/components/roster-delta-panel";
import {
  classifyRoster,
  metaFields,
  parseNumCell,
  parseRoster,
  serializeRoster,
  type ParsedRosterRow,
} from "@/lib/roster-paste";
import { MemberSearchSelect } from "@/components/member-search-select";
import { RosterMobileRow } from "@/components/roster-mobile-row";
import { LlmPrompt } from "@/components/llm-prompt";
import { ScreenshotIngest, type IngestMode } from "@/components/screenshot-ingest";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

/** Blank → null, unreadable → undefined (invalid). Same digit-only rule the paste enforces, so a
 *  hand-typed power cannot be negative — a negative stored power silently disarms the delta's
 *  identity tripwire (src/domain/roster-delta.ts). */
function parseOptionalNumber(text: string): number | null | undefined {
  const v = parseNumCell(text);
  return v === "bad" ? undefined : v;
}

type Filter = "all" | "active" | "inactive";

/** Labeled checkbox using the app accent — no native select/date, native checkbox is fine. */
function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
      <ShadcnCheckbox checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {children}
    </label>
  );
}

/** R1–R5 or none. Radix reserves the empty string as a value, so "none" is the null sentinel. */
function AllianceRankSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(next) => onChange(next === "none" ? null : next)}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">—</SelectItem>
        {["R5", "R4", "R3", "R2", "R1"].map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Add-member dialog. Governor required; rank/power/position optional. */
function AddMemberDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (governor: string) => void;
}) {
  const [governor, setGovernor] = useState("");
  const [allianceRank, setAllianceRank] = useState<string | null>(null);
  const [power, setPower] = useState("");
  const [position, setPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    setGovernor("");
    setAllianceRank(null);
    setPower("");
    setPosition("");
    setSubmitting(false);
    setError(null);
  }, [open]);

  const powerNum = parseOptionalNumber(power);
  const positionNum = parseOptionalNumber(position);
  const canSubmit =
    !submitting && governor.trim() !== "" && powerNum !== undefined && positionNum !== undefined;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.members.create({
        governor: governor.trim(),
        alliance_rank: allianceRank,
        power: powerNum ?? null,
        power_position: positionNum ?? null,
      });
      onSuccess(governor.trim());
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("roster.addTitle")}</DialogTitle>
          <DialogDescription>{t("roster.addDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && <ErrorState message={error} />}

          <Field label={t("common.governor")}>
            <Input
              placeholder={t("roster.governorPlaceholder")}
              value={governor}
              onChange={(e) => setGovernor(e.target.value)}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t("common.rank")} hint={t("common.optional")}>
              <AllianceRankSelect value={allianceRank} onChange={setAllianceRank} />
            </Field>
            <Field label={t("common.power")} hint={t("common.optional")}>
              <Input
                className="num"
                inputMode="numeric"
                placeholder="0"
                value={power}
                onChange={(e) => setPower(e.target.value)}
                aria-invalid={powerNum === undefined}
              />
            </Field>
            <Field label={t("roster.powerPosition")} hint={t("common.optional")}>
              <Input
                className="num"
                inputMode="numeric"
                placeholder="0"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                aria-invalid={positionNum === undefined}
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                {t("common.actions.cancel")}
              </Button>
            </DialogClose>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>
              {submitting ? t("roster.adding") : t("roster.addTitle")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Edit dialog — partial PATCH of rank/power/position/active. Governor is changed via Rename only. */
function EditMemberDialog({
  member,
  onCancel,
  onSuccess,
}: {
  member: Member | null;
  onCancel: () => void;
  onSuccess: (governor: string) => void;
}) {
  const [allianceRank, setAllianceRank] = useState<string | null>(null);
  const [power, setPower] = useState("");
  const [position, setPosition] = useState("");
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!member) return;
    setAllianceRank(member.alliance_rank);
    setPower(member.power === null ? "" : String(member.power));
    setPosition(member.power_position === null ? "" : String(member.power_position));
    setActive(member.active === 1);
    setSubmitting(false);
    setError(null);
  }, [member]);

  const powerNum = parseOptionalNumber(power);
  const positionNum = parseOptionalNumber(position);
  const canSubmit = !submitting && powerNum !== undefined && positionNum !== undefined;

  const submit = async () => {
    if (!member) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.members.update(member.id, {
        alliance_rank: allianceRank,
        power: powerNum ?? null,
        power_position: positionNum ?? null,
        active: active ? 1 : 0,
      });
      onSuccess(member.governor);
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("roster.editTitle")}</DialogTitle>
          {member && (
            <DialogDescription>
              <Trans
                i18nKey="roster.editDesc"
                values={{ governor: member.governor }}
                components={{ 1: <span className="font-medium text-foreground" /> }}
              />
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && <ErrorState message={error} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t("common.rank")} hint={t("common.optional")}>
              <AllianceRankSelect value={allianceRank} onChange={setAllianceRank} />
            </Field>
            <Field label={t("common.power")} hint={t("common.optional")}>
              <Input
                className="num"
                inputMode="numeric"
                placeholder="0"
                value={power}
                onChange={(e) => setPower(e.target.value)}
                aria-invalid={powerNum === undefined}
              />
            </Field>
            <Field label={t("roster.powerPosition")} hint={t("common.optional")}>
              <Input
                className="num"
                inputMode="numeric"
                placeholder="0"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                aria-invalid={positionNum === undefined}
              />
            </Field>
          </div>

          <Checkbox checked={active} onChange={setActive}>
            {t("roster.status.active")}
          </Checkbox>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
              {t("common.actions.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>
              {submitting ? t("common.actions.saving") : t("common.actions.saveChanges")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Rename dialog — first-class canonical rename with "keep old name as alias" (default on). */
function RenameMemberDialog({
  member,
  onCancel,
  onSuccess,
}: {
  member: Member | null;
  onCancel: () => void;
  onSuccess: (label: string) => void;
}) {
  const [governor, setGovernor] = useState("");
  const [addAlias, setAddAlias] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenameResult | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!member) return;
    setGovernor("");
    setAddAlias(true);
    setSubmitting(false);
    setError(null);
    setResult(null);
  }, [member]);

  const trimmed = governor.trim();
  const canSubmit =
    !submitting && trimmed !== "" && (!member || trimmed !== member.governor);

  const submit = async () => {
    if (!member) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.members.rename(member.id, trimmed, { addAlias });
      setResult(res);
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("roster.renameTitle")}</DialogTitle>
          {member && !result && (
            <DialogDescription>
              <Trans
                i18nKey="roster.renameDesc"
                values={{ governor: member.governor }}
                components={{ 1: <span className="font-medium text-foreground" /> }}
              />
            </DialogDescription>
          )}
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-[6px] border border-up/20 bg-up/5 p-3 text-[13px] text-up">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span>
                  <Trans
                    i18nKey="roster.renamedTo"
                    values={{ governor: result.member.governor }}
                    components={{ 1: <span className="font-semibold" /> }}
                  />
                </span>
                <span>{result.addedAlias ? t("roster.aliasKept") : t("roster.aliasNotKept")}</span>
                <span>{t("roster.scoresRecomputed")}</span>
              </div>
            </div>

            {result.warning && (
              <div className="flex items-start gap-2 rounded-[6px] border border-warn/20 bg-warn/5 p-3 text-[13px] text-warn">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{result.warning}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={() => onSuccess(result.member.governor)}>
                {t("common.actions.done")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <ErrorState message={error} />}

            <Field label={t("roster.newGovernor")}>
              <Input
                placeholder={t("roster.newNamePlaceholder")}
                value={governor}
                onChange={(e) => setGovernor(e.target.value)}
                autoFocus
              />
            </Field>

            <Checkbox checked={addAlias} onChange={setAddAlias}>
              {t("roster.keepAlias")}
            </Checkbox>

            {!addAlias && (
              <div className="flex items-start gap-2 rounded-[6px] border border-warn/20 bg-warn/5 p-3 text-[13px] text-warn">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{t("roster.noAliasWarning")}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
                {t("common.actions.cancel")}
              </Button>
              <Button size="sm" onClick={submit} disabled={!canSubmit}>
                {submitting ? t("roster.renaming") : t("roster.rename")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Confirm dialog for deactivating a member (no hard delete — history stays scorable). */
/**
 * Merge dialog — merges the duplicate (source) into a picked survivor. The source's names become
 * the survivor's aliases, its snapshots and participation history move over, and the row is
 * deleted. Deliberate operator action only — the app never suggests two names are the same person
 * (decoy-rename rule).
 */
function MergeMemberDialog({
  member,
  members,
  onCancel,
  onSuccess,
}: {
  member: Member | null;
  members: Member[];
  onCancel: () => void;
  onSuccess: (result: MergeResult) => void;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (member) {
      setTargetId(null);
      setSubmitting(false);
      setError(null);
    }
  }, [member]);

  const target = targetId === null ? undefined : members.find((m) => m.id === targetId);
  const candidates = useMemo(
    () => members.filter((m) => m.id !== member?.id),
    [members, member],
  );

  const submit = async () => {
    if (!member || targetId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      onSuccess(await api.members.merge(member.id, targetId));
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("roster.mergeTitle")}</DialogTitle>
          {member && (
            <DialogDescription>
              <Trans
                i18nKey="roster.mergeDesc"
                values={{ governor: member.governor }}
                components={{ 1: <span className="font-medium text-foreground" /> }}
              />
            </DialogDescription>
          )}
        </DialogHeader>

        {member && (
          <div className="flex flex-col gap-4">
            {error && <ErrorState message={error} />}

            <Field label={t("roster.mergeInto")}>
              <MemberSearchSelect members={candidates} value={targetId} onChange={setTargetId} />
            </Field>

            {target && (
              <div className="flex items-start gap-2 rounded-[6px] border border-warn/20 bg-warn/5 p-3 text-[13px] text-warn">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  <Trans
                    i18nKey="roster.mergeWarning"
                    values={{ source: member.governor, target: target.governor }}
                    components={{ 1: <span className="font-semibold" /> }}
                  />
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
                {t("common.actions.cancel")}
              </Button>
              <Button variant="danger" size="sm" onClick={submit} disabled={submitting || !target}>
                {submitting ? t("roster.merging") : t("roster.merge")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  member,
  onCancel,
  onDone,
}: {
  member: Member | null;
  onCancel: () => void;
  onDone: (governor: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (member) {
      setSubmitting(false);
      setError(null);
    }
  }, [member]);

  const confirm = async () => {
    if (!member) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.members.update(member.id, { active: 0 });
      onDone(member.governor);
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("roster.deactivateTitle")}</DialogTitle>
          {member && (
            <DialogDescription>
              <Trans
                i18nKey="roster.deactivateDesc"
                values={{ governor: member.governor }}
                components={{ 1: <span className="font-medium text-foreground" /> }}
              />
            </DialogDescription>
          )}
        </DialogHeader>

        {error && <ErrorState message={error} />}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            {t("common.actions.cancel")}
          </Button>
          <Button variant="danger" size="sm" onClick={confirm} disabled={submitting}>
            {submitting ? t("roster.deactivating") : t("roster.deactivate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Roster TSV import wizard ----------------------------------------------

/** Prompt the operator pastes into an LLM alongside the Alliance Ranking screenshots (shared/prompts.ts). */
const ROSTER_PROMPT = rosterChatPrompt();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Absent share above which a paste is more likely truncated than the alliance is emptying. */
const PARTIAL_PASTE_RATIO = 0.25;

/** Local YYYY-MM-DD. Never toISOString() — UTC would put an evening capture on tomorrow's date. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Jul 28, 2026" in the active language — UTC-pinned so the label can never shift a day off the capture date. */
function fmtCaptureDate(date: string): string {
  return formatDate(date, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A decision about one unrecognized name. `promote` makes an alias decision a RENAME: the member's
 * governor becomes the pasted name and the old name is kept as an alias. It defaults to false
 * because it is the destructive reading — the alliance runs deliberate decoy renames where similar
 * names are different people (docs/data/runbook.md §8).
 */
type Decision = { kind: "new" | "alias" | "skip"; memberId: number | null; promote: boolean };

/** Three-way decision control for an unrecognized name — segmented, no native select. */
function DecisionSegmented({
  value,
  onChange,
}: {
  value: Decision["kind"];
  onChange: (kind: Decision["kind"]) => void;
}) {
  const { t } = useTranslation();
  const opts: { key: Decision["kind"]; label: string }[] = [
    { key: "new", label: t("roster.import.newMember") },
    { key: "alias", label: t("roster.import.aliasOf") },
    { key: "skip", label: t("roster.import.skip") },
  ];
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Decision["kind"])}>
      <TabsList className="rounded-[6px] border-none bg-surface p-0.5">
        {opts.map((o) => (
          <TabsTrigger
            key={o.key}
            value={o.key}
            className="rounded-[4px] border-none px-2 py-1 text-[12px] font-medium text-secondary transition-colors hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
          >
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** "R4 · 164,497,800 · #12" for the decision table, em-dash for absent cells. */
function metaLabel(row: ParsedRosterRow): string {
  return [
    row.alliance_rank ?? "—",
    row.power === null ? "—" : formatNumber(row.power),
    row.power_position === null ? "—" : `#${row.power_position}`,
  ].join(" · ");
}

/**
 * Three-step roster import against the in-game Alliance Ranking screen.
 *
 * Step 1: pick the capture date and paste the TSV. The paste is parsed by `roster-paste.ts` and
 * classified against the current members + aliases (client-side normalizeName mirroring the
 * backend). The date is checked for an existing capture, because importing replaces a date
 * wholesale — that needs an explicit acknowledgement.
 * Step 2 (skipped when every name resolves): decide each unrecognized name — new / alias-of / skip,
 * where an alias may be promoted to the member's primary name, i.e. a rename.
 * Step 3 (skipped when nobody is absent or returning): confirm membership. Absence is never read as
 * departure, so deactivation is opt-in; a matched inactive member is reactivated by default.
 *
 * Apply sends ONE RosterImportBatch; the backend applies decisions atomically, writes one snapshot
 * per observed member, and recomputes once. The result carries the delta since each member's own
 * last observation.
 */
function ImportRosterDialog({
  open,
  onOpenChange,
  onApplied,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
  /** Edit mode: prefill from a stored capture. The date is locked (moving a capture would leave the
   *  original behind) and the overwrite acknowledgement is implied — replacing that date is the point. */
  initial: { capturedOn: string; text: string } | null;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [text, setText] = useState("");
  const [ingestMode, setIngestMode] = useState<IngestMode>("screenshots");
  const [screenshotRead, setScreenshotRead] = useState(false);
  const [screenshotBlocking, setScreenshotBlocking] = useState(false);
  const appendLines = useCallback((lines: string[]) => {
    setText((prev) => (prev.trim() === "" ? lines.join("\n") : `${prev.replace(/\s+$/, "")}\n${lines.join("\n")}`));
    setScreenshotRead(true);
  }, []);
  const onBatchChange = useCallback((s: { blocking: boolean }) => setScreenshotBlocking(s.blocking), []);
  const [capturedOn, setCapturedOn] = useState(todayIso);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [latestCapture, setLatestCapture] = useState<string | null>(null);
  const [captureCheckFailed, setCaptureCheckFailed] = useState(false);
  const [captureChecking, setCaptureChecking] = useState(false);
  const [overwriteAck, setOverwriteAck] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  // Step 3, both keyed by member id. Deactivation is opt-in — a truncated paste must be able to do
  // nothing. Reactivation defaults on: a matched inactive member is in the alliance by observation.
  //
  // Like `decisions`, a tick is keyed to the MEMBER and deliberately survives a paste edit: the
  // operator's judgement was about that person, not about that revision of the text. `buildBatch`
  // filters both records through the live `classified` sets, so a tick for someone who is no longer
  // absent (or no longer returning) is inert rather than wrong.
  const [deactivateIds, setDeactivateIds] = useState<Record<number, boolean>>({});
  const [reactivateIds, setReactivateIds] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RosterImportResult | null>(null);

  // Reset + fetch current members and aliases whenever the dialog opens. `cancelled` guards a
  // close-and-reopen fast enough that two fetches are in flight: without it the older pair can
  // resolve last and leave the previous roster in state, which every classification then trusts.
  // `overwriteAck` is reset by the capture-check effect below, which owns it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep(1);
    setText(initial?.text ?? "");
    setScreenshotRead(false);
    setScreenshotBlocking(false);
    setCapturedOn(initial?.capturedOn ?? todayIso());
    setDecisions({});
    setDeactivateIds({});
    setReactivateIds({});
    setSubmitting(false);
    setError(null);
    setResult(null);
    setLoadingData(true);
    setDataError(null);
    Promise.all([api.members.list(), api.aliases.list()])
      .then(([m, a]) => {
        if (cancelled) return;
        setMembers(m);
        setAliases(a);
      })
      .catch((e) => {
        if (!cancelled) setDataError(writeErrorMessage(e, t, "roster.needKey"));
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
    // `initial` is set by the caller before opening and does not change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // How many snapshots the chosen date already holds. Re-importing a short paste over a full
  // capture replaces it and turns the missing members into gaps, so the operator must acknowledge.
  //
  // Unknown must never read as zero — that is the whole rule, and it has three cases, not one.
  // A failed check asks anyway (`captureCheckFailed`); a check still in flight blocks Apply
  // (`captureChecking`); and the count is cleared the moment a new date is picked, so date B is
  // never labelled with date A's count. Leaving a stale count in place would let the operator hit
  // Apply during the round-trip and silently replace a full capture with no warning shown.
  useEffect(() => {
    if (!open || !DATE_RE.test(capturedOn)) {
      setExistingCount(null);
      setLatestCapture(null);
      setCaptureCheckFailed(false);
      setCaptureChecking(false);
      return;
    }
    let cancelled = false;
    setOverwriteAck(false);
    setCaptureCheckFailed(false);
    setExistingCount(null);
    setLatestCapture(null);
    setCaptureChecking(true);
    api.members
      .captures(capturedOn)
      .then((res) => {
        if (!cancelled) {
          setExistingCount(res.count);
          setLatestCapture(res.latest);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setExistingCount(null);
        setLatestCapture(null);
        setCaptureCheckFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCaptureChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, capturedOn]);

  const parsed = useMemo(() => parseRoster(text), [text]);

  // Decisions are keyed by the STABLE name-key (normalizeName of the governor), not the array
  // index — so editing the paste keeps each decision attached to its own name rather than
  // silently re-attaching to whatever row now sits at that position.
  //
  // `Object.hasOwn` rather than `??`: a governor literally named "constructor" or "toString" would
  // otherwise read an inherited function off the prototype, `??` would not fire, and `d.kind` would
  // be undefined — the segmented control would render with no arm selected and `buildBatch` would
  // match none of its three branches, dropping the row without even counting it as skipped.
  // `roster-paste.ts` closes the same hole on the same kind of lookup.
  const getDecision = (row: ParsedRosterRow): Decision => {
    const key = normalizeName(row.governor);
    return Object.hasOwn(decisions, key)
      ? decisions[key]
      : { kind: "new", memberId: null, promote: false };
  };
  // Safe by construction: a computed key in an object literal always defines an own property.
  const setDecision = (row: ParsedRosterRow, next: Decision) =>
    setDecisions((prev) => ({ ...prev, [normalizeName(row.governor)]: next }));

  // Alias decisions feed back into classification: a member claimed by one is neither absent nor
  // free to be claimed a second time. Passing the whole record is safe — classifyRoster reads only
  // the entries whose name is still unrecognized in the current paste.
  const aliasTargets = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [key, d] of Object.entries(decisions)) {
      if (d.kind === "alias") out[key] = d.memberId;
    }
    return out;
  }, [decisions]);

  const classified = useMemo(
    () => classifyRoster({ rows: parsed.rows, members, aliases, aliasTargets }),
    [parsed, members, aliases, aliasTargets],
  );

  // `decisions` is the only reactive value `getDecision` closes over, so listing it alongside
  // `classified` is the complete dependency set. The rule wants `getDecision` itself, but that is a
  // fresh closure every render and depending on it would defeat the memo.
  const skippedDecisionCount = useMemo(
    () => classified.unrecognized.filter((row) => getDecision(row).kind === "skip").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classified, decisions],
  );

  // Same dependency reasoning as above.
  const aliasMissingMember = useMemo(
    () =>
      classified.unrecognized.some((row) => {
        const d = getDecision(row);
        return d.kind === "alias" && d.memberId === null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classified, decisions],
  );

  const activeCount = members.filter((m) => m.active === 1).length;
  const matchedCount = classified.matched.length;
  const unrecognizedCount = classified.unrecognized.length;
  const nothingToImport = parsed.rows.length === 0;
  const dateValid = DATE_RE.test(capturedOn);
  const needsOverwriteAck =
    initial === null && ((existingCount ?? 0) > 0 || captureCheckFailed) && !overwriteAck;
  // A capture older than the newest on record is a BACKFILL: it adds history but says nothing about
  // today's membership, and the server rejects deactivations/reactivations that arrive with it.
  const backdated = latestCapture != null && capturedOn < latestCapture;
  const partialPaste =
    activeCount > 0 && classified.absent.length > activeCount * PARTIAL_PASTE_RATIO;

  // Step 3 has something to decide whenever anyone is absent or returning. Steps are skipped, not
  // hidden — an operator with a full paste and no unknown names still goes straight to Apply.
  // A backdate keeps the step even with nothing to decide: it is the only place the wizard explains
  // that this paste writes history and not today's standings, and skipping it would apply a backfill
  // with no explanation shown at all.
  const membershipCount = classified.absent.length + classified.returning.length;
  const showMembershipStep = membershipCount > 0 || backdated;

  // Both gates are positive so every button reads the same direction: `disabled={!canX}`.
  // `canAdvance` is everything that must be settled on step 1 before the wizard moves on; `canApply`
  // adds the one thing decided later (every "Alias of…" row has a member).
  // `loadingData` gates advancing too, not just applying: until the roster arrives every pasted
  // name classifies as unrecognized, so step 2 would list all 86 of them and step 3 would offer
  // nobody. The decisions made there are inert once the roster lands, but the screen is a lie.
  // `needsOverwriteAck` and `captureChecking` gate advancing for the same reason in reverse: the
  // acknowledgement checkbox and the capture-count alert only exist on step 1, so deferring them to
  // Apply would disable Apply on step 2 or 3 with nothing on screen explaining why.
  const canAdvance =
    !nothingToImport &&
    dateValid &&
    !loadingData &&
    !needsOverwriteAck &&
    !captureChecking &&
    parsed.invalid.length === 0 &&
    classified.conflicts.length === 0 &&
    !screenshotBlocking;
  const canApply = canAdvance && !aliasMissingMember && !screenshotBlocking;

  const buildBatch = (): RosterImportBatch => {
    const updates = classified.matched.map(({ row, memberId }) => ({
      member_id: memberId,
      ...metaFields(row),
    }));
    const creates: RosterImportBatch["creates"] = [];
    const aliasRows: RosterImportBatch["aliases"] = [];
    classified.unrecognized.forEach((row) => {
      const d = getDecision(row);
      if (d.kind === "skip") return;
      if (d.kind === "new") {
        creates.push({ governor: row.governor, ...metaFields(row) });
      } else if (d.kind === "alias" && d.memberId !== null) {
        aliasRows.push({
          alias: row.governor,
          member_id: d.memberId,
          ...(d.promote ? { promote_to_governor: true } : {}),
          ...metaFields(row),
        });
      }
    });
    return {
      captured_on: capturedOn,
      updates,
      creates,
      aliases: aliasRows,
      deactivate: backdated
        ? []
        : classified.absent.filter((m) => deactivateIds[m.id]).map((m) => m.id),
      reactivate: backdated
        ? []
        : classified.returning.filter((m) => reactivateIds[m.id] !== false).map((m) => m.id),
    };
  };

  const apply = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.members.import(buildBatch());
      setResult(res);
      onApplied();
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? t("roster.import.editTitle") : t("roster.import.title")}
            {!result && !dataError && (
              <span className="font-normal text-muted"> {t("roster.import.step", { step })}</span>
            )}
          </DialogTitle>
          <DialogDescription>{t("roster.import.desc")}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-[6px] border border-up/20 bg-up/5 p-3 text-[13px] text-up">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                <Trans
                  i18nKey="roster.import.result"
                  values={{
                    updated: result.updated,
                    created: result.created,
                    aliased: result.aliased,
                    deactivated: result.deactivated,
                    reactivated: result.reactivated,
                    skipped: skippedDecisionCount,
                    recomputed: formatNumber(result.recomputed),
                  }}
                  components={{
                    1: <span className="num font-semibold" />,
                    2: <span className="num font-semibold" />,
                    3: <span className="num font-semibold" />,
                    4: <span className="num font-semibold" />,
                    5: <span className="num font-semibold" />,
                    6: <span className="num font-semibold" />,
                    7: <span className="num font-semibold" />,
                  }}
                />
              </span>
            </div>
            <RosterDeltaPanel delta={result.delta} capturedOn={capturedOn} />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {t("common.actions.done")}
              </Button>
            </div>
          </div>
        ) : dataError ? (
          <div className="flex flex-col gap-4">
            <ErrorState message={dataError} />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {t("common.actions.close")}
              </Button>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="flex flex-col gap-4">
            {error && <ErrorState message={error} />}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-secondary">
                {t("roster.import.captureDate")}
              </label>
              <p className="text-[12px] text-muted">{t("roster.import.captureDateHelp")}</p>
              {initial ? (
                <span className="num text-[13px] font-medium">{capturedOn}</span>
              ) : (
                <>
                  <DatePicker value={capturedOn} onChange={setCapturedOn} className="w-56" />
                  {!dateValid && (
                    <p className="text-[12px] text-down">{t("roster.import.invalidDate")}</p>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-secondary">{t("roster.title")}</label>
              {!initial && (
                <ScreenshotIngest
                  kind="roster"
                  onLines={appendLines}
                  onModeChange={setIngestMode}
                  onBatchChange={onBatchChange}
                  disabled={submitting}
                />
              )}
              {(ingestMode === "paste" || initial) && (
                <p className="text-[12px] text-muted">
                  <Trans
                    i18nKey="roster.import.rosterHelp"
                    components={{
                      1: <span className="num text-secondary" />,
                      2: <span className="num text-secondary" />,
                      3: <span className="num text-secondary" />,
                      4: <span className="num text-secondary" />,
                    }}
                  />
                </p>
              )}
              <LlmPrompt prompt={ROSTER_PROMPT} />
              <Textarea
                className="min-h-40 resize-y font-mono"
                placeholder={ingestMode === "screenshots" && !initial ? t("screenshots.placeholder") : "Aurora\tR5\t164,497,800\t1\nBlaze\tR4\t120,000,000\t2"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </div>

            {loadingData ? (
              <LoadingState />
            ) : parsed.rows.length > 0 || parsed.noGovernor > 0 || parsed.invalid.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-[6px] border border-border bg-background p-3 text-[13px]">
                <div className="text-secondary">
                  <Trans
                    i18nKey="roster.import.matched"
                    count={matchedCount}
                    components={{ 1: <span className="num font-semibold text-foreground" /> }}
                  />
                  <span className="text-faint"> · </span>
                  <Trans
                    i18nKey="roster.import.unrecognized"
                    count={unrecognizedCount}
                    components={{ 1: <span className="num font-semibold text-foreground" /> }}
                  />
                  <span className="text-faint"> · </span>
                  <Trans
                    i18nKey="roster.import.duplicates"
                    count={classified.duplicates}
                    components={{ 1: <span className="num font-semibold text-foreground" /> }}
                  />
                  <span className="text-faint"> · </span>
                  <Trans
                    i18nKey="roster.import.noGovernor"
                    count={parsed.noGovernor}
                    components={{ 1: <span className="num font-semibold text-foreground" /> }}
                  />
                </div>
                {classified.r5Count !== 1 && (
                  <p className="text-[12px] text-warn">
                    {classified.r5Count === 0 ? t("roster.import.noR5") : t("roster.import.manyR5", { n: classified.r5Count })}
                  </p>
                )}
              </div>
            ) : null}

            {parsed.invalid.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertContent>
                  <div className="font-medium">
                    {t("roster.import.invalidRows", { count: parsed.invalid.length })}
                  </div>
                  <div className="num text-[12px]">
                    {parsed.invalid
                      .slice(0, 8)
                      .map((r) =>
                        t("roster.import.invalidDetail", {
                          line: r.line,
                          governor: r.governor,
                          field: t(`roster.import.field.${r.field}`),
                          value: r.value,
                        }),
                      )
                      .join(" · ")}
                    {parsed.invalid.length > 8
                      ? ` ${t("roster.import.andMore", { n: parsed.invalid.length - 8 })}`
                      : ""}
                  </div>
                </AlertContent>
              </Alert>
            )}

            {classified.conflicts.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertContent>
                  <div className="font-medium">
                    {t("roster.import.conflicts", { count: classified.conflicts.length })}
                  </div>
                  <div className="num text-[12px]">
                    {classified.conflicts
                      .map((c) => `${c.governor} ← ${c.names.join(", ")}`)
                      .join(" · ")}
                  </div>
                </AlertContent>
              </Alert>
            )}

            {existingCount !== null && existingCount > 0 && (
              <Alert variant="warn">
                <TriangleAlert />
                <AlertContent>
                  <div>
                    <Trans
                      i18nKey="roster.import.existing"
                      count={existingCount}
                      values={{
                        date: capturedOn,
                        carries: matchedCount + unrecognizedCount - skippedDecisionCount,
                      }}
                      components={{
                        1: <span className="num font-semibold" />,
                        2: <span className="num font-semibold" />,
                        3: <span className="num font-semibold" />,
                      }}
                    />
                  </div>
                  {initial === null && (
                    <Checkbox checked={overwriteAck} onChange={setOverwriteAck}>
                      <span className="text-warn">
                        {t("roster.import.replaceExisting", { date: capturedOn })}
                      </span>
                    </Checkbox>
                  )}
                </AlertContent>
              </Alert>
            )}

            {/* A wrong-dated capture cannot be deleted from the app, and a future date is always a
                mistake. Non-blocking — the operator may legitimately be backdating, which this does
                not catch, so it warns rather than gates. */}
            {dateValid && capturedOn > todayIso() && (
              <Alert variant="warn">
                <TriangleAlert />
                <AlertContent>
                  <div>
                    <Trans
                      i18nKey="roster.import.futureDate"
                      values={{ date: capturedOn }}
                      components={{ 1: <span className="num font-semibold" /> }}
                    />
                  </div>
                </AlertContent>
              </Alert>
            )}

            {captureCheckFailed && (
              <Alert variant="warn">
                <TriangleAlert />
                <AlertContent>
                  <div>
                    <Trans
                      i18nKey="roster.import.checkFailed"
                      values={{ date: capturedOn }}
                      components={{ 1: <span className="num font-semibold" /> }}
                    />
                  </div>
                  <Checkbox checked={overwriteAck} onChange={setOverwriteAck}>
                    <span className="text-warn">{t("roster.import.importAnyway")}</span>
                  </Checkbox>
                </AlertContent>
              </Alert>
            )}

            {ingestMode === "screenshots" && screenshotRead && !screenshotBlocking && (
              <p className="text-[12px] leading-relaxed text-muted">{t("screenshots.nudgeRoster")}</p>
            )}
            {screenshotBlocking && (
              <p className="text-[12px] leading-relaxed text-warn">{t("screenshots.rosterBlocked")}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  {t("common.actions.cancel")}
                </Button>
              </DialogClose>
              {unrecognizedCount === 0 && !showMembershipStep ? (
                <Button size="sm" onClick={apply} disabled={submitting || !canApply}>
                  {submitting ? t("roster.import.applying") : t("roster.import.apply")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setStep(unrecognizedCount > 0 ? 2 : 3);
                  }}
                  disabled={!canAdvance}
                >
                  {t("roster.import.next")}
                </Button>
              )}
            </div>
          </div>
        ) : step === 2 ? (
          <div className="flex flex-col gap-4">
            {error && <ErrorState message={error} />}

            <p className="text-[13px] text-secondary">
              <Trans
                i18nKey="roster.import.step2Intro"
                components={{
                  1: <span className="font-medium text-foreground" />,
                  2: <span className="font-medium text-foreground" />,
                  3: <span className="font-medium text-foreground" />,
                }}
              />
            </p>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("roster.import.name")}</TableHead>
                    <TableHead>{t("roster.import.meta")}</TableHead>
                    <TableHead>{t("roster.import.decision")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classified.unrecognized.map((row, i) => {
                    const d = getDecision(row);
                    return (
                      <TableRow key={`${row.governor}-${i}`}>
                        <TableCell className="num font-medium text-foreground">
                          {row.governor}
                        </TableCell>
                        <TableCell className="num text-[12px] text-secondary">
                          {metaLabel(row)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <DecisionSegmented
                              value={d.kind}
                              onChange={(kind) =>
                                setDecision(row, {
                                  kind,
                                  memberId: kind === "alias" ? d.memberId : null,
                                  promote: kind === "alias" ? d.promote : false,
                                })
                              }
                            />
                            {d.kind === "alias" && (
                              <>
                                <MemberSearchSelect
                                  members={members}
                                  value={d.memberId}
                                  onChange={(memberId) =>
                                    setDecision(row, { kind: "alias", memberId, promote: d.promote })
                                  }
                                />
                                <Checkbox
                                  checked={d.promote}
                                  onChange={(promote) =>
                                    setDecision(row, { kind: "alias", memberId: d.memberId, promote })
                                  }
                                >
                                  <span className="text-[12px] text-secondary">
                                    {t("roster.import.makePrimary")}
                                  </span>
                                </Checkbox>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <p className="text-[12px] text-muted">
              <Trans
                i18nKey="roster.import.promoteHelp"
                values={{ label: t("roster.import.makePrimary") }}
                components={{ 1: <span className="font-medium text-secondary" /> }}
              />
            </p>

            {aliasMissingMember && (
              <p className="text-[12px] text-down">
                {t("roster.import.pickMember", { label: t("roster.import.aliasOf") })}
              </p>
            )}
            {classified.conflicts.length > 0 && (
              <p className="text-[12px] text-down">
                {t("roster.import.conflictsStep2", {
                  names: classified.conflicts.map((c) => c.governor).join(", "),
                })}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                disabled={submitting}
              >
                {t("roster.import.back")}
              </Button>
              {!showMembershipStep ? (
                <Button size="sm" onClick={apply} disabled={submitting || !canApply}>
                  {submitting ? t("roster.import.applying") : t("roster.import.apply")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setStep(3);
                  }}
                  disabled={!canAdvance || aliasMissingMember}
                >
                  {t("roster.import.next")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <ErrorState message={error} />}

            {backdated ? (
              <div className="rounded-[10px] border border-border bg-muted-surface p-3 text-[12.5px] text-secondary">
                {t("roster.import.backfill", { date: capturedOn, latest: latestCapture })}
              </div>
            ) : (
              <>
                <p className="text-[13px] text-secondary">
                  <Trans
                    i18nKey="roster.import.step3Intro"
                    components={{ 1: <span className="font-medium text-foreground" /> }}
                  />
                </p>

                {partialPaste && (
                  <Alert variant="warn">
                    <TriangleAlert />
                    <AlertContent>
                      <div>
                        <Trans
                          i18nKey="roster.import.partialPaste"
                          values={{ absent: classified.absent.length, active: activeCount }}
                          components={{
                            1: <span className="num font-semibold" />,
                            2: <span className="num font-semibold" />,
                          }}
                        />
                      </div>
                    </AlertContent>
                  </Alert>
                )}

                {classified.absent.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-secondary">
                        {t("roster.import.absentTitle", { n: classified.absent.length })}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDeactivateIds(
                              Object.fromEntries(classified.absent.map((m) => [m.id, true])),
                            )
                          }
                        >
                          {t("roster.import.deactivateAll")}
                        </Button>
                        {/* The inverse of the bulk action, on the one screen where the mistake is a
                            mass deactivation. Hidden until there is something to clear. */}
                        {classified.absent.some((m) => deactivateIds[m.id]) && (
                          <Button variant="ghost" size="sm" onClick={() => setDeactivateIds({})}>
                            {t("roster.import.clearAll")}
                          </Button>
                        )}
                      </div>
                    </div>
                    <Card className="overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>{t("common.member")}</TableHead>
                            <TableHead>{t("common.rank")}</TableHead>
                            <TableHead className="text-end">
                              {t("roster.import.deactivateHeader")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {classified.absent.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="num font-medium text-foreground">
                                {m.governor}
                              </TableCell>
                              <TableCell className="num text-[12px] text-secondary">
                                {/* Not a real lookup: `classified.absent` holds the very objects from
                                    `members` (filter preserves identity). The find is only here
                                    because `MemberLike` — the structural type roster-paste.ts
                                    classifies against — does not declare `alliance_rank`. */}
                                {members.find((x) => x.id === m.id)?.alliance_rank ?? "—"}
                              </TableCell>
                              <TableCell className="text-end">
                                <div className="flex justify-end">
                                  <Checkbox
                                    checked={deactivateIds[m.id] === true}
                                    onChange={(checked) =>
                                      setDeactivateIds((prev) => ({ ...prev, [m.id]: checked }))
                                    }
                                  >
                                    <span className="sr-only">
                                      {t("roster.aria.deactivate", { governor: m.governor })}
                                    </span>
                                  </Checkbox>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                )}

                {classified.returning.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[12px] font-medium text-secondary">
                      {t("roster.import.returningTitle", { n: classified.returning.length })}
                    </span>
                    <Card className="overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>{t("common.member")}</TableHead>
                            <TableHead className="text-end">
                              {t("roster.import.reactivateHeader")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {classified.returning.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="num font-medium text-foreground">
                                {m.governor}
                              </TableCell>
                              <TableCell className="text-end">
                                <div className="flex justify-end">
                                  <Checkbox
                                    checked={reactivateIds[m.id] !== false}
                                    onChange={(checked) =>
                                      setReactivateIds((prev) => ({ ...prev, [m.id]: checked }))
                                    }
                                  >
                                    <span className="sr-only">
                                      {t("roster.import.reactivateAria", { governor: m.governor })}
                                    </span>
                                  </Checkbox>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null);
                  setStep(unrecognizedCount > 0 ? 2 : 1);
                }}
                disabled={submitting}
              >
                {t("roster.import.back")}
              </Button>
              <Button size="sm" onClick={apply} disabled={submitting || !canApply}>
                {submitting ? t("roster.import.applying") : t("roster.import.apply")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mirrors Events' DeleteEventDialog. Removes one capture date's snapshot rows; `members.*` keep their
 *  last-imported values (spec: not rolled back). */
function DeleteCaptureDialog({
  date,
  count,
  onCancel,
  onDeleted,
}: {
  date: string | null;
  count: number;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (date) {
      setSubmitting(false);
      setError(null);
    }
  }, [date]);

  const confirm = async () => {
    if (!date) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.members.deleteCapture(date);
      onDeleted();
    } catch (e) {
      setError(writeErrorMessage(e, t, "roster.needKey"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={date !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("roster.deleteCaptureTitle")}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="roster.deleteCaptureDesc"
              count={count}
              values={{ date: date ? fmtCaptureDate(date) : "" }}
              components={{ 1: <span className="num" />, 2: <span className="num" /> }}
            />
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorState message={error} />}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            {t("common.actions.cancel")}
          </Button>
          <Button variant="danger" size="sm" onClick={confirm} disabled={submitting}>
            {submitting ? t("common.actions.deleting") : t("roster.deleteUpdate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SORT_OPTIONS: [RosterSort, TKey][] = [
  ["power", "common.power"],
  ["tier", "common.rank"],
  ["movers", "roster.sortMovers"],
  ["status", "roster.sortStatus"],
  ["name", "roster.sortName"],
];

export function Roster() {
  const { t } = useTranslation();
  const { role } = useApiKey();
  const [filter, setFilter] = useState<Filter>("active");
  const [reloadKey, setReloadKey] = useState(0);

  const [sort, setSort] = useState<RosterSort>("power");

  // ONE unfiltered fetch, filtered client-side. The tab badges count the whole roster and both bar
  // scales are computed over it, so neither changes when the operator switches tabs — a per-filter
  // fetch could not do either, because it only ever holds the selected tab's members.
  const membersState = useApi<Member[]>(() => api.members.list(), [reloadKey]);

  // /api/attendance, not /api/rankings/overall: it is a LEFT JOIN over EVERY member
  // (stats-repo.ts:206), where the ranking board is keyed on `active = 1 OR ever scored`
  // (stats-repo.ts:57) — and it is a fraction of the work, since the page needs no scores.
  const attendanceState = useApi<Attendance>(() => api.attendance(), [reloadKey]);

  // Null means "nothing to judge attendance on", and the STATUS column renders a dash for it. Two
  // cases: the fetch has not landed (or failed), or the alliance has logged no events at all — with
  // no event-days every pct is 0 (stats-service.ts:135), which would paint all 86 rows at risk.
  const attendanceByMember = useMemo(() => {
    const data = attendanceState.data;
    if (attendanceState.loading || attendanceState.error || !data || data.total_event_days === 0) return null;
    return new Map(data.rows.map((r) => [r.member_id, r.pct]));
  }, [attendanceState.data, attendanceState.loading, attendanceState.error]);

  // reloadKey is shared with the fetches above — refresh() bumping it re-runs this one too, so an
  // import updates the change columns without a page reload.
  const deltasState = useApi<MemberDelta[]>(() => api.members.deltas(), [reloadKey]);
  const deltaByMember = useMemo(
    () => new Map((deltasState.data ?? []).map((d) => [d.member_id, d])),
    [deltasState.data],
  );

  // null = live view. A past capture date switches the table to the as-of view; selecting the
  // newest capture in the dropdown maps back to null, so "latest" and "live" cannot drift apart.
  const [viewDate, setViewDate] = useState<string | null>(null);

  const capturesState = useApi<{ captures: CaptureSummary[] }>(() => api.members.captureList(), [reloadKey]);
  const captures = capturesState.data?.captures ?? [];
  const latestCaptureDate = captures[0]?.captured_on ?? null;

  const historicalState = useApi<{ rows: CaptureRosterRow[] } | null>(
    () => (viewDate === null ? Promise.resolve(null) : api.members.captureRoster(viewDate)),
    [viewDate],
  );
  const historical = viewDate !== null;

  // Widened to the six-field shape both modes produce. Row action handlers need the full `Member`,
  // so they look it up in memberById instead of taking `row.member` — see the actions cell.
  const allRows = useMemo<RosterRow<RosterMember>[]>(() => {
    if (historical) {
      // useApi keeps prev.data while reloading, so mid-switch this would be the PREVIOUS date's
      // rows under the new date's banner. Mislabeled numbers are worse than a brief blank —
      // nothing on screen marks them stale — so loading/error render as empty.
      const rows = historicalState.loading || historicalState.error ? [] : (historicalState.data?.rows ?? []);
      return buildRosterRows({
        ...captureRosterInput(rows),
        attendance: null, // attendance is season-to-date — not reconstructible as-of a past date
      });
    }
    return buildRosterRows({
      members: membersState.data ?? [],
      deltas: deltaByMember,
      attendance: attendanceByMember,
    });
  }, [historical, historicalState, membersState.data, deltaByMember, attendanceByMember]);

  // Recovers the full `Member` behind a widened row for the action handlers. In live mode every row
  // resolves (rows come from the same array); in historical mode actions are hidden anyway.
  const memberById = useMemo(
    () => new Map((membersState.data ?? []).map((m) => [m.id, m])),
    [membersState.data],
  );

  // Counts describe the LIVE roster in both modes — a capture cannot claim who is active
  // (captureRosterInput fabricates active: 1), and the tabs these feed are live-only.
  const counts = useMemo(() => {
    const ms = membersState.data ?? [];
    return {
      all: ms.length,
      active: ms.filter((m) => m.active === 1).length,
      inactive: ms.filter((m) => m.active === 0).length,
    };
  }, [membersState.data]);

  const summary = useMemo(() => summarizeRoster(allRows), [allRows]);
  const scales = useMemo(() => rosterScales(allRows), [allRows]);
  const topIds = useMemo(() => topPowerIds(allRows, 10), [allRows]);
  // Filtering is a no-op in historical mode: the tabs are hidden, every observed row shows.
  const rows = useMemo(
    () => sortRows(historical ? allRows : filterRows(allRows, filter), sort),
    [allRows, historical, filter, sort],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importInitial, setImportInitial] = useState<{ capturedOn: string; text: string } | null>(null);
  const [deleteDate, setDeleteDate] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [renameMember, setRenameMember] = useState<Member | null>(null);
  const [mergeMember, setMergeMember] = useState<Member | null>(null);
  const [deactivateMember, setDeactivateMember] = useState<Member | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => setReloadKey((k) => k + 1);

  // The capture the admin is looking at: the selected date, or the latest in live mode.
  const shownCapture = viewDate ?? latestCaptureDate;

  const editCapture = async () => {
    if (!shownCapture) return;
    setRowError(null);
    try {
      const { rows } = await api.members.captureRoster(shownCapture);
      setImportInitial({ capturedOn: shownCapture, text: serializeRoster(rows) });
      setImportOpen(true);
    } catch (e) {
      setRowError(writeErrorMessage(e, t, "roster.needKey"));
    }
  };

  const activate = async (m: Member) => {
    setRowError(null);
    try {
      await api.members.update(m.id, { active: 1 });
      setNote(t("roster.notes.activated", { governor: m.governor }));
      refresh();
    } catch (e) {
      setRowError(writeErrorMessage(e, t, "roster.needKey"));
    }
  };

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <RosterStats summary={summary} />

      {note && (
        <div className="flex items-center justify-between rounded-[6px] border border-up/20 bg-up/5 px-3 py-2 text-[13px] text-up">
          <span>{note}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted hover:text-foreground"
            onClick={() => setNote(null)}
          >
            {t("common.actions.dismiss")}
          </Button>
        </div>
      )}

      {rowError && <ErrorState message={rowError} />}

      <Card className="overflow-hidden">
        <CardHeader className="flex-col items-stretch gap-3 border-b border-border md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-0.5">
            <CardTitle>{t("roster.title")}</CardTitle>
            <span className="text-[12px] text-muted">
              {[
                t("roster.memberCount", { count: counts.all }),
                t("roster.activeCount", { n: counts.active }),
                latestCaptureDate ? t("roster.lastImport", { date: fmtCaptureDate(latestCaptureDate) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {captures.length > 0 && (
              <Select
                value={viewDate ?? latestCaptureDate ?? undefined}
                onValueChange={(v) => setViewDate(v === latestCaptureDate ? null : v)}
              >
                {/* Not <SelectValue/>: Radix mirrors the selected item's full text into the trigger,
                    and the item line carries "· latest · N members" noise the trigger doesn't need. */}
                <SelectTrigger className="w-44">
                  <CalendarDays className="me-1.5 size-4 shrink-0 text-muted" />
                  <span className="num">{fmtCaptureDate(viewDate ?? latestCaptureDate!)}</span>
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-1 pt-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-faint">
                    {t("roster.updates")}
                  </div>
                  {captures.map((s) => (
                    // One line, not the mockup's two: SelectItem is fixed h-8 and a stacked child
                    // would clip. "· latest" marks the entry that maps back to the live view.
                    <SelectItem key={s.captured_on} value={s.captured_on} className="num">
                      {[
                        fmtCaptureDate(s.captured_on),
                        s.captured_on === latestCaptureDate ? t("roster.latest") : null,
                        t("roster.memberCount", { count: s.members }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {role === "admin" && shownCapture && (
              <>
                <Button variant="secondary" size="sm" className="h-10 md:h-8" onClick={editCapture}>
                  <Pencil />
                  {t("roster.editUpdate")}
                </Button>
                <Button variant="secondary" size="sm" className="h-10 md:h-8" onClick={() => setDeleteDate(shownCapture)}>
                  <Trash2 />
                  {t("roster.deleteUpdate")}
                </Button>
              </>
            )}
            {role === "admin" && (
              <Button
                variant="secondary"
                size="sm"
                className="h-10 flex-1 md:h-8 md:flex-none"
                onClick={() => {
                  setImportInitial(null);
                  setImportOpen(true);
                }}
              >
                <Upload />
                {t("roster.importTsv")}
              </Button>
            )}
            <Button size="sm" className="h-10 flex-1 md:h-8 md:flex-none" onClick={() => setAddOpen(true)}>
              <Plus />
              {t("roster.addTitle")}
            </Button>
          </div>
        </CardHeader>

        {historical && (
          <div className="border-b border-border bg-muted-surface px-4 py-2 text-[12.5px] text-secondary">
            {t("roster.viewingCapture", { date: fmtCaptureDate(viewDate!) })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          {!historical ? (
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                {(["active", "inactive", "all"] as const).map((key) => (
                  // inline-flex is load-bearing: TabsTrigger's base classes set no display, so `gap`
                  // on a plain inline button is a no-op and the count would sit flush to the label.
                  <TabsTrigger key={key} value={key} className="inline-flex items-center gap-1.5">
                    {key === "all"
                      ? t("roster.filterAll")
                      : key === "active"
                        ? t("roster.status.active")
                        : t("roster.status.inactive")}
                    <span className="num rounded-[4px] bg-muted-surface px-1.5 text-[10.5px] font-semibold text-faint">
                      {counts[key]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <span className="text-[12px] text-muted">{t("roster.observed", { count: rows.length })}</span>
          )}

          <div className="md:hidden">
            <Select value={sort} onValueChange={(v) => setSort(v as RosterSort)}>
              <SelectTrigger
                className="h-[30px] gap-1.5 px-2.5 text-[12px] font-semibold text-secondary"
                aria-label={t("roster.sort")}
              >
                <ArrowUpDown className="size-3.5 text-muted" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-faint">
              {t("roster.sort")}
            </span>
            <Tabs value={sort} onValueChange={(v) => setSort(v as RosterSort)}>
              <TabsList>
                {SORT_OPTIONS.map(([value, label]) => (
                  <TabsTrigger key={value} value={value}>
                    {t(label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {(historical ? historicalState.error : membersState.error) ? (
          <div className="p-4">
            <ErrorState message={(historical ? historicalState.error : membersState.error)!} />
          </div>
        ) : (historical ? historicalState.loading : membersState.loading) ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState message={historical ? t("roster.emptyCapture") : t("roster.emptyFilter")} />
        ) : (
          <>
            <div className="md:hidden">
              {rows.map((r) => {
                const id = r.member.id;
                const live = historical ? undefined : memberById.get(id);
                // Live deltas describe the live view only; a past capture has no per-member "since".
                const since = historical ? null : (deltaByMember.get(id)?.since ?? null);
                return (
                  <RosterMobileRow
                    key={id}
                    row={r}
                    live={live}
                    top={topIds.has(id)}
                    maxPower={scales.maxPower}
                    maxAbsDelta={scales.maxAbsDelta}
                    since={since ? fmtCaptureDate(since) : null}
                    expanded={expandedId === id}
                    onToggle={() => setExpandedId((cur) => (cur === id ? null : id))}
                    isAdmin={role === "admin"}
                    onEdit={setEditMember}
                    onRename={setRenameMember}
                    onMerge={setMergeMember}
                    onDeactivate={setDeactivateMember}
                    onActivate={activate}
                  />
                );
              })}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[52px] text-end">#</TableHead>
                    <TableHead>{t("common.member")}</TableHead>
                    <TableHead className="w-16 text-center">{t("common.rank")}</TableHead>
                    <TableHead className="w-[190px] text-end">{t("common.power")}</TableHead>
                    {/* The two columns the page exists for get a darker header and a group separator. */}
                    <TableHead className="w-[200px] border-s border-muted-surface text-end text-foreground">
                      {t("roster.changeInPower")}
                    </TableHead>
                    <TableHead className="w-[86px] text-center text-foreground">{t("roster.move")}</TableHead>
                    <TableHead className="w-28 border-s border-muted-surface">{t("roster.sortStatus")}</TableHead>
                    {!historical && <TableHead className="w-[104px] text-end">{t("roster.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const m = r.member;
                    // The full `Member` for the action handlers — rows are widened to the six-field
                    // shape. Always resolves in live mode; historical hides the actions cell entirely.
                    const live = historical ? undefined : memberById.get(m.id);
                    const top = topIds.has(m.id);
                    return (
                      <TableRow key={m.id} className={rowClass(r)}>
                        <TableCell
                          className={cn(
                            "num text-end font-bold",
                            top ? "text-foreground" : "text-faint",
                            riskEdgeClass(r),
                          )}
                        >
                          {m.power_position === null ? "—" : `#${m.power_position}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={m.governor} size={28} />
                            {/* `from` tags the origin so the profile's back link returns here rather
                                than to the public members list, which would drop an admin mid-review
                                out of the admin area. See MemberProfile's ORIGINS. */}
                            <Link
                              to={`/members/${m.id}`}
                              state={{ from: "roster" }}
                              className="text-[13.5px] font-semibold text-foreground transition-colors hover:text-accent"
                            >
                              {m.governor}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {/* relative anchor for the change badge riding the chip's corner */}
                          <span className="relative inline-flex">
                            <RankChip rank={m.alliance_rank} />
                            <RankChangeChip change={r.rankChange} />
                          </span>
                        </TableCell>
                        <TableCell className="text-end">
                          <PowerCell power={m.power} maxPower={scales.maxPower} top={top} />
                        </TableCell>
                        <TableCell className="border-s border-muted-surface text-end">
                          <PowerChangeCell delta={r.deltaPower} maxAbsDelta={scales.maxAbsDelta} />
                        </TableCell>
                        <TableCell className="text-center">
                          <MoveCell move={r.move} />
                        </TableCell>
                        <TableCell className="border-s border-muted-surface">
                          <StatusCell status={r.status} />
                        </TableCell>
                        {live && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-faint hover:text-foreground"
                                aria-label={t("roster.aria.edit", { governor: live.governor })}
                                onClick={() => setEditMember(live)}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-faint hover:text-foreground"
                                aria-label={t("roster.aria.rename", { governor: live.governor })}
                                onClick={() => setRenameMember(live)}
                              >
                                <Tag />
                              </Button>
                              {role === "admin" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-faint hover:text-foreground"
                                  aria-label={t("roster.aria.merge", { governor: live.governor })}
                                  onClick={() => setMergeMember(live)}
                                >
                                  <Merge />
                                </Button>
                              )}
                              {live.active === 1 ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-faint hover:text-down"
                                  aria-label={t("roster.aria.deactivate", { governor: live.governor })}
                                  onClick={() => setDeactivateMember(live)}
                                >
                                  <UserMinus />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-faint hover:text-foreground"
                                  aria-label={t("roster.aria.activate", { governor: live.governor })}
                                  onClick={() => activate(live)}
                                >
                                  <UserCheck />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <RosterLegend shown={rows.length} />
          </>
        )}
      </Card>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={(governor) => {
          setAddOpen(false);
          setNote(t("roster.notes.added", { governor }));
          refresh();
        }}
      />

      <ImportRosterDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        initial={importInitial}
        onApplied={() => {
          setNote(importInitial ? t("roster.notes.updateSaved") : t("roster.notes.imported"));
          // A fresh import lands on the live view; an edited backdated capture stays in view.
          setViewDate(
            importInitial && importInitial.capturedOn !== latestCaptureDate ? importInitial.capturedOn : null,
          );
          refresh();
        }}
      />
      <DeleteCaptureDialog
        date={deleteDate}
        count={captures.find((c) => c.captured_on === deleteDate)?.members ?? 0}
        onCancel={() => setDeleteDate(null)}
        onDeleted={() => {
          setDeleteDate(null);
          setNote(t("roster.notes.deletedUpdate", { date: deleteDate ? fmtCaptureDate(deleteDate) : "" }));
          setViewDate(null);
          refresh();
        }}
      />

      <EditMemberDialog
        member={editMember}
        onCancel={() => setEditMember(null)}
        onSuccess={(governor) => {
          setEditMember(null);
          setNote(t("roster.notes.saved", { governor }));
          refresh();
        }}
      />

      <RenameMemberDialog
        member={renameMember}
        onCancel={() => setRenameMember(null)}
        onSuccess={(governor) => {
          setRenameMember(null);
          setNote(t("roster.notes.renamed", { governor }));
          refresh();
        }}
      />

      <MergeMemberDialog
        member={mergeMember}
        members={membersState.data ?? []}
        onCancel={() => setMergeMember(null)}
        onSuccess={(result) => {
          setMergeMember(null);
          setNote(t("roster.notes.merged", { governor: result.member.governor }));
          refresh();
        }}
      />

      <DeactivateDialog
        member={deactivateMember}
        onCancel={() => setDeactivateMember(null)}
        onDone={(governor) => {
          setDeactivateMember(null);
          setNote(t("roster.notes.deactivated", { governor }));
          refresh();
        }}
      />
    </div>
  );
}
