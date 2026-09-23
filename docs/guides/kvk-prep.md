# KvK Prep

A shared booking grid for the 5-day KvK Prep event, where players are appointed to one of two
in-game positions for 30-minute slots. Other alliances taking part book their own slots through
**alliance access keys** — temporary keys, scoped to this section and to one alliance, that the
admin hands out.

| Position | Boosts |
| --- | --- |
| Chief Minister | Construction, Research & Training Speed +15% |
| Noble Advisor | Training Speed +75%, Training Capacity +300 |

| Day | Theme | Default key position |
| --- | --- | --- |
| 1 | Construction | Chief Minister |
| 2 | Research | Chief Minister |
| 3 | Training | Noble Advisor |
| 4 | No focus | — |
| 5 | Final Push | Chief Minister |

The key position and which positions get a column are set per day in Event settings, not fixed —
the table above is only the default.

The grid is 5 days × 2 positions × 48 slots = **480 slots** with the defaults; the themed days'
focus position adds up to **192** of those. All times are UTC, and the header counts follow the
current per-day configuration, not always these defaults.

## What you see

KvK Prep lives at **KvK Prep** in the sidebar (admin, manager, viewer) or as a key holder's only
page. Admins get three tabs — **Schedule**, **Access keys** (with a count badge), **Event
settings** — managers and viewers see the schedule only, read-only.

- **Header** — the event's date range, a status pill (**Day N live**, **Starts in N d**,
  **Ended**, or **Not scheduled**), how many of the 480 slots are filled and how many of the 192
  focus slots, and a legend chip per alliance with its slot count. A key holder's own chip is
  marked "(you)" and sorts first; if the event hides other alliances' details, a single "Filled by
  others" chip replaces them.
- **Position strip** — the two positions and their boosts, above the grid.
- **The grid** — desktop shows all 5 days at once (sticky day/time header, sticky time column);
  a phone shows one day at a time, picked from a row of day chips, with the player-ID line dropped
  from each cell. A free slot is empty and clickable; a filled slot shows the alliance colour, the
  player ID and name. The current day is highlighted and a "Now" row tracks the live slot, both
  recomputed every 30 seconds, alongside the board refresh.
- **Access keys** (admin) — a table (cards on phone) of every alliance: colour, name,
  representative, masked key, slot count, last used, and Key/Link copy buttons.
- **Event settings** (admin) — the enable toggle, start date with a preview of all 5 days (each with
  a key-position picker and per-position show/hide toggles), the "other alliances' slots"
  visibility choice, and Clear schedule.
- A key holder signed in while the event is off sees a closed card instead of the schedule; an
  admin sees a warning banner on the Schedule tab instead, with everything still usable for them.

## How to

**Set up an alliance (admin)**

1. **Access keys → New key**. Give it the alliance's name, a representative, and a colour (colours
   already used by another alliance are dimmed).
2. **Create key** reveals the plaintext key. **Copy key** or **Copy sign-in link**
   (`https://<your-domain>/?key=<key>`) and send it to the representative — opening the link signs
   them straight in, or they can paste the key into the login screen's key field. You can copy the
   key or link again later from the keys table.
3. Admin bookings need an alliance too, so create a key for your own alliance the same way before
   booking its slots.
4. Editing a key changes its name/representative/colour only, not the key value. **Delete key**
   removes it from the picker; its existing bookings stay on the schedule, relabelled **Deleted
   key**.

**Turn the event on and schedule it (admin)**

1. **Event settings → Enable KvK Prep** opens the section to access keys; off, keys can't sign in
   but bookings are kept.
2. Set **Event start** — day 1 begins at 00:00 UTC on that date, and the event runs 5 days.
3. For each day, pick its **key position** (Chief Minister, Noble Advisor, or None) and hide the
   positions nobody books that day — e.g. Day 1 Noble Advisor, if only Chief Minister is used.
   Picking a key position auto-shows it, and you can't hide the key position itself — choose None or
   a different key first. Deselecting both positions (with key set to None) hides the whole day: it
   drops off the schedule grid and the phone day picker, and the day card shows a "Hidden" badge.
   Hidden bookings are kept and reappear when the position (or day) is shown again; the settings
   note under the day cards counts them ("N booked slots are in hidden positions").
4. Choose what key holders see of **other alliances' slots**: **Show all** (alliance, colour,
   player ID and name) or **Filled only** (just that the slot is taken). A holder's own slots
   always show full detail either way.
5. **Clear schedule** deletes every appointment — use it between KvK events. It needs confirming
   and can't be undone.

**Book or edit a slot (admin or key holder)**

1. Click any slot. An admin picks which alliance to book it for; a key holder's alliance is locked
   in.
2. Enter the player's ID (digits only) and name, then **Appoint**. Editing an existing slot works
   the same way — the alliance can't be changed by a key holder, only by an admin.
3. **Remove** clears a slot back to free. A key holder can only edit or remove their own alliance's
   slots; other alliances' slots are read-only to them.
4. If someone else books the slot first, saving returns a **Slot taken** toast and the board
   refreshes to show the new state.

**Sign in as a key holder / sign out**

- Paste the key into the key field on the login screen, or open the `/?key=` sign-in link, which
  signs the holder in directly — no field to fill in or submit.
- The top bar shows the alliance's colour, name and masked key. **Sign out** clears the key and
  returns to the login prompt.
- Opening a sign-in link replaces whatever key is already stored in that browser — an admin who
  opens a holder's link to test it is signed out of admin and into that alliance's key until they
  sign back in with their own.

## How it works

- **Access:** admin has full read/write. Manager and viewer can read the schedule in full detail;
  the Access keys and Event settings tabs are hidden from them, and any write is rejected. A key
  holder can only reach this section — every other page redirects to it — and can only write within
  their own alliance's slots.
- **Refresh:** the board polls every 30 seconds, and reloads immediately after your own booking,
  edit, or removal.
- **Deleting a key keeps its bookings.** They show as "Deleted key" rather than disappearing;
  bookings from several deleted keys merge into that one fallback label.
- Slot IDs are unique per day/position/slot, so a booking conflict is caught at the database, not
  guessed client-side.

## Gotchas

- **A key grants appointment access for one alliance until it's deleted.** Keys are stored in
  plaintext, never expire, and aren't hashed — treat the key and sign-in link like a password, and
  delete the key to revoke access.
- **Event settings are not in backups.** `Enable`, `Event start`, the visibility choice, and each
  day's key/shown positions live outside the backed-up tables, so re-set them by hand after
  restoring a backup. Bookings themselves are backed up normally.
- A key holder's closed card doesn't poll — if the host disables the event or deletes their key
  mid-session, they only find out on their next action or reload, not instantly.
- On a phone the schedule shows one day at a time; switch days with the chip row above the grid.

## See also

- [Overview](overview.md) — the three access tiers, and how alliance access keys are a separate,
  narrower kind of access.
- [Backup](backup.md) — what is and isn't included in an export.
