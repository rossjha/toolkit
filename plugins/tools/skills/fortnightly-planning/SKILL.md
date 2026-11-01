---
name: fortnightly-planning
description: Use when planning the next two weeks, running a fortnightly or bi-weekly planning session, setting Top 5 priorities for the fortnight, colour-coding the calendar against priorities, or auditing standing meetings and meeting prep load.
---

# Fortnightly Planning

## Overview

Plan → Do → Reflect & adjust, two weeks at a time (after Polina Russell's "Achieving more with less stress"). **Claude drafts the whole plan first; the user edits the draft.** Questions come after the draft, never before it.

Files in this skill folder:
- `config.example.md`: settings template. The real settings live in `~/.config/tools/fortnightly-planning.md`, outside the plugin, so updates never overwrite them.
- `plan-template.md`: the fortnightly plan. The section numbers below refer to it.
- `meeting-audit-template.md`: the quarterly meeting audit.

## Process

1. **Locate.** Read `~/.config/tools/fortnightly-planning.md`. If it doesn't exist, copy `config.example.md` there, ask for every value in one message, and write the answers in. The fortnight starts next Monday (today, if today is Monday). The plan file is `<plans_dir>/<week_starting>.md`. If that file exists, read it and update it in place. Otherwise create it from `plan-template.md`. Read the most recent earlier plan in `plans_dir`, and the most recent audit in `audits_dir` if one exists.

2. **Gather. Don't ask questions yet.**
   - **Previous plan:** Top 5 and their outcomes, slipped items, Below the line, On the horizon, calendar actions, reflection.
   - **Calendar:** the coming two weeks and the two weeks just finished. If `calendar: paste`, ask once for both lists in any format, then continue.
   - **Context sources** listed in config.

3. **Draft every section** and mark each inference with `❓` inline:
   - **§1 Wins:** take the outcomes from the previous Top 5 and mark them as candidates. Mark unfinished items as slipped, with a ❓ for the reason.
   - **§2 Reality check:** use the past fortnight's calendar. Standing-meeting % = recurring meeting hours ÷ working hours. Fill colour-coded % only when the calendar data includes event colours. Otherwise write "n/a – not yet colour-coded".
   - **§3 Top 5:** build candidates from the previous plan's horizon items, unfinished Top 5 items, Below-the-line items now due, and the context sources. Slot 5 defaults to People. Calculate the free hours in each week (working hours minus meetings minus a buffer of about 10%) and allocate them in rank order. Then tick or untick each sanity check, saying why for any that fail.
   - **§4 and §5:** carry forward from the previous plan, minus anything promoted into §3.
   - **§6 Calendar actions:** list *proposed* actions for recurring meetings with no linked priority, or meetings that crowd out a Top 5 block. Mark each one "proposed".
   - **§7 Prep:** flag a meeting as prep-needed when the user presents or organises it, it is a review, demo, interview, QBR, steering or board meeting, or it has external attendees. Take prep estimates from the latest audit's calibration table; otherwise ❓.
   - **§8 Colour key:** keep the fixed colours and assign the priority colours to this fortnight's Top 5.
   - **§9 and §10:** leave blank. They belong to the user.

4. **Write the file** with `status: draft`.

5. **Present in chat.** Include only:
   - the file path
   - the Top 5 with hours per week
   - the sanity checks that fail
   - a numbered list of every ❓, as questions the user can answer briefly or skip

6. **Iterate.** Apply the user's tweaks to the file. When the user says it's done, remove the remaining ❓ markers (or the user keeps them) and set `status: final`.

7. **Offer once at the end:**
   - Book focus and prep blocks on the calendar. Only after an explicit yes, listing the exact blocks first.
   - Run a meeting audit from `meeting-audit-template.md` if standing-meeting % is above target, or if the last audit is more than 90 days old (or there is none).

## Rules

- Never create, move, decline or recolour calendar events, or message anyone, without an explicit yes for that specific action.
- Don't invent wins or priorities. A guess is fine as long as it carries a ❓.
- If config is missing a value, ask once and write the answer back to `~/.config/tools/fortnightly-planning.md`.

## Common mistakes

| Mistake | Fix |
|---|---|
| Interviewing the user before drafting | Draft first. Put the questions after the draft. |
| Hours that don't follow the ranking | Re-rank or rebalance before presenting the draft. |
| Prep hidden inside free time | Every §7 meeting needs a prep block, or it fails the sanity check. |
| Pasting the whole plan into chat | The file is the plan. The chat gets the summary and the questions. |
