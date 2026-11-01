# Editing the Day from the UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag/resize/dialog CRUD for schedule blocks, nested priorities with inline editing, pencil icons, and categories moved into an editable `categories.md` — with the markdown files remaining the only state.

**Architecture:** Every UI action is a pure text→text transform in `src/shared/` applied to the latest `state.markdown` in the browser and saved with the existing `PUT /api/day/:date` (exactly the `togglePriority`/`setBrainDump` pattern). Categories become data parsed from `categories.md`, served by a new `GET`/`PUT /api/categories` and pushed live through the existing SSE stream. The web UI is split so `main.ts` doesn't absorb the dialog and drag code.

**Tech Stack:** TypeScript 7, Node ≥ 22.18 (runs `.ts` directly), `node:test`, vanilla DOM (`h()` helper), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-ui-editing-design.md`

## Global Constraints

- No new runtime or dev dependencies. Pointer events for drag.
- Do not edit `src/web/themes.css` or `src/web/themes.ts`.
- Every UI write touches only the affected block's own line(s) plus the move needed to keep Schedule sorted; untouched lines keep every byte.
- Times written zero-padded `HH:MM`; child lines written with two spaces per level.
- Icons: outline SVG via the existing `svg()` helper (viewBox 24, stroke 2, round caps). No emoji anywhere in the UI.
- Colours only via theme tokens (`var(--surface)`, `--surface-2`, `--fg`, `--border`, `--accent`, palette names). Must read correctly in all ten themes.
- Calendar blocks = lines with `<!-- gcal:ID -->`: never draggable/resizable/deletable; title, category, times read-only in the dialog.
- Drag snap 5 minutes; minimum block length 5 minutes; times clamped to 00:00–24:00.
- Default push amount 15 minutes.
- `npm run typecheck` and `npm test` pass at the end of every task.

## Review Focus

1. **A live reload arrives mid-drag or while the dialog is open** (Claude edits the file): the drag must not jump or die, the dialog must not be destroyed. → dialog lives on `document.body`, not `#app`; reloads are deferred while dragging (Tasks 7, 8 manual checks).
2. **Pushing or dragging past midnight**: never produce an unparseable line; clamp to end at 24:00. → test in Task 3.
3. **Moving a block that has children**: children travel with it, blank-line spacing before `## Brain dump` survives, nothing else reorders. → tests in Task 3.
4. **Broken or empty `categories.md`**: the app still renders (blocks grey, warnings in the error bar), no crash; an empty file means no categories, not the defaults. → tests in Tasks 1, 2.
5. **Typing in the dialog, the priorities editor or a `<select>` fires global shortcuts** (`e`, `b`, `t`, `p`, arrows). → shortcut guard covers `input, textarea, select, dialog` and the priorities draft (Task 5 manual check).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/categories.ts` (new) | Category type, defaults, parse/format `categories.md`, colour lookup |
| `src/shared/day.ts` (modify) | Day parser: nested priorities, block children, gcal id; section setters; exports low-level helpers |
| `src/shared/schedule.ts` (new) | Schedule text transforms: format, retime, push, snapshot/locate, upsert, delete |
| `src/shared/indent.ts` (new) | Pure Tab/Shift-Tab indent for a textarea value |
| `src/server/app.ts` (modify) | `/api/categories`, watch `categories.md` |
| `src/web/dom.ts` (new) | `h()`, `svg()`, icon functions (moved out of `main.ts`) |
| `src/web/dialog.ts` (new) | Block details dialog |
| `src/web/drag.ts` (new) | Move / resize pointer handling |
| `src/web/main.ts` (modify) | State, wiring, rendering |
| `src/web/styles.css` (modify) | Styles for the above |
| `test/categories.test.ts`, `test/schedule.test.ts`, `test/indent.test.ts`, `test/app.test.ts` (new); `test/day.test.ts` (modify) | Tests |
| `CLAUDE.md`, `README.md`, `examples/2026-10-29.md` | Docs and fixture |

---

### Task 1: Categories model

**Files:**
- Create: `src/shared/categories.ts`, `test/categories.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CategoryStyle = "solid" | "hatched";
  export interface Category { id: string; label: string; color: string; style: CategoryStyle } // color = palette name, e.g. "chart-2"
  export const PALETTE: readonly string[]; // ["accent","chart-1","chart-2","chart-3","chart-4","chart-5","success","warn","danger","muted","dim"]
  export const DEFAULT_CATEGORIES: readonly Category[];
  export function parseCategories(text: string): { categories: Category[]; warnings: string[] };
  export function formatCategories(cats: readonly Category[]): string;
  export function findCategory(cats: readonly Category[], id: string): Category | undefined;
  export function categoryColor(c: Category | undefined): string; // "var(--chart-2)"; undefined → "var(--dim)"
  ```

Defaults (order and values from today's `CATEGORIES`): meeting/Meeting/chart-2/solid, focus/Focus/accent/hatched, study/Study/chart-3/hatched, personal/Personal/success/hatched, admin/Admin/chart-4/hatched, break/Break/muted/hatched.

Line format: `- tag: Label · colour · style`. Separators `·` or `|`. Tag `[\w-]+`, lower-cased. Colour missing → `dim`; style missing → `hatched`. Unknown colour, unknown style, duplicate tag (first wins), or an unparseable list line → a warning `Line N: …`; headings and blank lines ignored.

- [ ] **Step 1: Write failing tests** in `test/categories.test.ts`:
  - `formatCategories round-trips the defaults`: `parseCategories(formatCategories(DEFAULT_CATEGORIES))` deep-equals `{ categories: [...DEFAULT_CATEGORIES], warnings: [] }`; output starts with `"# Categories\n\n- meeting: Meeting · chart-2 · solid\n"`.
  - `parses labels, colours and styles`: `"- training: Deep Training · chart-5 · hatched\n- Gym: Gym | success | solid"` → `[{id:"training",label:"Deep Training",color:"chart-5",style:"hatched"},{id:"gym",label:"Gym",color:"success",style:"solid"}]`.
  - `missing parts default`: `"- x: X"` → `{id:"x",label:"X",color:"dim",style:"hatched"}`.
  - `bad lines warn and are skipped`: `"- a: A · pink · hatched\n- a: Again\n- nonsense\n- b: B · accent · dotted"` → 4 warnings; categories `a` (color `dim`) and `b` (style `hatched`).
  - `empty file means no categories`: `parseCategories("")` → `{ categories: [], warnings: [] }`.
  - `categoryColor`: `categoryColor(DEFAULT_CATEGORIES[0])` → `"var(--chart-2)"`; `categoryColor(undefined)` → `"var(--dim)"`.
- [ ] **Step 2: Run** `node --test test/categories.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/shared/categories.ts` per Interfaces.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: categories model parsed from markdown`.

