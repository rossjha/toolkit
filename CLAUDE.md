# timeblock

A local time-blocking day planner. Each day is one markdown file; the browser app (`npm start`, http://localhost:4318) renders it and live-reloads whenever the file changes, so editing the file is how you update the page.

## Where the day files are

`days/YYYY-MM-DD.md` in this repo (gitignored), unless `TIMEBLOCK_DIR` is set, in which case they're in that folder. "Today" means the machine's local date. If today's file doesn't exist yet, create it from the template below.

## The format

```markdown
---
date: 2026-10-29
start: 7    # optional: first hour shown (default 7)
end: 19     # optional: last hour shown (default 19)
---

## Priorities

- [ ] Draft Q1 hiring plan
- [x] Review PAY-412

## Schedule

- 09:00-09:15 [meeting] Team standup
- 09:30-11:00 [focus] Q1 hiring plan
- 12:00-12:45 [personal] Lunch and a walk

## Brain dump

Free-form notes, any markdown.
```

Schedule lines are `- HH:MM-HH:MM [category] Title`, 24-hour clock. Categories: `meeting` (other people's time: shown solid), `focus`, `study`, `personal`, `admin`, `break` (your own time: shown hatched). No category means `focus`. A link anywhere in a block's title (usually a Meet URL) becomes its click target. Blocks can overlap; they're drawn side by side. The timeline grows to fit blocks outside the start/end hours.

## When asked to change the day

- Edit the file in place; keep the three `##` sections and their order. Don't reformat lines you weren't asked to touch.
- Keep Schedule lines sorted by start time and zero-padded (`09:00`, not `9:00`).
- "Move X to 3pm" keeps its duration. "Block out an hour for Y after lunch" means the first free slot after the `personal` lunch block. Say what you changed in one line, including any clash it creates.
- Meetings someone mentions ("I've got a call with Sam at 2") are `[meeting]`; learning, reading and courses are `[study]`; deep work is `[focus]`.
- Ticking a priority: change `[ ]` to `[x]`. Don't delete done ones.
- Brain dump is the user's scratch space: append to it, never rewrite it.

## Syncing from Google Calendar

The app knows nothing about calendars; you populate the day file from the Google Calendar connector when asked ("sync my calendar", "what's on today?", `/sync-calendar`).

- Fetch the day's events from the user's primary calendar, in their local time zone.
- Each event becomes `- HH:MM-HH:MM [meeting] Title MEET_URL <!-- gcal:EVENT_ID -->`, where MEET_URL is the event's Google Meet link (`hangoutLink`, or the video entry point in its conference data), left out when there isn't one. The app strips the link from the title and opens it when the block is clicked; the comment is hidden in the app and is how you recognise your own lines next time.
- Skip events the user declined, all-day events and working-location events. Calendar "Focus time" events become `[focus]`; "Out of office" becomes `[personal]`. An event with no other attendees is the user's own block: guess the category from its title (`[study]`, `[admin]`, `[focus]`…).
- Re-syncing: update lines whose `gcal:` id still exists (time or title may have moved), add new events, and delete `gcal:` lines whose event is gone or now declined. Never touch lines without a `gcal:` marker; those are the user's own.
- Keep the Schedule sorted. Afterwards, say in a line or two what was added, moved or removed, and point out any clash with the user's own blocks; don't move their blocks unless asked.

## Code

Node ≥ 22.18 runs the server's `.ts` directly; `npm run build` compiles `src/web` + `src/shared` to `public/js` and inlines the CSS. `npm test` covers the parser (`src/shared/day.ts`). The themes in `src/web/themes.css` and `themes.ts` are copied verbatim from forge (via atlassian-notes); don't edit them, re-copy instead.
