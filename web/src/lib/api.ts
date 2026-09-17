// Typed API client over the Worker's /api surface. Shares the SAME types the backend
// uses (shared/types.ts) — no codegen. Every request attaches the API key: reads need the
// viewer tier or better, writes need manager/admin.
import type {
  ActivityDetail,
  ActivityType,
  Alias,
  Allocation,
  AllocationInput,
  AllocationPreview,
  AllocationWithLines,
  Attendance,
  CaptureRosterRow,
  CaptureSummary,
  DiscordRole,
  DiscordWebhook,
  Event,
  EventListRow,
  Member,
  MemberDelta,
  MemberProfile,
  MemberSnapshotSeries,
  MessageTemplate,
  NewActivityType,
  NotificationInput,
  EventNotification,
  ScheduleEventInput,
  ScheduleLanguages,
  ScheduleReadModel,
  ScheduleStatus,
  ScheduledEventWithNotifications,
  WebhookInput,
  NewAlias,
  OverallRanking,
  Overview,
  RankBands,
  RosterImportBatch,
  RosterImportResult,
  ScreenshotReadResult,
  ScreenshotUsage,
  WeeklyRanking,
} from "@shared/types";

const BASE = "/api";
const API_KEY_STORAGE = "ic_api_key";

// ---- Types the backend exposes at the service layer but doesn't re-export in shared/types.ts.
// Mirrored here so the client surface is fully typed for later tasks.

/** A participation joined to its resolved member (governor NULL when unmapped). */
export type EventParticipationRow = {
  id: number;
  raw_name: string;
  member_id: number | null;
  governor: string | null;
  value: number;
  points: number;
  notes: string | null;
};

export type EventDetail = { event: Event; participations: EventParticipationRow[] };

/** Ingest payload for creating/updating an event batch. */
export type IngestRow = { raw_name: string; value: number; notes?: string | null };
export type IngestDto = {
  activity: string;
  date: string;
  instance?: number;
  rows: IngestRow[];
};
export type IngestResult = {
  event: Event;
  rows: EventParticipationRow[];
  skipped: { raw_name: string; value: number }[];
  unmapped: string[];
};

export type ScoringTierInput = { min_value: number; points: number };
export type ScoringConfig = { weight: number; tiers: ScoringTierInput[] };

/** Result of a canonical rename: the updated member, whether the old name became an alias, optional warning. */
export type RenameResult = { member: Member; addedAlias: boolean; warning?: string };
export type MergeResult = { member: Member; movedAliases: number; addedAlias: boolean; recomputed: number };

/** A retroactive conflict a resolution change introduced into the existing participation set. */
export type AliasConflict =
  | { type: "within_event_duplicate"; event_id: number; member_id: number; raw_names: string[] }
  | { type: "two_trap_overlap"; activity_type_id: number; date: string; raw_names: string[] };

/** Result of adding/removing an alias: the affected alias (add only), rows re-scored, and any new conflicts. */
export type AliasChangeResult = { alias?: Alias; recomputed: number; conflicts: AliasConflict[] };

export type UnmappedRow = {
  raw_name: string;
  appearances: { event_id: number; activity: string; date: string; instance: number }[];
};

export type EventFilter = {
  activity?: string;
  week?: string;
  from?: string;
  to?: string;
};

export type ImportResult = {
  imported: Record<string, number>;
  recomputed: boolean;
  error?: string;
};

export type AuthMe = { role: "admin" | "manager" | "viewer" | null; scheduler: boolean };

// ---- Error + transport ------------------------------------------------------

/** Thrown on any non-2xx response, carrying the server's `{ error }` message + status. `body` is the
 *  parsed JSON when there was one, for callers that need more than the message (screenshot usage). */
export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    let body: unknown;
    try {
      body = await res.json();
      const err = (body as { error?: string })?.error;
      if (err) message = err;
    } catch {
      // Non-JSON error body — keep the status-derived message.
    }
    throw new ApiError(message, res.status, body);
  }
  // 204 / empty bodies resolve to undefined-as-T.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Auth header for the stored key, or nothing when unset (the server answers 401 and the gate shows). */
function authHeaders(): Record<string, string> {
  const key = localStorage.getItem(API_KEY_STORAGE) ?? "";
  return key ? { "X-Api-Key": key } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json", ...authHeaders() },
  });
  return parse<T>(res);
}

type WriteMethod = "POST" | "PATCH" | "PUT" | "DELETE";

async function write<T>(method: WriteMethod, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

/** Multipart POST. No Content-Type header: the browser sets it with the boundary. */
async function writeForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", ...authHeaders() },
    body: form,
    signal,
  });
  return parse<T>(res);
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
  return `?${search.toString()}`;
}

