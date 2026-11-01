# Editing the day from the UI — design

Date: 2026-11-01

## Why

The day changes constantly. A meeting runs over and everything after it has to move; today that means opening the markdown and retyping times. Ross wants to tweak the plan directly on the timeline (drag to move, drag the bottom edge to resize, a dialog for details), quickly and with a great feel, while the markdown file stays first class: hand editing, the whole-day editor and asking Claude all keep working, and every UI action is just a precise edit to the file.

## Goals

1. **Pencil icons.** The header's text "Edit" button becomes an outline pencil icon (same thin-stroke SVG style as the existing eye button). Keyboard `e` unchanged.
2. **Priorities pencil.** An outline pencil at the top right of the "Today's priorities" card switches the list into inline text editing, like the brain dump does today.
3. **Nested priorities.** Sub-tasks indented under a parent (e.g. "Training" with tasks underneath).
4. **Schedule CRUD from the UI.**
   - Drag a block to move it (keeps its duration).
   - Drag a block's bottom edge to resize it.
   - Double-click a block → details dialog (edit title, category, times, links, prep notes; delete).
   - Click an empty slot → the same dialog, for a new block.
5. **Calendar meetings are fixed.** Blocks synced from Google Calendar (`<!-- gcal:… -->` marker) can't be moved, resized, retitled or deleted in the app; Google Calendar is the source of truth and a re-sync overwrites them. They can still be given links and prep notes.
6. **Overrun shortcut.** From any block's dialog (including a calendar meeting's): "push my blocks after this back by N minutes".

7. **Editable categories.** Categories move out of the code into a markdown file. A pencil next to the category totals in the schedule header opens that file in the same markdown editor as the day (⌘S saves, Esc cancels). Ross can add, rename, recolour and remove categories, and choose solid vs hatched.

## Categories file (decided)

