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

Schedule lines are `- HH:MM-HH:MM [category] Title`, 24-hour clock. Categories: `meeting` (other people's time: shown solid), `focus`, `study`, `personal`, `admin`, `break` (your own time: shown hatched). No category means `focus`. Blocks can overlap; they're drawn side by side. The timeline grows to fit blocks outside the start/end hours.

## When asked to change the day

- Edit the file in place; keep the three `##` sections and their order. Don't reformat lines you weren't asked to touch.
- Keep Schedule lines sorted by start time and zero-padded (`09:00`, not `9:00`).
- "Move X to 3pm" keeps its duration. "Block out an hour for Y after lunch" means the first free slot after the `personal` lunch block. Say what you changed in one line, including any clash it creates.
- Meetings someone mentions ("I've got a call with Sam at 2") are `[meeting]`; learning, reading and courses are `[study]`; deep work is `[focus]`.
- Ticking a priority: change `[ ]` to `[x]`. Don't delete done ones.
- Brain dump is the user's scratch space: append to it, never rewrite it.

## Code

Node ≥ 22.18 runs the server's `.ts` directly; `npm run build` compiles `src/web` + `src/shared` to `public/js` and inlines the CSS. `npm test` covers the parser (`src/shared/day.ts`). The themes in `src/web/themes.css` and `themes.ts` are copied verbatim from forge (via atlassian-notes); don't edit them, re-copy instead.
