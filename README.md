# timeblock

A local time-blocking day sheet, styled with the forge themes from atlassian-notes. Each day is a plain markdown file you (or Claude) edit; the page in your browser updates as soon as the file changes.

## Run

Requires Node 22.18 or newer.

```sh
npm install
npm start      # builds, starts on http://localhost:4318 and opens your browser
```

Day files live in `days/` (gitignored). Set `TIMEBLOCK_DIR` to keep them elsewhere, `PORT` to change the port, `OPEN_BROWSER=false` to stop it opening a tab.

## Using it

- **Priorities** on the left: tick them off in the browser.
- **Schedule** on the right: meetings are solid blocks, your own time (focus, study, personal, admin, break) is hatched, each in its own theme colour. Clashes sit side by side. The red line is now; past blocks fade.
- **Click an empty half-hour** to add a block there; it opens the editor with the line ready to finish. Double-click a block to jump to its line.
- **Edit** (or `e`) opens the whole day as markdown. ⌘S/Ctrl+S saves, Esc cancels.
- `←` / `→` change day, `t` goes back to today. The theme button (◐) picks any of the ten forge themes.

## Format

```markdown
## Schedule

- 09:00-09:15 [meeting] Team standup
- 09:30-11:00 [focus] Q1 hiring plan
- 14:00-15:00 [study] Distributed systems reading
```

Categories: `meeting`, `focus`, `study`, `personal`, `admin`, `break`. See `examples/2026-10-29.md` for a full day and `CLAUDE.md` for the complete rules.

## With Claude

Open Claude Code in this folder and just say what changed: "I've got a call with Sam at 2 for half an hour", "push the hiring plan to after lunch", "tick off the RFC replies". `CLAUDE.md` tells Claude where the files are and how to edit them, and the open page refreshes itself.
