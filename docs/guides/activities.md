# Activities

The Activities page shows one activity type at a time — Bear Trap, Contribution, Mobilization, or
anything added later under Admin → Scoring & Activities — across its whole history.

## What you see

- **Activity selector** — pick the activity. The URL changes with it (`/activities/bear_trap`), so a
  link opens the same view for someone else.
- **Totals strip** — event days logged, total participations, total value (in the activity's unit,
  e.g. damage), and total points.
- **Instance tiles** — only for activities with more than one instance per day (Bear Trap's two traps).
  Each tile shows how many times that instance was logged, its average participants, average value,
  and total value. Averages are over the events actually logged, not over every event day.
- **Total value over time** — one line per instance plus a heavier total line. A gap in an instance
  line means that instance was not logged that day.
- **By day** — one row per date, newest first, with the week, participants per instance (only for
  multi-instance activities), a participants total, total value, points, and an unmapped count when
  some names in that event have not been resolved to a member yet. Click a row to expand it and see
  who took part in each instance that day — names link to profiles, unresolved names carry an
  **Unmapped** badge.
- **By member** — every mapped member who appeared, sorted by total value: appearances out of event
  days, attendance badge, total value, average per appearance, and points. Names open the profile. For
  multi-instance activities, one column per instance shows how many times the member appeared in it.

## How to

1. Open **Activities** in the sidebar. It opens on the first activity in sort order.
2. Change the activity in the selector; the page reloads for that key.
3. Click a member to jump to their profile for a per-week breakdown.

## How it works

The page asks `/api/activities/<key>` once. The server returns every event of that activity with its
participation sums, plus every member's totals; grouping by date and the chart series are computed
in the browser. Points are the scored values from `participations.points`, so they follow the current
scoring config — changing tiers or weights and recomputing changes the points shown here. Expanding a
day fetches that day's events through the same endpoint the admin Events page uses; nothing is loaded
until you open a row.

## Gotchas

- **Unmapped rows count in totals but not in the member table.** The damage happened, so event
  totals include it; there is no member to attribute it to until the alias is mapped.
- **Departed (deactivated) members are hidden from the By member table**, like every other board;
  their values stay in the day and total figures. They still appear by name when you expand a day,
  because that list is the event as it was logged.
- **"—" is not zero.** A dash in a per-instance column means that instance was never logged for that
  date. A logged event with nobody over the minimum value would show 0.
- **Instance count comes from the activity.** Raising `max_instance` on the activity (e.g. four traps)
  adds tiles, chart lines, and columns automatically.
- **Viewer keys can see this page.** It is read-only, like Ranking and Attendance.

## See also

[Ranking](ranking.md) for per-activity leaderboards, [Attendance](attendance.md) for event-day
coverage, [Members](members.md) for a single member's history.