---

### Task 2: Categories API on the server

**Files:**
- Modify: `src/server/app.ts`
- Create: `test/app.test.ts`

**Interfaces:**
- Consumes: `formatCategories`, `DEFAULT_CATEGORIES` (Task 1).
- Produces: `GET /api/categories` → `200 { markdown: string }` (creates `<daysDir>/categories.md` from `formatCategories(DEFAULT_CATEGORIES)` if missing); `PUT /api/categories` (body = file text) → `200 { ok: true }`, written with `writeAtomic`. SSE events become `{ type: "day", date }` or `{ type: "categories" }`; a change to `categories.md` broadcasts the latter (same 150 ms debounce, keyed `"categories"`).

- [ ] **Step 1: Write failing tests** in `test/app.test.ts`: create temp `daysDir` and `publicDir` (`fs.mkdtempSync`), `createApp`, `http.createServer(app.handle).listen(0)`, use `fetch`. Close server and `app.close()` after each.
  - `GET /api/categories creates the defaults`: response `markdown` equals `formatCategories(DEFAULT_CATEGORIES)` and the file now exists on disk with that text.
  - `PUT /api/categories writes the file`: PUT `"- x: X"`, then GET returns `"- x: X"`; file on disk is `"- x: X"`.
  - `an empty categories file stays empty`: write `""` to disk first; GET returns `""` (not the defaults).
  - `categories.md is not a day`: `GET /api/day/categories` → 400.
