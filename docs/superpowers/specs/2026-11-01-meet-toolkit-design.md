# meet-toolkit: design

**Date:** 2026-11-01 · **Status:** awaiting approval · **Lives in:** `apps/meet-toolkit` in the tools monorepo

## Intent

A tiny local web app that sits in a narrow panel on the left of the MacBook screen, split with a meet.google.com tab in Chrome. It does two things during a meeting:

1. Shows how much meeting time is left.
2. Gives a low-friction scratchpad for notes, saved to one markdown file that Ross chooses. Other skills (or Ross, by hand) can process that file later.

It has to be a local web app, not a Chrome extension: Ross's work doesn't allow extensions. Docker Compose runs it, for convenience, as atlassian-notes does.

## Goals

- **Countdown timer in a header bar.** The time is in the middle, with − and + either side of it and a start/stop button. Ross sets the duration before the meeting and presses start when it begins.
- **Click the time to type a duration** (Ross's decision). Clicking the time turns it into a small input. `27` means 27 minutes, `27:30` means 27 minutes 30 seconds. Enter or blur applies it, and Esc cancels. Invalid input is rejected and the previous value stays. This works at any width; it's the way to set times that aren't a multiple of 5, and it's the only way to set the time once −/+ have folded away. Typing while the timer is running sets the remaining time.
- **When time runs out**, the timer shows `00:00` and the whole header bar turns red. There's no overtime count and no sound.
- **Narrow-friendly.** The panel works down to about 220px wide. The controls are small, and below a width breakpoint the −/+ buttons fold away so only the time and start/stop remain.
- **Notes panel** fills the rest of the height. It's a plain markdown text editor: click and type.
- **Bullet editing:**
  - Enter on a `-` bullet line starts a new bullet at the same indent. A `- [ ]` or `- [x]` line continues as `- [ ]`. Numbered lists aren't continued or renumbered. *(Claude's call.)*
  - Enter on an empty bullet takes it out one level, or ends the list if it's already at the top level.
  - Tab and Shift+Tab indent and outdent the current line, or every selected line.
  - Indentation is visible as plain leading spaces, in a monospace font.
- **One file.** Notes persist to a single `meet-toolkit-scratchpad.md` whose path Ross sets.
- **Saves as you type.** External changes to the file (Obsidian, a skill clearing it) show up in the panel without a reload.

## Non-goals

- No Chrome extension, Meet integration or calendar lookup.
- No rendered markdown, preview mode, or syntax-highlighting editor library.
- No multiple files, history or meeting list.
- No theme picker.
- No sound or notification at zero.

## Anti-goals (would count as failure even if it works)

- Controls that eat space when the panel is narrow.
- Losing notes: a crash, a closed tab or a container restart must never drop more than the last second of typing.
- An external edit and in-progress typing silently overwriting each other.

## Constraints and decisions

- **Stack:** the same stack as timeblock. That's Node ≥22.18 running TypeScript natively, a plain `node:http` server, a vanilla TypeScript front end compiled by `tsc`, `node --test` for tests, no framework and no Tailwind. The CSS build inlines `themes.css` the way timeblock's `scripts/build-css.ts` does. *(Claude's call, matching Ross's request to start from timeblock.)*
- **Theme:** the forge theme CSS from timeblock, fixed to **Carbon** with the same rounded-corner tweak, plus the bundled JetBrains Mono font. There's no theme switch and no `theme-init.js`. *(Carbon is Claude's call, as timeblock's default.)* The red "time's up" colour uses the theme's own danger/red token.
- **Workspace:** it's an npm workspace (`apps/meet-toolkit`) and uses the root lockfile.
- **Config:** environment variables only, like timeblock.
  - `MEET_SCRATCHPAD`: absolute path to the notes file. Default: `~/meet-toolkit/meet-toolkit-scratchpad.md`, in its own folder so Docker never has to mount all of `$HOME`. *(Claude's call.)* The file and its folder are created if missing.
  - `PORT`: defaults to 4319 (timeblock uses 4318 and atlassian-notes 4317).
  - `OPEN_BROWSER=false`: don't open a tab on start.
- **Docker:** a `Dockerfile` and `compose.yaml` follow atlassian-notes' pattern: same-path mounts, `HOME` passed through, bound to `127.0.0.1` only, `restart: unless-stopped`. Compose mounts the scratchpad's **folder** (not the file itself, so atomic saves and external edits work) at the same path inside the container. The Dockerfile uses `npm ci` when a lockfile is present and `npm install` otherwise, matching atlassian-notes.
- **Timer state** lives in the browser. The last duration is remembered in localStorage, defaulting to 30:00. A running countdown is stored as an end timestamp, so a page reload doesn't lose it. The +/− step is 5 minutes. Pressing them while running moves the end time. The time can't go below 0, and pressing + after reaching zero clears the red state and resumes from the new remaining time. Stop pauses, and start resumes. A reset on long-press or double-click of the time sets it back to the last duration.
- **Saving:** the client saves with a debounce of about 500ms and on blur. The server writes atomically, via a temp file in the same folder then a rename.
- **External changes:** the server watches the file and pushes changes to the page through Server-Sent Events, the same mechanism timeblock uses for its live updates. When the editor has no unsaved typing, an external change (including a skill clearing the file) replaces the textarea in place, keeping the cursor position where it can. If an external change arrives while there is unsaved typing, the user's text wins and is saved. The external version is first written to a sibling `meet-toolkit-scratchpad.conflict.md` (overwriting any previous one), and the panel shows a small dismissible notice naming that file. Nothing is lost silently. *(Claude's call.)*

## Left to the builder

- The exact breakpoint and sizes for the narrow layout.
- How the server's file-watching and SSE code is structured (it can borrow from timeblock).
- Test split. The server (atomic write, watch → SSE, path handling) and the pure editor functions (duration parsing, Enter/Tab/Shift+Tab transforms on text plus a selection) must be unit tested. Timer arithmetic should be a pure, tested function.
- README covering run, Docker, `MEET_SCRATCHPAD`, and the keyboard behaviour.
