# meet-toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a narrow local web app for use beside Google Meet, with a countdown timer bar and a markdown scratchpad saved to one external file.

**Architecture:** A `node:http` server serves static files, a notes API and a Server-Sent Events stream fed by `fs.watch` on the scratchpad's folder. The front end is vanilla TypeScript compiled by `tsc`. All timer, duration and editor logic lives in pure functions in `src/shared` so `node --test` covers it. The structure copies timeblock (`~/dev/timeblock`).

**Tech Stack:** Node ≥22.18 (native TypeScript), TypeScript 7, `node --test`, no runtime dependencies, forge themes CSS, Heroicons path data, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-01-meet-toolkit-design.md` (mock: `docs/superpowers/specs/2026-11-01-meet-toolkit-mock.html`)

## Global Constraints

- App path `apps/meet-toolkit`, package name `meet-toolkit`, npm workspace with the root lockfile. Never create `apps/meet-toolkit/package-lock.json`.
- Node `>=22.18`. Copy timeblock's `nodeVersion.ts`, changing the app name in the message.
- No runtime dependencies. devDependencies only `typescript` and `@types/node` (same versions as timeblock).
- Env vars: `MEET_SCRATCHPAD` (default `~/meet-toolkit/meet-toolkit-scratchpad.md`, with `~` expanded), `PORT` (default `4319`), `HOST` (default `127.0.0.1`), `OPEN_BROWSER` (`false` disables).
- Conflict file: sibling named `<basename without .md>.conflict.md`, so the default is `meet-toolkit-scratchpad.conflict.md`.
- Timer defaults: 30:00 duration, 5-minute (300s) −/+ step. localStorage keys `meet-toolkit.duration`, `meet-toolkit.timer`, `meet-toolkit.theme`.
- Save debounce 500ms, plus an immediate save on blur. Watcher debounce 150ms (as timeblock).
- −/+ fold away below a 240px container width (`@container`).
- Theme picker button at the bottom right of the status line; its menu opens upward. Ten forge themes, default Carbon.
- Icons: Heroicons 24px outline, inlined path data, built with `createElementNS`. No `innerHTML` with user data.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Echo of our own save arriving over SSE while the user keeps typing.** This must not be treated as an external change, and must not produce a conflict file. Covered by the client sync rules in Task 5 and the server test "save with matching base never writes a conflict" (Task 4).
2. **A skill deletes the scratchpad instead of clearing it.** The next GET returns `""` and recreates the file, and the page clears when it isn't dirty. Test in Task 4.
3. **Odd duration input** (`0`, `90`, `120:00`, `5:75`, `abc`, `""`, ` 27 `). Parse rules plus tests in Task 1. Clocks of 100 minutes or more render as `100:00`, not truncated.
4. **The laptop sleeps or the tab is throttled mid-meeting.** Remaining time is derived from the stored `endAt` and `now`, never from counting ticks. Test in Task 2.
5. **The scratchpad folder doesn't exist at first start, or `MEET_SCRATCHPAD` uses `~`.** The folder and file are created and the path expanded. Tests in Task 4.

---

### Task 1: Scaffold the app and add duration parsing

**Files:**
- Create: `apps/meet-toolkit/package.json` (scripts copied from timeblock's: `build`, `start`, `test`, `typecheck`)
- Create: `apps/meet-toolkit/tsconfig.json`, `tsconfig.web.json` (copies of timeblock's)
- Create: `apps/meet-toolkit/.gitignore` (`public/js/`, `public/app.css`)
- Create: `apps/meet-toolkit/scripts/build-css.ts` (copy of timeblock's)
- Copy from timeblock: `src/web/themes.css`, `src/web/themes.ts` (THEME_KEY → `meet-toolkit.theme`), `public/theme-init.js` (key → `meet-toolkit.theme`), `public/fonts/*`, `src/server/nodeVersion.ts` (message names meet-toolkit)
- Create: `apps/meet-toolkit/public/index.html` (timeblock's, title `Meet toolkit`), `public/favicon.svg` (Heroicons `clock` outline, stroke `#f5c518`)
- Create: `apps/meet-toolkit/src/shared/duration.ts`
- Test: `apps/meet-toolkit/test/duration.test.ts`

**Interfaces:**
- Produces: `parseDuration(input: string): number | null` (seconds), `formatClock(seconds: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
test("parseDuration reads minutes or mm:ss", () => {
  assert.equal(parseDuration("27"), 1620);
  assert.equal(parseDuration(" 27 "), 1620);
  assert.equal(parseDuration("27:30"), 1650);
  assert.equal(parseDuration("0"), 0);
  assert.equal(parseDuration("120"), 7200);
  assert.equal(parseDuration("120:00"), 7200);
});
test("parseDuration rejects junk", () => {
  for (const bad of ["", "abc", "5:75", "1:2", "-5", "27:", ":30", "1000"]) assert.equal(parseDuration(bad), null, bad);
});
test("formatClock pads and never goes negative", () => {
  assert.equal(formatClock(1650), "27:30");
  assert.equal(formatClock(59.4), "01:00"); // countdowns round up: 00:00 only when time is really up
  assert.equal(formatClock(0.2), "00:01");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(-12), "00:00");
  assert.equal(formatClock(6000), "100:00");
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npm test -w meet-toolkit`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both functions in `src/shared/duration.ts`.** The pattern is `^(\d{1,3})(?::([0-5]\d))?$` after trimming. `formatClock` uses `Math.ceil(Math.max(0, s))`, with minutes padded to at least two digits.
- [ ] **Step 4: Run** `npm install` at the repo root, then `npm test -w meet-toolkit && npm run typecheck -w meet-toolkit`. Expected: PASS, and no new `apps/meet-toolkit/package-lock.json`.
- [ ] **Step 5: Commit** `feat(meet-toolkit): scaffold app and duration parsing`.

### Task 2: Timer state

**Files:**
- Create: `apps/meet-toolkit/src/shared/timer.ts`
- Test: `apps/meet-toolkit/test/timer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TimerState { durationS: number; remainingS: number; endAt: number | null } // endAt = epoch ms while running
  export function initialTimer(durationS: number): TimerState
  export function remaining(t: TimerState, now: number): number   // seconds, >= 0
  export function isRunning(t: TimerState, now: number): boolean  // endAt set and remaining > 0
  export function start(t: TimerState, now: number): TimerState   // no-op at 0
  export function stop(t: TimerState, now: number): TimerState    // freezes remaining
  export function adjust(t: TimerState, deltaS: number, now: number): TimerState
  export function setRemaining(t: TimerState, s: number, now: number): TimerState
  export function reset(t: TimerState): TimerState                // stopped, remaining = durationS
  ```

- [ ] **Step 1: Write the failing tests** (`now` passed explicitly, ms):
  - `remaining(start(initialTimer(1800), 0), 600_000) === 1200`
  - **Sleep:** `remaining(start(initialTimer(60), 0), 3_600_000) === 0`, and `isRunning(...)` is false at that point.
  - `stop` then `start` resumes: start at 0, stop at 10_000 (remaining 1790), start at 50_000, so `remaining` at 60_000 is 1780.
  - `adjust(+300)` while running moves the end time: `remaining(adjust(start(initialTimer(600),0),300,0),0) === 900`.
  - `adjust(-300)` clamps at 0: from 120 remaining gives 0.
  - **After time's up:** `adjust(+300)` on a running-but-expired timer gives remaining 300 and `isRunning === true` (it resumes).
  - **Stopped:** `setRemaining(t, 1620, now)` on a stopped timer sets `durationS = 1620` as well. On a running timer it changes only the remaining time.
  - `start` at 0 remaining returns the state unchanged.
  - `reset` returns a stopped timer with `remainingS === durationS`.
- [ ] **Step 2: Run** `npm test -w meet-toolkit` and confirm the new tests FAIL.
- [ ] **Step 3: Implement `src/shared/timer.ts`.** Every function is pure and returns a new object. Running state is `endAt !== null`. Remaining while running is `(endAt - now) / 1000` clamped at 0. Expiry while running for `adjust` means the new `endAt = now + newRemaining*1000`.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(meet-toolkit): pure timer state`.

### Task 3: Editor transforms

**Files:**
- Create: `apps/meet-toolkit/src/shared/editor.ts`
- Test: `apps/meet-toolkit/test/editor.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EditResult { text: string; selStart: number; selEnd: number }
  export function onEnter(text: string, selStart: number, selEnd: number): EditResult | null // null = let the browser handle it
  export function onTab(text: string, selStart: number, selEnd: number, outdent: boolean): EditResult
  ```
  The indent unit is two spaces.

- [ ] **Step 1: Write the failing tests.** `|` marks the cursor in the descriptions; the tests use offsets.
  - `"- a|"` + Enter → `"- a\n- |"`
  - `"  - a|"` + Enter → `"  - a\n  - |"`
  - `"- [x] done|"` + Enter → `"- [x] done\n- [ ] |"`
  - `"  - |"` (empty nested) + Enter → `"- |"` (outdent one level)
  - `"- |"` (empty top level) + Enter → `"|"` (list ends; line emptied)
  - `"- [ ] |"` empty checkbox at top level + Enter → `"|"`
  - `"1. a|"` + Enter → `null`, and so do `"plain|"` and any selection where `selStart !== selEnd`
  - Enter with the cursor mid-line, `"- ab|cd"` → `"- ab\n- |cd"`
  - Tab on `"- a|"` → `"  - a|"`, cursor shifted by 2
  - Tab with a selection across 2 lines indents both; the selection is kept, covering both lines
  - Shift+Tab on `"  - a"` → `"- a"`; on `" - a"` → `"- a"`; on `"- a"` → unchanged
  - Shift+Tab never moves the cursor before the start of its line
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement `src/shared/editor.ts`.** The bullet line pattern is `^(\s*)([-*+]) (\[[ xX]\] )?(.*)$`. A continued checkbox is always `[ ] `.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(meet-toolkit): bullet editing transforms`.

### Task 4: Server (notes store, API, live updates)

**Files:**
- Create: `apps/meet-toolkit/src/server/config.ts`, `notes.ts`, `app.ts`, `main.ts`
- Test: `apps/meet-toolkit/test/config.test.ts`, `notes.test.ts`, `app.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // config.ts
  export interface Config { scratchpad: string; port: number; host: string; openBrowser: boolean }
  export function loadConfig(env: NodeJS.ProcessEnv, home: string): Config
  export function conflictPath(scratchpad: string): string
  // notes.ts
  export async function readNotes(file: string): Promise<string>  // creates folder + empty file if missing
  export async function saveNotes(file: string, text: string, base: string): Promise<{ conflictFile: string | null }>
  // app.ts (same shape as timeblock)
  export function createApp(opts: { scratchpad: string; publicDir: string }): { handle: http.RequestListener; close: () => void }
  ```
- HTTP API (the client in Task 5 relies on this):
  - `GET /api/notes` → `{ text: string, path: string }`
  - `PUT /api/notes` with body `{ text: string, base: string }` → `{ ok: true, conflictFile: string | null }`. The body is capped at 1MB, as in timeblock.
  - `GET /api/events` is the SSE stream. It sends `data: {"type":"notes"}` after any change to the scratchpad file (watching its **folder**, filtered by basename, debounced 150ms), with a `: ping` every 25s.
  - Static files are served from `public/` with timeblock's path-traversal guard.

- [ ] **Step 1: Write the failing tests**
  - config: `loadConfig({}, "/h").scratchpad === "/h/meet-toolkit/meet-toolkit-scratchpad.md"`. `MEET_SCRATCHPAD="~/x/n.md"` → `/h/x/n.md`. Defaults `port 4319`, `host "127.0.0.1"`, `openBrowser true`, and `OPEN_BROWSER=false` gives false. `conflictPath("/a/n.md") === "/a/n.conflict.md"`.
  - notes, using a temp dir: `readNotes` on a missing nested path creates the folder and an empty file and returns `""`. **save with matching base never writes a conflict:** read, then save "a" with base "", then save "b" with base "a": no conflict file exists and the file holds "b". **Mismatched base:** the file holds "external" and we save "mine" with base "old". The result is `conflictFile === conflictPath(file)`, the conflict file holds "external", and the main file holds "mine". **Deleted externally:** after `fs.rm(file)`, `readNotes` returns `""` and the file exists again. No `*.tmp-*` files remain after a save.
  - app: start `http.createServer(createApp(...).handle)` on port 0. GET returns the text and path. PUT then GET round-trips. A bad JSON body returns 400. **SSE:** connect to `/api/events`, write the file with `fs.writeFile`, and receive a `{"type":"notes"}` event within 2s. Writing an unrelated file in the same folder sends no event within 500ms. `close()` ends open streams.
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement.** `notes.ts` uses timeblock's `writeAtomic` (temp file plus rename in the same folder). `saveNotes` reads the current file first. If the current text is neither `base` nor `text`, it writes the current text atomically to `conflictPath`, then writes `text`. `main.ts` mirrors timeblock's `main.ts`: `assertNodeVersion()` first, `loadConfig(process.env, os.homedir())`, `readNotes` to create the file, listen on `host:port`, log `meet-toolkit on http://localhost:<port>, notes in <path>`, open the browser unless disabled, close on SIGINT and SIGTERM.
- [ ] **Step 4: Run tests and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(meet-toolkit): notes server with conflict-safe saves and live updates`.

### Task 5: Web UI

**Files:**
- Create: `apps/meet-toolkit/src/web/main.ts`, `src/web/icons.ts`, `src/web/dom.ts` (timeblock's `h` helper), `src/web/styles.css`
- Reuse: `src/web/themes.ts` (picker logic as in timeblock's `themePicker()`, rendering upward)

**Interfaces:**
- Consumes: `parseDuration`, `formatClock` (Task 1); the timer functions (Task 2); `onEnter`, `onTab` (Task 3); the HTTP API (Task 4).
- Produces: `icon(name: "play" | "pause" | "minus" | "plus" | "swatch" | "xMark"): SVGSVGElement` in `icons.ts`. Path data is copied from heroicons.com 24/outline, and the file has the same licence header as atlassian-notes' `icons.ts`.

- [ ] **Step 1: Header bar.** In order: minus, time button, plus, play/pause.
  - Clicking the time swaps it for an `<input>` prefilled with `formatClock`. Enter or blur applies `parseDuration` through `setRemaining`, Esc cancels, and invalid input keeps the old value. Single click waits about 220ms so a double-click (reset) can win.
  - The bar gets class `done` when `remaining === 0`. The time gets class `running` while running.
  - Re-render every 250ms only while running.
  - Persist `TimerState` to `meet-toolkit.timer` on every change, and the last set duration to `meet-toolkit.duration`. Restore on load, defaulting to `initialTimer(1800)`. Wrap all storage access in try/catch.
- [ ] **Step 2: Notes.** A `<textarea spellcheck="false">` filling the panel. On `keydown`, Enter (without Shift) and Tab call `onEnter`/`onTab` and, when the result isn't null, apply it with `setRangeText` and `setSelectionRange`, then call `preventDefault`.
- [ ] **Step 3: Sync.** Client state is `synced` (the last text known to match the file), `inFlight` (the text being saved, or null) and `dirty = textarea.value !== synced`.
  - Save is debounced 500ms after input, and immediate on blur. Only one PUT runs at a time; if more input arrives, save again afterwards. Each PUT sends `{ text, base: synced }`. On success set `synced = text`. When the response has a `conflictFile`, show the notice.
  - On an SSE `notes` event, GET the text. If it equals `synced` or `inFlight`, ignore it, since it's our own echo. Otherwise, if not dirty, replace the textarea (clamping the cursor to the new length) and set `synced`. If dirty, save immediately; the server writes the conflict file.
  - `EventSource` reconnects on its own. After reconnecting, do one GET with the same rules.
- [ ] **Step 4: Conflict notice and status line.**
  - The notice text is `Notes changed elsewhere while you typed. Their version: <basename of conflictFile>`, with an x-mark button to dismiss it.
  - The status line shows the save state (`saving…`, `saved`, or `save failed`, in `--danger`), then the scratchpad path (ellipsis truncation, full path in `title`), then the theme picker button, right-aligned, with its menu opening upward.
- [ ] **Step 5: Styles.** Port the mock's CSS into `styles.css` on top of `@import "./themes.css";` with timeblock's font face and Carbon rounded corners. Use container queries for the 240px fold. The red bar is `color-mix(in srgb, var(--danger) 85%, black)` with white text.
- [ ] **Step 6: Verify in the browser.** Run `PORT=4399 MEET_SCRATCHPAD=<scratch>/n.md OPEN_BROWSER=false npm start -w meet-toolkit`. Open it in Chrome at widths of about 380px and 200px, and check:
  - typing a duration, start, −/+ while running, and the red bar at zero (use `0:05`)
  - Enter, Tab and Shift+Tab bullets
  - typing appears in `n.md` within about 1s
  - `echo "- external" > n.md` updates the page
  - editing `n.md` while typing creates `n.conflict.md` and shows the notice
  - switching theme and reloading keeps the theme and a running timer
- [ ] **Step 7: Commit** `feat(meet-toolkit): timer bar, scratchpad editor and theme picker`.

### Task 6: Docker, docs, and repo wiring

**Files:**
- Create: `apps/meet-toolkit/Dockerfile`, `Dockerfile.dockerignore` or `.dockerignore`, `compose.yaml`, `README.md`
- Modify: `README.md` (root): add a row to the Apps table
- Modify: `docs/superpowers/specs/2026-11-01-tools-monorepo-design.md`: tick off the Meet toolkit

- [ ] **Step 1: Dockerfile.** Copy atlassian-notes' Dockerfile, using `npm ci` when a lockfile is present and `npm install` otherwise. The final stage copies `package.json`, `node_modules`, `src`, `public`, and sets `ENV HOST=0.0.0.0 OPEN_BROWSER=false`, `EXPOSE 4319`, `CMD ["node","src/server/main.ts"]`.
- [ ] **Step 2: compose.yaml**, following atlassian-notes:
  - Pass `HOME: ${HOME}` and `PORT: ${PORT:-4319}`.
  - `MEET_DIR` defaults to `${HOME}/meet-toolkit`, and `MEET_SCRATCHPAD` is `${MEET_DIR}/meet-toolkit-scratchpad.md`.
  - Mount the volume `${MEET_DIR:-${HOME}/meet-toolkit}` at the same path.
  - Publish the port as `"127.0.0.1:${PORT:-4319}:${PORT:-4319}"`, with `init: true` and `restart: unless-stopped`.
  - A comment block explains putting `MEET_DIR=/path/to/vault/folder` in a `.env` next to the file, for an Obsidian vault.
- [ ] **Step 3: Verify Docker.** `docker compose build` in `apps/meet-toolkit`. Then `MEET_DIR=<scratch> PORT=4398 docker compose up -d`, check `curl -s localhost:4398/api/notes` returns JSON with the path under `<scratch>`, check that a PUT shows up in `<scratch>/meet-toolkit-scratchpad.md` on the Mac, then `docker compose down`.
- [ ] **Step 4: README.** Cover what it is, running with `npm start` or Docker, `MEET_SCRATCHPAD`/`MEET_DIR`, keyboard behaviour (click the time, double-click to reset, Enter/Tab/Shift+Tab), and conflict files.
- [ ] **Step 5: Full check from the repo root.** Run `npm test && npm run typecheck`. Expected: all workspaces pass.
- [ ] **Step 6: Commit** `feat(meet-toolkit): Docker setup and docs`.