- [ ] **Step 2: Run** `node --test test/app.test.ts` → FAIL (404 on `/api/categories`).
- [ ] **Step 3: Implement** the route and watcher branch in `src/server/app.ts`; change `broadcast` to take the event object.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: serve and watch categories.md`.

---

### Task 3: Parser — nested priorities, block children, gcal id

**Files:**
- Modify: `src/shared/day.ts`, `test/day.test.ts`, `examples/2026-10-29.md`

**Interfaces:**
- Consumes: nothing new. `day.ts` stops importing/owning categories: delete `Category`, `CATEGORIES`, `categoryFor` from `day.ts` (callers move to Task 1's `findCategory`). `parseDay` no longer warns about unknown categories (spec: removed tags render grey, no warning bar).
- Produces:
  ```ts
  export interface Priority { text: string; done: boolean; line: number; depth: number; total: number; doneCount: number } // total/doneCount: direct children
  export interface BlockChild { kind: "link" | "note"; text: string; label?: string; url?: string; depth: number; line: number }
  // text = content with the bullet stripped; depth 1 = directly under the block
  export interface Block { start: number; end: number; category: string; title: string; url?: string; gcal?: string; children: BlockChild[]; line: number }
  export function setPriorities(text: string, body: string): string; // like setBrainDump; missing section → inserted after front matter
  // exported for schedule.ts:
  export const BLOCK_RE: RegExp; export function parseTime(s: string): number | null;
  export function sectionRange(lines: string[], name: RegExp): { head: number; end: number } | null;
  export function indentWidth(raw: string): number; // leading whitespace, tab = 2
  ```

Rules:
- Priorities: depth from a stack of indent widths (any consistent indent). An indented task with no task above it is depth 0.
- Schedule: an indented non-empty line attaches to the most recent block line; with no block above it, it warns as today. A child that is exactly `[label](https?://…)` or a bare `https?://\S+` (after stripping `- `/`* `) is a `link` (bare URL: `label` = url); anything else is a `note`. Blank lines don't break attachment.
- `gcal` = the id from a trailing `<!-- gcal:ID -->`.

- [ ] **Step 1: Update the fixture** `examples/2026-10-29.md`: under "Draft Q1 hiring plan" add `  - [x] Collect headcount numbers` and `  - [ ] Write the proposal`; give the 1:1 line `<!-- gcal:x1 -->` and children `  - [1:1 running doc](https://docs.google.com/document/d/abc)` and `  - Ask about on-call rota changes`.
- [ ] **Step 2: Update existing tests** for the new line numbers and shape (`togglePriority` line, standup `line`, `children: []` in the deep-equal, unknown-category warning count now 2) and **add failing tests**:
  - `nests priorities`: in the fixture, "Draft Q1 hiring plan" has `depth 0, total 2, doneCount 1`; "Write the proposal" has `depth 1`; tab-indented `"## Priorities\n- [ ] a\n\t- [ ] b\n\t\t- [ ] c\n"` → depths `[0,1,2]`.
  - `block children`: the 1:1 block has `gcal: "x1"` and children `[{kind:"link",label:"1:1 running doc",url:"https://docs.google.com/document/d/abc",…},{kind:"note",text:"Ask about on-call rota changes",depth:1,…}]`; fixture still has `warnings: []`.
  - `bare url child is a link`; `orphan indented line warns`: `"## Schedule\n  - stray\n"` → 1 warning.
  - `unknown categories don't warn`: `"## Schedule\n- 10:00-11:00 [gym] Run\n"` → 0 warnings, `category: "gym"`.
  - `setPriorities replaces only priorities`: body `"- [ ] a\n  - [ ] b"`; Schedule and Brain dump byte-identical; parsed depths `[0,1]`; on a file without the section it's inserted after the front matter.
- [ ] **Step 3: Run** `npm test` → new tests FAIL.
- [ ] **Step 4: Implement** in `day.ts`. Extract a private `replaceSection(text, re, heading, body, place)` shared by `setBrainDump` and `setPriorities`.
- [ ] **Step 5: Run** `npm test` → PASS (typecheck will fail in `main.ts` until Task 5; run `tsc -p tsconfig.json --noEmit` only for the shared/server side if needed, or temporarily keep `main.ts` compiling by switching it to `findCategory(DEFAULT_CATEGORIES, …)`, which Task 5 then replaces).
- [ ] **Step 6: Commit** `feat: nested priorities and block child lines in the parser`.

---

### Task 4: Schedule transforms

**Files:**
- Create: `src/shared/schedule.ts`, `test/schedule.test.ts`

**Interfaces:**
- Consumes: `parseDay`, `BLOCK_RE`, `parseTime`, `formatTime`, `sectionRange`, `indentWidth`, `Block` (Task 3).
- Produces:
  ```ts
  export interface BlockFields { start: number; end: number; category: string; title: string; url?: string; gcal?: string }
  export interface BlockEdit { fields: BlockFields; links?: { label: string; url: string }[]; notes?: string } // links/notes undefined = keep children as-is
  export interface Snapshot { line: number; text: string; children: string[] } // raw lines at dialog open
  export type EditResult = { ok: true; text: string; line: number } | { ok: false; error: string };
  export function formatBlockLine(f: BlockFields): string; // "- 09:00-09:30 [focus] Title https://… <!-- gcal:id -->", parts omitted when empty
  export function snapshotBlock(text: string, line: number): Snapshot;
  export function locateBlock(text: string, snap: Snapshot): number; // snap.line if that line still equals snap.text, else first line equal to snap.text, else -1
  export function retimeBlock(text: string, line: number, start: number, end: number): string;
  export function pushBlocks(text: string, from: number, minutes: number): string;
  export function upsertBlock(text: string, snap: Snapshot | null, edit: BlockEdit): EditResult; // snap null = create
  export function deleteBlock(text: string, snap: Snapshot): EditResult;
  ```

Rules:
- `retimeBlock` replaces only the time range at the start of the line (rest of the line byte-identical), clamps to `0 ≤ start < end ≤ 1440`, (a range past 24:00 shifts earlier to end at 24:00 keeping its duration; one before 00:00 shifts to start at 00:00), then moves the line **and its child lines** to its start-time position (stable among equal starts), reusing the spacing rules of `insertBlock`.
- `pushBlocks` shifts every block without `gcal` whose `start ≥ from` by `minutes`; a block whose end would pass 24:00 is placed to end at 24:00 keeping its duration (start clamped at 0). Result stays sorted.
- `upsertBlock`: the main line is rewritten with `formatBlockLine` only if `edit.fields` differs from what the current line parses to (so a calendar line with only new notes keeps every byte). If `links`/`notes` is defined and the file's current children ≠ `snap.children` → `{ ok: false, error: "This block changed in the file — reopen it." }`. Children written as links first (`  - [label](url)`), then each non-empty notes line as `  - text` (leading `- `/`* ` stripped, extra leading spaces in the textarea kept as deeper indent). Then re-sorted like `retimeBlock`. Block not found (`locateBlock` = -1) → `{ ok: false, error: "This block is no longer in the file." }`.
- `deleteBlock` removes the line and its children; refuses calendar blocks with `{ ok: false, error: "Calendar meetings can't be deleted here." }`.

- [ ] **Step 1: Write failing tests** in `test/schedule.test.ts` (use the fixture):
  - `formatBlockLine`: `{start:540,end:570,category:"focus",title:"X"}` → `"- 09:00-09:30 [focus] X"`; with url and gcal → `"- 11:00-11:30 [meeting] 1:1 https://meet.google.com/a <!-- gcal:x1 -->"`.
  - `retime keeps the rest of the line`: retime "Q1 hiring plan" to 09:45–11:15 → line reads `"- 09:45-11:15 [focus] Q1 hiring plan"`; all other lines identical.
  - `retime moves the block with its children`: move the 1:1 (with 2 children) to 16:30–17:00 → it and its two children sit after "RFC comments"; text still ends `"…\n\n## Brain dump"` section intact; `parseDay` warnings `[]`, 1:1 children length 2.
  - `retime clamps at midnight`: retime a block to 23:50–24:30 (1430–1470) → line starts `"- 23:20-24:00"` (duration kept, end clamped to 24:00); `parseDay` warnings `[]`.
  - `push skips calendar blocks`: `pushBlocks(fixture, 600, 15)` → "1:1 with Sam" (gcal) unchanged, "Architecture review" etc. moved +15, blocks before 10:00 unchanged.
  - `push past midnight clamps`: a 23:30–23:45 block pushed 30 → `23:45-24:00`.
  - `upsert creates in order`: `upsertBlock(fixture, null, {fields:{start:600,end:630,category:"admin",title:"New"}})` → ok, line between 09:30 and 11:00 blocks.
  - `upsert notes on a calendar block keeps its line`: add note "Prep slides" via `notes` → main line byte-identical, children now `[link, "Ask about…" , "Prep slides"]` in standard form.
  - `upsert refuses when children changed underneath`: snapshot, then edit the file's child line, then upsert with `notes` → `ok: false`; same without `notes`/`links` (fields-only) → ok.
  - `locate finds a moved line`: insert a line above, `locateBlock` returns `snap.line + 1`.
  - `delete removes children and refuses calendar`.
- [ ] **Step 2: Run** `node --test test/schedule.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/shared/schedule.ts`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: schedule text transforms for UI editing`.

---

### Task 5: Web — categories from the file, pencils, categories editor

**Files:**
- Create: `src/web/dom.ts`
- Modify: `src/web/main.ts`, `src/web/styles.css`

**Interfaces:**
- Consumes: Task 1 (`parseCategories`, `findCategory`, `categoryColor`), Task 2 API/SSE.
- Produces (`dom.ts`): `h`, `svg` (moved verbatim from `main.ts`), and icons `pencil()`, `eye()`, `eyeOff()`, `link()`, `trash()` returning `SVGSVGElement` (pencil: heroicons-outline "pencil-square"-style path in the existing stroke style). `State` gains `categories: Category[]`, `categoryWarnings: string[]`, and `editing` gains `target: "day" | "categories"`.

Behaviour:
- Boot loads `/api/categories`; SSE `{type:"categories"}` reloads them (if the categories editor is open, flag `changedOnDisk` as the day editor does).
- Header: the text "Edit" button becomes an `icon-btn` with `pencil()`, title "Edit the day's markdown (E)". Legend built from `state.categories`.
- Schedule head: a small `pencil()` icon-btn beside the totals, title "Edit categories", opens the editor with `target: "categories"` and the file text; save PUTs `/api/categories`. Editor hint for categories: `"⌘S / Ctrl+S saves · Esc cancels · - tag: Label · colour · solid|hatched"`.
- Blocks: class `solid` or `hatched` from the category's style; unknown tag → class `unknown`, `--cat: var(--dim)`, hatched, label = the raw tag. Replace the `.cat-meeting` selectors in `styles.css` with `.solid` / `.hatched`.
- Error bar shows day warnings plus `categoryWarnings`.
- Shortcut guard: ignore keys when the target is inside `input, textarea, select, dialog`, or any draft/editor/dialog is open.

- [ ] **Step 1: Move `h`/`svg`/icons to `dom.ts`; wire categories state, API load/save, SSE, legend, block classes, pencils, error bar, guard.**
- [ ] **Step 2: Run** `npm run typecheck && npm test` → PASS.
- [ ] **Step 3: Manual check** (`npm start`): defaults look identical to before; add `- training: Training · chart-5 · hatched` via the pencil and a `[training]` block shows chart-5; delete the category → block goes grey, labelled "training", no error bar; break a line → warning bar, page still renders; switch through all themes.
- [ ] **Step 4: Commit** `feat: categories come from categories.md, pencil edit actions`.

---

### Task 6: Web — nested priorities and inline editing

**Files:**
- Create: `src/shared/indent.ts`, `test/indent.test.ts`
- Modify: `src/web/main.ts`, `src/web/styles.css`

**Interfaces:**
- Consumes: `Priority` (Task 3), `setPriorities` (Task 3), `pencil()` (Task 5).
- Produces: `export function indentLines(value: string, selStart: number, selEnd: number, outdent: boolean): { value: string; selStart: number; selEnd: number }` — adds/removes two leading spaces on every line touched by the selection (outdent removes up to two). `State` gains `prioritiesDraft: string | null`.

- [ ] **Step 1: Write failing tests** in `test/indent.test.ts`: indent a caret on line 2 of `"a\nb\nc"` → `"a\n  b\nc"`, caret +2; multi-line selection over `a`–`b` indents both; outdent of `" x"` → `"x"`; outdent of `"x"` unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: UI.** Render each priority with `padding-left` by `depth`; a parent with `total > 0` shows `doneCount/total` in muted text. Card head gets a `pencil()` icon-btn (top right, title "Edit priorities") that sets `prioritiesDraft` to the raw section body; while set, render a textarea that behaves exactly like the brain dump editor (`DUMP_SAVE_MS` autosave via `setPriorities`, Esc/⌘S/blur finish, live updates only refresh `state.markdown`), with Tab/Shift+Tab → `indentLines` (preventDefault).
- [ ] **Step 6: Manual check**: tick a sub-task, count updates; pencil → Tab-indent a line, Esc, file shows `  - [ ]`; brain dump and schedule untouched in the file.
- [ ] **Step 7: Commit** `feat: nested priorities with inline editing`.

---

### Task 7: Web — block details dialog

**Files:**
- Create: `src/web/dialog.ts`
- Modify: `src/web/main.ts`, `src/web/styles.css`

**Interfaces:**
- Consumes: `Block`, `Category`, `BlockEdit`, `Snapshot`, `snapshotBlock`, `upsertBlock`, `deleteBlock`, `pushBlocks`, icons.
- Produces:
  ```ts
  export interface DialogOptions {
    block: Block | null;            // null = new block
    slot?: { start: number; end: number };
    categories: readonly Category[];
    onSave(edit: BlockEdit, pushMinutes?: number): Promise<string | null>; // resolves to an error message or null
    onDelete(): Promise<string | null>;
    onOpenMarkdown(): void;
  }
  export function openBlockDialog(opts: DialogOptions): void; // native <dialog> appended to document.body, showModal(), removed on close
  ```

Behaviour (spec "The details dialog"):
- Fields: title (focused), category `<select>` (an unknown tag appears as "tag (removed)" and stays selected), start/end `<input type="time" step="300">`, duration text, video link input (the line's own URL), links list (label + URL, add/remove), notes textarea (children notes, one per line, deeper depth as two spaces each), "Open in markdown" link button, Delete (own existing blocks only, with `trash()`), Cancel, Save. ⌘/Ctrl+Enter and Enter in title save; Esc (native `cancel`) closes.
- Calendar block: title, category, times, video link read-only; no Delete.
- Push row (existing blocks only): number input default 15 + "Push my blocks after this back" button → `onSave(edit, minutes)`.
- `links`/`notes` are passed in the edit only if the user changed them. Errors from `onSave`/`onDelete` show inside the dialog; dialog stays open.
- Styles: `.dialog` on `--surface` with `--border`, `--r-lg`, `--shadow`; inputs on `--surface-2` with `--fg`; `::backdrop` dimmed.

In `main.ts`:
- Block `ondblclick` → `openBlockDialog` with `snapshotBlock(state.markdown, block.line)` captured; `onSave` applies `upsertBlock(state.markdown, snap, edit)` then, if `pushMinutes`, `pushBlocks(result.text, edit.fields.start, pushMinutes)`, and saves once; `onOpenMarkdown` = old double-click behaviour (`startEditing` at the block's caret).
- Slot click → dialog with `block: null`, `slot: { start: minutes, end: minutes + 30 }`, category `focus` preselected (first category if `focus` absent). `addBlockAt` is deleted.

- [ ] **Step 1: Implement `dialog.ts` and wiring.**
- [ ] **Step 2: Run** `npm run typecheck && npm test` → PASS.
- [ ] **Step 3: Manual check**: create from an empty slot; edit title/times of an own block (line moves into order); add a link + note to a calendar meeting (its main line unchanged in the file); push from a calendar meeting moves only own blocks after it; delete; while the dialog is open, `touch`/edit the day file from a terminal — dialog survives, and a notes save after editing that block's notes in the file shows the "changed in the file" error; typing `e`/`b`/`t` in the dialog doesn't trigger shortcuts; check two themes (one light, one dark).
- [ ] **Step 4: Commit** `feat: block details dialog`.

---

### Task 8: Web — drag to move, drag bottom edge to resize

**Files:**
- Create: `src/web/drag.ts`
- Modify: `src/web/main.ts`, `src/web/styles.css`

**Interfaces:**
- Consumes: `retimeBlock` (Task 4).
- Produces:
  ```ts
  export interface DragOptions {
    start: number; end: number;      // minutes
    pxPerMinute: number;             // SLOT_PX / 30
    onPreview(start: number, end: number): void;
    onCommit(start: number, end: number): void;
    onCancel(): void;
  }
  export function attachDrag(el: HTMLElement, handle: HTMLElement, opts: DragOptions): void;
  export function isDragging(): boolean;
  ```

Behaviour:
- Only blocks without `gcal` get a bottom `.resize-handle` (6px, `ns-resize`) and `attachDrag`; calendar blocks get neither (and `cursor: default`).
- Pointer down on the body = move; on the handle = resize. Nothing happens until the pointer moves 4px (so click → Meet and double-click → dialog still work; suppress the click that follows a real drag). Snap to 5 min, min length 5, clamp 0–1440. Live preview updates the block's `top`/`height` and its time label; a `.ghost` outline stays at the original position. Esc cancels. `setPointerCapture` for reliability.
- `onCommit` → `save(retimeBlock(state.markdown, block.line, start, end))` then render. While `isDragging()`, SSE-triggered `load`/`render` is deferred and run on pointer up.

- [ ] **Step 1: Implement `drag.ts` and wiring.**
- [ ] **Step 2: Run** `npm run typecheck && npm test` → PASS.
- [ ] **Step 3: Manual check**: drag "Q1 hiring plan" 15 min later (file line rewritten, order kept); resize bottom edge; click a meeting still opens Meet, double-click still opens the dialog; calendar block can't be dragged; drag past the last visible hour; Esc mid-drag restores; edit the file in a terminal mid-drag — no jump, refresh after drop.
- [ ] **Step 4: Commit** `feat: drag and resize blocks on the timeline`.

---

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: `CLAUDE.md`**: format section adds child lines (block links/notes, nested priorities, two spaces per level); categories now come from `categories.md` in the days folder — read it to pick a tag; when moving a block keep its child lines with it; calendar re-sync updates a `gcal:` line in place and keeps its indented child lines (drops them only when the event is removed); Code section mentions `schedule.ts`, `categories.ts` and the new tests.
- [ ] **Step 2: `README.md`**: "Using it" covers the pencils, nested priorities with Tab, drag/resize (not for calendar meetings), the dialog (double-click a block, click an empty slot), push-back, and the categories file; Format shows children.
- [ ] **Step 3: Run** `npm run typecheck && npm test` → PASS.
- [ ] **Step 4: Commit** `docs: UI editing, child lines and categories.md`.
