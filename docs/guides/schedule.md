# Schedule

Recurring in-game events with automatic Discord reminders. You describe when an event repeats, attach
as many reminders as you want, and the app posts each one to a Discord channel at the right moment,
pinging the roles you chose, in every language your alliance reads.

The section is **opt-in per deployment**. It only appears when the operator has enabled it (see
*Turning it on* below). Admins can change everything; managers see the events list read-only.

## What you see

Schedule lives under **Admin → Schedule**. Three tabs, plus a small **Last checked** pill on the
right that shows when the background job last ran — green when it ran in the last five minutes, red
when it has not run recently or never (the reminders are not going out).

- **Events** — one row per recurring event: name, linked activity (optional), how often it repeats
  ("every 2 days", "every 4 weeks"), how long it lasts ("all day", "3 h", or "—" for an instant event),
  the next occurrence in *your* local time with a relative hint, an on/off switch, and how many
  reminders are attached. Click a row to expand its reminders: the channel, the roles it pings, when it
  fires ("15 min before", "at start", "2 h after start"), which message it uses, and when it last
  fired with a delivered/failed dot. Each reminder has a **Test** button that posts it right now.
- **Messages** — the reusable reminder texts. Four defaults ship with the app (**Get ready**,
  **Almost time**, **Starting**, **Ongoing**); you can edit them but not delete them, and add your own.
  Every message exists once per posted language; a message missing a language shows a
  **not translated** badge.
- **Discord** — three cards: **Channels** (the Discord webhooks the app posts to), **Roles** (the
  Discord roles it can ping), and **Languages** (the ordered list every reminder is posted in).

## How to

**Set up Discord (once)**

1. In Discord, open the channel → *Edit channel* → *Integrations* → *Webhooks* → *New webhook* →
   *Copy webhook URL*.
2. In **Discord → Channels → + Add**, give it a name (e.g. `#announcements`) and paste the URL. The
   app calls Discord once to confirm the webhook works and to learn which channel it posts to. The
   token is stored server-side and never shown again — only its last four characters.
3. For every role you may want to ping: Discord → *Server settings* → *Roles* → ⋯ → *Copy role ID*
   (Developer Mode must be on). Add it under **Roles** with a friendly name.
4. Under **Languages**, add or remove languages. English is always first and cannot be removed. Any
   two-letter language code works; the common ones get a flag in the post, others get the code.

**Create an event**

1. **Events → Add event**. Name it, optionally link it to a tracked activity (it just shows the badge).
2. Pick the **first occurrence** as a date and time in your own timezone. The dialog shows the UTC
   time it will be stored as. Every later occurrence is the same instant plus the repeat interval, so
   daylight-saving changes never shift it.
3. Choose **Repeat every** N days or weeks. "Every Tuesday" is *every 1 week* from a Tuesday. An event
   on two weekdays is two events.
4. Tick **All day** for events that run the whole day, or type a **Duration** in hours. Leave the
   duration empty for an instant event like a Bear Trap opening.

**Add reminders**

1. Expand the event → **Add reminder**.
2. Pick the channel, tick the roles to ping (none is fine), and set **when**: N minutes before the
   start, or, for events with a duration, N minutes *after* the start (a midday nudge during an
   all-day event). `0` = at the start.
3. Pick a **message** or leave it on *default*. The default picks by timing: after start → Ongoing,
   at start → Starting, five minutes or less before → Almost time, otherwise → Get ready.
4. Add as many reminders as you like — or none. An event with no reminders is tracked but posts nothing.
5. Click **Test** on a reminder to post it immediately and check the channel, roles and wording.

**Write a message**

1. **Messages → Add message** (or the pencil on an existing one).
2. Type the English text. The chips insert the placeholders: `{event}` (the event name), `{time}`
   (the start, shown by Discord as "in 15 minutes" in each reader's own clock and language) and
   `{end}` (the end of the event, or the start again for instant events).
3. Save, then open it again and press **Translate from English**: the AI fills in every configured
   language that is still empty. Edit any of them by hand afterwards. The preview at the bottom shows
   what each language line will look like.

**Pause or remove**

- Flip the switch on an event row to pause it; nothing posts while it is off.
- Delete a reminder, event, message, channel or role from its trash icon. Deleting a channel stops
  every reminder that used it; deleting a message sends its reminders back to the default.

## How it works

- A Cloudflare Cron Trigger runs the Worker once a minute. It computes which reminders are due in the
  last two minutes, claims each one in a sent log so a reminder is never posted twice, and posts it.
- One Discord message per reminder: a line of role mentions (if any), then one line per configured
  language, each prefixed by its flag. Only the roles you picked are pingable — a message that
  contains `@everyone` as text does not ping everyone.
- Failed posts (a deleted webhook, Discord being down) are logged with a red dot and **not retried**.
  A late reminder is worse than a missed one; the next occurrence tries again.
- **Translate** uses the same Workers AI allowance as the screenshot reader. It only translates the
  languages that are empty, keeps the placeholders intact, and refuses a translation that drops one.
- The **Last checked** time is written every time the job runs, whether or not anything fired.

## Turning it on

The operator adds two commented-out blocks in `wrangler.toml` (see `wrangler.toml.example`): the
`[triggers] crons` line, which is what makes the job run, and `SCHEDULER_ENABLED = "true"`, which is
what shows the section. Without the cron nothing runs and nothing is billed. `NOTIFY_LANGUAGES`
in the same block sets the default language list; the in-app **Languages** card overrides it.

## Gotchas

- Times are stored in UTC and shown in your browser's timezone. Two officers in different zones see
  different local times for the same event — that is expected.
- "After start" reminders must fall inside the event's duration; the dialog blocks anything later.
- Webhook tokens are secrets: anyone with the URL can post to that channel. They are included in
  backup exports (admin-only), so treat backup files accordingly.
- The cron is one invocation per minute per deployment, about 1,440 a day, well inside the free
  Workers allowance — but it runs whether or not any event exists. Deployments that do not use
  reminders should leave the cron commented out.

## See also

- [Events](events.md) — logging what actually happened, which is separate from scheduling it.
- [Scoring](scoring.md) — the activity types an event can link to.
- [Backup](backup.md) — the six schedule tables are part of the export.
