# timeblock

A local time-blocking day sheet, styled with the forge themes from atlassian-notes. Each day is a plain markdown file you (or Claude) edit; the page in your browser updates as soon as the file changes.

## Run

Requires Node 22.18 or newer.

```sh
npm install
npm start      # builds, starts on http://timeblock.localhost:4318 and opens your browser
```

Day files live in `days/` (gitignored). Set `TIMEBLOCK_DIR` to keep them elsewhere, `PORT` to change the port, `OPEN_BROWSER=false` to stop it opening a tab.

## Using it

- **Priorities** on the left: tick them off in the browser. The pencil beside the heading edits them inline: Tab / Shift+Tab indent a task under the one above, it autosaves, Esc finishes. A parent shows `done/total` of its sub-tasks.
- **Brain dump**: click it (or press `b`) and type. It saves as you go; Esc or clicking away finishes. Only that section of the file changes.
- **Schedule** on the right: each category has its own theme colour and is solid or hatched (by default meetings are solid, your own time hatched). Clashes sit side by side. The red line is now; past blocks fade.
- **Click a meeting** to open its Meet link (Google Meet's home page if the line has no link).
- **Double-click a block** for its details: title, category, times, video link, links, prep notes, and "push my blocks after this back by N minutes" (handy when a meeting overruns; calendar meetings never move). You can delete the block or open it in markdown from there.
- **Click an empty half-hour** to add a block there; the same dialog opens, prefilled with that time.
- **Drag a block** to move it (5-minute snap) or drag its bottom edge to resize. Meetings synced from Google Calendar can't be moved, retitled or deleted here: change them in Google Calendar and re-sync.
- **Categories**: the pencil next to the schedule totals edits `categories.md` (in your days folder). One line per category: `- tag: Label · colour · style`, with a theme colour name and `solid` or `hatched`. Removed tags on old days show grey.
- **The eye button** (or `p`) hides the titles of personal blocks, for screen-sharing; the blocks stay. Your browser remembers the setting.
- **The header pencil** (or `e`) opens the whole day as markdown. ⌘S/Ctrl+S saves, Esc cancels.
- `←` / `→` change day, `t` goes back to today. The theme button (the swatch icon) picks any of the ten forge themes.

## Format

```markdown
## Schedule

- 09:00-09:15 [meeting] Team standup
- 09:30-11:00 [focus] Q1 hiring plan
- 14:00-15:00 [study] Distributed systems reading
  - [Chapter 5](https://example.com/ch5)
  - Skim the consensus section first
```

Indented lines under a block are its links and prep notes; under a priority, an indented `- [ ]` is a sub-task. Categories live in `categories.md` (defaults: `meeting`, `focus`, `study`, `personal`, `admin`, `break`). See `examples/2026-10-29.md` for a full day and `CLAUDE.md` for the complete rules.

## With Claude

Open Claude Code in this folder and just say what changed: "I've got a call with Sam at 2 for half an hour", "push the hiring plan to after lunch", "tick off the RFC replies". `CLAUDE.md` tells Claude where the files are and how to edit them, and the open page refreshes itself.

Meetings come from Google Calendar via Claude, not the app: run `/sync-calendar` (or say "sync my calendar") and Claude adds each event as a `[meeting]` line tagged with a hidden `<!-- gcal:… -->` marker. Re-run it whenever the day shifts; it only ever touches those tagged lines, never your own blocks.