- Lives at `categories.md` in the days folder (`days/`, or `TIMEBLOCK_DIR`), next to the day files *(location: Claude's call)*. If it doesn't exist, the server creates it from today's six built-in categories, so nothing changes visually on first run.
- One line per category, in display order:

  ```markdown
  # Categories

  - meeting: Meeting · chart-2 · solid
  - focus: Focus · accent · hatched
  - study: Study · chart-3 · hatched
  - personal: Personal · success · hatched
  - admin: Admin · chart-4 · hatched
  - break: Break · muted · hatched
  - training: Training · chart-5 · hatched
  ```

  `tag: Label · colour · style`. The **tag** is what day files write in `[…]`; the **label** is what the app shows. Colour is one of the theme palette names (`accent`, `chart-1`…`chart-5`, `success`, `warn`, `danger`, `muted`, `dim`), mapped to `var(--name)`, so every category works in all ten themes. Style is `solid` or `hatched` (the current meeting vs own-time look). Lines that don't parse are reported in the error bar, never dropped from the file.
- Live: the server watches `categories.md` like the day files and pushes a change event; open pages re-render. Served via a small `GET`/`PUT /api/categories` alongside the day API. `categories.md` must not be mistaken for a day file (the day regex already requires a date).
- **Renaming:** changing a label is always safe. Changing a tag is the same as removing that category: past days keep the old tag.
- **Removed / unknown tags** (e.g. an old day has `[training]` after training is deleted): the day file is never rewritten. The block renders in a neutral grey (`--dim`), hatched, labelled with the raw tag. No warning bar for this (it replaces today's "unknown category" warning). In the dialog the category select shows "training (removed)" selected, so saving doesn't change it; picking a current category does. Re-adding the tag restores its colour everywhere.
- Behaviour keyed on the `meeting` tag stays as it is (click opens Meet; calendar sync writes `[meeting]`). Untagged blocks still mean `focus`; if `focus` has been removed they render as unknown.
- Totals/legend, the dialog's category select and block colours all read from the file. `CLAUDE.md` is updated to say categories come from `categories.md` and Claude should read it to pick a tag, rather than the hard-coded list.

## Non-goals

- Writing anything back to Google Calendar.
- Moving blocks between days, multi-select, resizing from the top edge, undo.
- A new storage format or a database: the day file is still the only state.

## Anti-goals (a failure even if it works)

- A UI action that reformats, reorders or drops lines it wasn't about. Every edit touches only the block's own line(s), plus the move needed to keep Schedule sorted.
- Losing an edit made in the file (by Claude or an editor) while the UI was open.
- Letting a calendar meeting be dragged, so the next sync silently "undoes" the user's plan.
- Unreadable controls in any of the ten themes (inputs must use the theme's surface/text tokens, never hardcoded colours).
- Emoji icons. All icons are outline SVGs in the existing style.

## The markdown format (decided)

Details and sub-tasks are indented list items under their parent line, two spaces per level:

```markdown
## Priorities

- [x] Review PAY-412 notes
- [ ] Training
  - [x] Watch module 4
  - [ ] Do the lab exercise
- [ ] Draft Q1 hiring plan

## Schedule

- 09:45-11:15 [focus] Q1 hiring plan
- 11:00-11:30 [meeting] 1:1 with Sam https://meet.google.com/abc-defg-hij <!-- gcal:x1 -->
  - [1:1 running doc](https://docs.google.com/…)
  - [On-call rota proposal](https://docs.google.com/…)
  - Ask about on-call rota changes
  - Feedback on RFC review
```

- **Block children:** any indented line directly under a schedule line belongs to that block. A child whose whole content is a markdown link `[label](url)` or a bare URL is a **link**; anything else is a **prep note**. The Meet link stays on the block's own line as today.
- **Priority children:** an indented `- [ ]` / `- [x]` line is a sub-task of the nearest less-indented priority above it. Any depth parses; the UI renders depth by indentation. (Accept tabs or any consistent indent when reading; always write two spaces.)
- Today an indented line in Schedule produces a "couldn't read" warning; it must instead be parsed as a child. Indented lines with no block above them still warn.

## Behaviour

### Priorities

- View mode: checkboxes as today, sub-tasks indented. A parent with children shows a small `done/total` count of its direct children. Ticking a parent does not change its children, and vice versa *(Claude's call)*.
- Pencil (top right of the card) → the Priorities section body becomes a textarea showing the raw lines. Tab / Shift+Tab indent / outdent the current line(s) by two spaces. Saves as you type (same debounce as brain dump), Esc / ⌘S / blur finishes. Only the Priorities section is rewritten, mirroring `setBrainDump`.

### Schedule: direct manipulation

- Only **own blocks** (no `gcal:` marker) are draggable. Calendar blocks show no resize handle and a normal cursor, so movability is visible at a glance.
- **Move:** press and drag the block body vertically; it snaps to **5 minutes** *(Claude's call)* and shows its live time range while dragging; a faint ghost marks the original position. Drop writes the new times. Esc during a drag cancels.
- **Resize:** a handle along the bottom edge (cursor `ns-resize`); same snapping, minimum length 5 minutes.
- A drag must pass a small movement threshold before it starts, so single-click (open Meet link) and double-click (dialog) still work on own meetings.
- Dragging can extend the timeline past the visible hours (the timeline already grows to fit blocks).
- Overlaps are allowed, as today; they're drawn side by side.

### Schedule: the details dialog

Opened by double-clicking a block, or clicking an empty half-hour slot (prefilled with that slot, 30 min, `focus`). This replaces today's behaviour where a block double-click / slot click opens the whole-day markdown editor *(slot single-click opening the dialog is Claude's call; it keeps adding a block to one click)*.

Fields:
- Title (focused on open), category select, start and end time inputs, computed duration.
- Links: list with label + URL, add / remove. For meetings the Meet link is shown first (read-only for calendar meetings).
- Prep notes: textarea, one line per note line in the file.
- Actions: Delete (own blocks only), Cancel, Save. ⌘↵ / Ctrl+↵ saves, Enter in the title saves, Esc cancels.
- "Open in markdown" link that jumps to the block's line in the whole-day editor (preserves the old double-click route).
- **Push later blocks:** "Push my blocks after this back by [15] min" — moves every own block whose start is at or after this block's start (excluding this block itself when it's a calendar meeting; for an own block, it moves too) by N minutes. Calendar meetings never move; any resulting clash is just shown side by side. Available on calendar meetings too, since that's the usual case (a synced meeting ran over). Pressing Push saves the dialog's pending edits and the push as **one write** and closes the dialog; the push is measured from the block's start *as edited* *(Claude's call)*.

For **calendar meetings** the title, category and times are shown read-only; links and notes are editable; no Delete.

Look: a centred modal using the existing card/menu styling (`--surface`, `--border`, `--shadow`, `--r-lg`), inputs on `--surface-2` with `--fg` text, focus ring as elsewhere. Works in all ten themes.

### Writes and concurrency

- Follow the existing pattern: pure text-in/text-out functions in `src/shared/day.ts` (like `togglePriority`, `insertBlock`, `setBrainDump`), applied in the browser to the latest `state.markdown` and saved with the existing `PUT /api/day/:date`. No server changes expected.
- Each edit is applied to the **latest** file text at the moment of saving, not a snapshot from when the dialog opened, so a concurrent Claude/editor edit elsewhere survives. The block is located by its line; if that line no longer matches what the dialog opened (file changed underneath), re-find it by its original line content; if it can't be found, show the existing error bar and don't write.
- **Children changed underneath** *(Claude's call)*: the dialog also captures the block's child lines when it opens. If the user edited links/notes and, at save time, the file's children differ from that capture, don't write; show the error bar ("this block changed in the file — reopen it"). No merging. Time-only edits (drag, resize, push) never touch children, so they don't need this check.
- **Child lines the dialog doesn't model** *(Claude's call)*: the parser keeps each block's children as ordered raw lines with a kind (link / note) and indent. Children are rewritten only when the user actually changed links or notes in the dialog; then they're written in standard form (links first as `  - [label](url)`, then notes as `  - text`, deeper note indentation kept relative to the textarea). Moves, resizes and pushes carry the raw children unchanged.
- A block moves with its children. After a time change, the block (line + children) is re-placed in start-time order; lines are zero-padded.
- The line's category tag, Meet URL and `gcal:` comment are preserved when only times change.

### Docs to update

- `CLAUDE.md`: the child-line format for blocks and priorities; Claude must keep a block's child lines with it when moving it; **calendar re-sync keeps the indented child lines under a `gcal:` line it updates** (they're dropped only if the event is removed).
- `README.md`: the new interactions (pencil, drag, resize, dialog, push-back) and format.
- `examples/2026-10-29.md`: add a nested priority and a block with links/notes, and keep tests passing.
- Add `.superpowers/` to `.gitignore`.

## Constraints

- No new runtime dependencies; vanilla TS + the existing `h()` helper. Pointer events for drag (works with mouse and trackpad).
- Themes files are not edited (CLAUDE.md rule).
- Parser and every new text transform are covered by `node:test` tests in `test/day.test.ts`. `npm run typecheck` and `npm test` pass.

## Left to the builder

- Exact function names/signatures in `day.ts`, internal state shape for drag and dialog.
- Exact visual treatment of the drag ghost, handle size, and the done/total count.
- Keyboard focus handling inside the dialog beyond the keys listed above.