// ---- Endpoint surface -------------------------------------------------------

export const api = {
  rankings: {
    weekly: (week?: string, activity?: string) =>
      get<WeeklyRanking>(`/rankings/weekly${qs({ week, activity })}`),
    overall: (activity?: string) => get<OverallRanking>(`/rankings/overall${qs({ activity })}`),
  },
  settings: {
    rankBands: () => get<RankBands>("/settings/rank-bands"),
    saveRankBands: (bands: RankBands) => write<RankBands>("PUT", "/settings/rank-bands", bands),
  },
  weeks: () => get<string[]>("/weeks"),
  overview: () => get<Overview>("/overview"),
  // No args = all-time / all activities, the shape every non-Attendance caller wants.
  attendance: (week?: string, activity?: string) => get<Attendance>(`/attendance${qs({ week, activity })}`),
  authMe: () => get<AuthMe>("/auth/me"),

  members: {
    list: (opts?: { active?: boolean }) => get<Member[]>(`/members${qs({ active: opts?.active })}`),
    get: (id: number) => get<Member>(`/members/${id}`),
    profile: (id: number) => get<MemberProfile>(`/members/${id}/profile`),
    captures: (date: string) =>
      get<{ captured_on: string; count: number; latest: string | null }>(`/members/captures/${date}`),
    captureList: () => get<{ captures: CaptureSummary[] }>("/members/captures"),
    captureRoster: (date: string) =>
      get<{ rows: CaptureRosterRow[] }>(`/members/captures/${date}/roster`),
    deltas: () => get<MemberDelta[]>("/members/deltas"),
    snapshots: (id: number) => get<MemberSnapshotSeries>(`/members/${id}/snapshots`),
    create: (body: Partial<Member> & { governor: string }) => write<Member>("POST", "/members", body),
    // governor is rejected by the API — renaming must go through rename() so the alias is kept
    update: (id: number, body: Omit<Partial<Member>, "governor">) =>
      write<Member>("PATCH", `/members/${id}`, body),
    rename: (id: number, governor: string, opts?: { addAlias?: boolean }) =>
      write<RenameResult>("POST", `/members/${id}/rename`, { governor, addAlias: opts?.addAlias }),
    // merge :id (the duplicate) into another member — admin only, deletes the source
    merge: (id: number, into: number) => write<MergeResult>("POST", `/members/${id}/merge`, { into }),
    import: (batch: RosterImportBatch) => write<RosterImportResult>("POST", "/members/import", batch),
    deleteCapture: (date: string) => write<{ ok: true }>("DELETE", `/members/captures/${date}`),
  },

  aliases: {
    list: (opts?: { member_id?: number }) => get<Alias[]>(`/aliases${qs({ member: opts?.member_id })}`),
    add: (body: Pick<NewAlias, "alias" | "member_id"> & { note?: string | null }) =>
      write<AliasChangeResult>("POST", "/aliases", body),
    remove: (id: number) => write<AliasChangeResult>("DELETE", `/aliases/${id}`),
  },

  unmapped: () => get<UnmappedRow[]>("/unmapped"),

  screenshots: {
    usage: () => get<ScreenshotUsage>("/screenshots/usage"),
    read: (form: FormData, signal?: AbortSignal) => writeForm<ScreenshotReadResult>("/screenshots/read", form, signal),
  },

  // Path is /ingests, not /events: ad-block filter lists treat `/api/event(s)` as an analytics
  // endpoint and cancel the request client-side (ERR_BLOCKED_BY_CLIENT), which broke the Events
  // and Overview pages in production. Keep any future path off that word.
  events: {
    list: (filter?: EventFilter) => get<EventListRow[]>(`/ingests${qs({ ...filter })}`),
    get: (id: number) => get<EventDetail>(`/ingests/${id}`),
    create: (body: IngestDto) => write<IngestResult>("POST", "/ingests", body),
    update: (id: number, body: IngestDto) => write<IngestResult>("PATCH", `/ingests/${id}`, body),
    delete: (id: number) => write<{ ok: true }>("DELETE", `/ingests/${id}`),
  },

  activityTypes: {
    list: (opts?: { active?: boolean }) =>
      get<ActivityType[]>(`/activity-types${qs({ active: opts?.active })}`),
    get: (id: number) => get<ActivityType>(`/activity-types/${id}`),
    create: (body: NewActivityType) => write<ActivityType>("POST", "/activity-types", body),
    update: (id: number, body: Partial<ActivityType>) =>
      write<ActivityType>("PATCH", `/activity-types/${id}`, body),
    getScoring: (id: number) => get<ScoringConfig>(`/activity-types/${id}/scoring`),
    putScoring: (id: number, body: ScoringConfig) =>
      write<ScoringConfig>("PUT", `/activity-types/${id}/scoring`, body),
  },

  activities: {
    detail: (key: string) => get<ActivityDetail>(`/activities/${encodeURIComponent(key)}`),
  },

  // Admin-key only (requireAdmin on every route).
  allocations: {
    preview: (input: AllocationInput) => write<AllocationPreview>("POST", "/admin/allocations/preview", input),
    create: (input: AllocationInput) => write<AllocationWithLines>("POST", "/admin/allocations", input),
    list: () => get<Allocation[]>("/admin/allocations"),
    get: (id: number) => get<AllocationWithLines>(`/admin/allocations/${id}`),
    updateTitle: (id: number, title: string) => write<Allocation>("PATCH", `/admin/allocations/${id}`, { title }),
    delete: (id: number) => write<{ ok: true }>("DELETE", `/admin/allocations/${id}`),
  },

  // Read model for every tier; writes are admin-key only and 404 when the deployment has no scheduler.
  schedule: {
    read: () => get<ScheduleReadModel>("/schedule"),
    status: () => get<ScheduleStatus>("/admin/schedule/status"),
    languages: () => get<ScheduleLanguages>("/admin/schedule/languages"),
    saveLanguages: (languages: string[]) =>
      write<ScheduleLanguages>("PUT", "/admin/schedule/languages", { languages }),
    webhooks: () => get<DiscordWebhook[]>("/admin/schedule/webhooks"),
    addWebhook: (body: WebhookInput) => write<DiscordWebhook>("POST", "/admin/schedule/webhooks", body),
    deleteWebhook: (id: number) => write<{ ok: true }>("DELETE", `/admin/schedule/webhooks/${id}`),
    roles: () => get<DiscordRole[]>("/admin/schedule/roles"),
    addRole: (body: { name: string; role_id: string }) => write<DiscordRole>("POST", "/admin/schedule/roles", body),
    deleteRole: (id: number) => write<{ ok: true }>("DELETE", `/admin/schedule/roles/${id}`),
    templates: () => get<MessageTemplate[]>("/admin/schedule/templates"),
    addTemplate: (body: { name: string; texts: Record<string, string> }) =>
      write<MessageTemplate>("POST", "/admin/schedule/templates", body),
    updateTemplate: (id: number, body: { name?: string; texts?: Record<string, string> }) =>
      write<MessageTemplate>("PUT", `/admin/schedule/templates/${id}`, body),
    translateTemplate: (id: number) => write<MessageTemplate>("POST", `/admin/schedule/templates/${id}/translate`),
    deleteTemplate: (id: number) => write<{ ok: true }>("DELETE", `/admin/schedule/templates/${id}`),
    events: () => get<ScheduledEventWithNotifications[]>("/admin/schedule/events"),
    addEvent: (body: ScheduleEventInput) =>
      write<ScheduledEventWithNotifications>("POST", "/admin/schedule/events", body),
    updateEvent: (id: number, body: Partial<ScheduleEventInput>) =>
      write<ScheduledEventWithNotifications>("PUT", `/admin/schedule/events/${id}`, body),
    deleteEvent: (id: number) => write<{ ok: true }>("DELETE", `/admin/schedule/events/${id}`),
    addNotification: (eventId: number, body: NotificationInput) =>
      write<EventNotification>("POST", `/admin/schedule/events/${eventId}/notifications`, body),
    updateNotification: (id: number, body: NotificationInput) =>
      write<EventNotification>("PUT", `/admin/schedule/notifications/${id}`, body),
    deleteNotification: (id: number) => write<{ ok: true }>("DELETE", `/admin/schedule/notifications/${id}`),
    testNotification: (id: number) => write<{ ok: true }>("POST", `/admin/schedule/notifications/${id}/test`),
  },

  admin: {
    recompute: () => write<{ recomputed: number }>("POST", "/admin/recompute"),
    // Returns raw text (a JSON backup file), so it can't go through `get()`'s typed parse.
    export: async (): Promise<string> => {
      const res = await fetch(`${BASE}/admin/export`, {
        headers: { Accept: "application/json", ...authHeaders() },
      });
      if (!res.ok) return parse<never>(res); // throws ApiError with the server message
      return res.text();
    },
    import: (parsed: unknown) => write<ImportResult>("POST", "/admin/import", parsed),
  },
};

export { API_KEY_STORAGE };
