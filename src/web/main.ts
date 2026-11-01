import {
  formatTime,
  isDate,
  layoutBlocks,
  parseDay,
  sectionRange,
  setBrainDump,
  setPriorities,
  togglePriority,
  type Block,
  type Day,
} from "../shared/day.ts";
import { deleteBlock, locateBlock, pushBlocks, retimeBlock, snapshotBlock, upsertBlock, type Snapshot } from "../shared/schedule.ts";
import { categoryColor, findCategory, parseCategories, type Category } from "../shared/categories.ts";
import { indentLines } from "../shared/indent.ts";
import { openBlockDialog } from "./dialog.ts";
import { attachDrag, isDragging } from "./drag.ts";
import { eye, eyeOff, h, pencil } from "./dom.ts";
import { THEMES, applySavedTheme, currentTheme, saveTheme } from "./themes.ts";

const SLOT_PX = 36; // height of 30 minutes on the timeline
const DUMP_SAVE_MS = 600;
const HIDE_PERSONAL_KEY = "timeblock.hidePersonal";

interface State {
  today: string;
  date: string;
  markdown: string;
  exists: boolean;
  editing: { target: "day" | "categories"; text: string; caret?: number } | null;
  categories: Category[];
  categoryWarnings: string[];
  /** The raw categories.md text, kept so the editor opens on the real file. */
  categoriesText: string;
  changedOnDisk: boolean;
  /** The brain dump being typed in place; while set, live updates refresh the file text but not the page. */
  dumpDraft: string | null;
  /** The priorities being edited in place; handled exactly like the brain dump. */
  prioritiesDraft: string | null;
  hidePersonal: boolean;
}

function storedFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

const state: State = {
  today: "",
  date: "",
  markdown: "",
  exists: false,
  editing: null,
  categories: [],
  categoryWarnings: [],
  categoriesText: "",
  changedOnDisk: false,
  dumpDraft: null,
  prioritiesDraft: null,
  hidePersonal: storedFlag(HIDE_PERSONAL_KEY),
};
const app = document.getElementById("app")!;

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

async function load(date: string): Promise<void> {
  const r = await fetch(`/api/day/${date}`);
  const body = (await r.json()) as { markdown: string; exists: boolean; error?: string };
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  state.date = date;
  state.markdown = body.markdown;
  state.exists = body.exists;
  state.changedOnDisk = false;
  if (location.hash.slice(1) !== date) history.replaceState(null, "", date === state.today ? "#" : `#${date}`);
  render();
}

async function save(text: string): Promise<void> {
  const r = await fetch(`/api/day/${state.date}`, { method: "PUT", body: text });
  if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? r.statusText);
  state.markdown = text;
  state.exists = true;
}

async function loadCategories(): Promise<void> {
  const r = await fetch("/api/categories");
  const body = (await r.json()) as { markdown: string; error?: string };
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  const parsed = parseCategories(body.markdown);
  state.categoriesText = body.markdown;
  state.categories = parsed.categories;
  state.categoryWarnings = parsed.warnings;
}

async function saveCategories(text: string): Promise<void> {
  const r = await fetch("/api/categories", { method: "PUT", body: text });
  if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? r.statusText);
  const parsed = parseCategories(text);
  state.categoriesText = text;
  state.categories = parsed.categories;
  state.categoryWarnings = parsed.warnings;
}

function startEditing(text = state.markdown, caret?: number): void {
  state.editing = { target: "day", text, caret };
  state.changedOnDisk = false;
  render();
}

function startEditingCategories(): void {
  state.editing = { target: "categories", text: state.categoriesText };
  state.changedOnDisk = false;
  render();
}

/** Where the caret goes to land on `line` in the editor. */
function caretAt(text: string, line: number): number {
  return text.split("\n").slice(0, line + 1).join("\n").length;
}

/** Applies a dialog edit to the latest file text (not the text the dialog opened on) and saves it in one write. */
async function writeBlock(next: (text: string) => { ok: true; text: string } | { ok: false; error: string }): Promise<string | null> {
  const r = next(state.markdown);
  if (!r.ok) return r.error;
  if (r.text !== state.markdown) {
    try {
      await save(r.text);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  if (!state.editing && state.dumpDraft === null && state.prioritiesDraft === null) render();
  return null;
}

/** The details dialog for `block`, or for a new block in `slot`. */
function openDialog(block: Block | null, slot?: { start: number; end: number }): void {
  const snap: Snapshot | null = block ? snapshotBlock(state.markdown, block.line) : null;
  openBlockDialog({
    block,
    slot,
    categories: state.categories,
    onSave: (edit, pushMinutes) =>
      writeBlock((text) => {
        const r = upsertBlock(text, snap, edit);
        return r.ok && pushMinutes ? { ok: true, text: pushBlocks(r.text, edit.fields.start, pushMinutes) } : r;
      }),
    onDelete: () => (snap ? writeBlock((text) => deleteBlock(text, snap)) : Promise.resolve(null)),
    onOpenMarkdown: () => {
      if (!block) return startEditing();
      const line = snap ? locateBlock(state.markdown, snap) : -1;
      startEditing(state.markdown, line === -1 ? undefined : caretAt(state.markdown, line));
    },
  });
}

/**
 * Writes a dragged block's new times into the latest file text. The block is found again by the line it had when it was
 * drawn (a live reload during the drag refreshes the text but not the page), and the drop is dropped if the day changed.
 */
async function dropBlock(snap: Snapshot, date: string, start: number, end: number): Promise<void> {
  const line = state.date === date ? locateBlock(state.markdown, snap) : -1;
  const next = line === -1 ? state.markdown : retimeBlock(state.markdown, line, start, end);
  if (next === state.markdown) return afterDrag();
  const before = state.markdown;
  state.markdown = next; // show the drop straight away rather than after the round trip
  afterDrag();
  try {
    await save(next);
  } catch (e) {
    console.error(e);
    if (state.markdown === next) state.markdown = before;
    await load(state.date);
  }
}

/** Puts the page back in step with the file once a drag ends: the preview goes, and any render held back during it runs. */
function afterDrag(): void {
  if (!state.editing && state.dumpDraft === null && state.prioritiesDraft === null) render();
}

// ---------- view ----------

function header(): HTMLElement {
  const isToday = state.date === state.today;
  return h(
    "header",
    { class: "top" },
    h(
      "div",
      { class: "nav" },
      h("button", { class: "icon-btn", title: "Previous day (←)", onclick: () => void load(addDays(state.date, -1)) }, "‹"),
      h("button", { class: "btn", disabled: isToday, onclick: () => void load(state.today) }, "Today"),
      h("button", { class: "icon-btn", title: "Next day (→)", onclick: () => void load(addDays(state.date, 1)) }, "›"),
      h("h1", { class: "date" }, longDate(state.date)),
      !state.exists && h("span", { class: "text-muted hint" }, "not started"),
    ),
    h(
      "div",
      { class: "legend" },
      ...state.categories.map((c) => h("span", { class: "legend-item", style: `--cat:${categoryColor(c)}` }, h("i"), c.label)),
    ),
    h(
      "div",
      { class: "actions" },
      state.editing && h("button", { class: "btn", onclick: () => ((state.editing = null), render()) }, "Cancel"),
      state.editing
        ? h("button", { class: "btn btn-primary", onclick: () => void saveEditor() }, "Save")
        : h("button", { class: "icon-btn", title: "Edit the day's markdown (E)", onclick: () => startEditing() }, pencil()),
      h(
        "button",
        {
          class: `icon-btn${state.hidePersonal ? " on" : ""}`,
          title: state.hidePersonal ? "Show personal block titles (P)" : "Hide personal block titles (P)",
          "aria-pressed": state.hidePersonal ? "true" : "false",
          onclick: () => togglePersonal(),
        },
        state.hidePersonal ? eyeOff() : eye(),
      ),
      themePicker(),
    ),
  );
}

function togglePersonal(): void {
  state.hidePersonal = !state.hidePersonal;
  try {
    localStorage.setItem(HIDE_PERSONAL_KEY, state.hidePersonal ? "1" : "0");
  } catch {
    // storage unavailable: the toggle still works until reload
  }
  render();
}

function themePicker(): HTMLElement {
  const menu = h("div", { class: "menu", hidden: true });
  for (const t of THEMES) {
    menu.append(
      h(
        "button",
        {
          class: `menu-item${t.id === currentTheme() ? " active" : ""}`,
          onclick: () => {
            saveTheme(t.id);
            render();
          },
        },
        h("span", { class: "swatch" }, ...t.swatch.map((c) => h("i", { style: `background:${c}` }))),
        t.name,
      ),
    );
  }
  const btn = h("button", { class: "icon-btn", title: "Theme", onclick: (e: Event) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  } }, "◐");
  document.addEventListener("click", () => (menu.hidden = true), { once: true });
  return h("div", { class: "menu-wrap" }, btn, menu);
}

let prioritiesTimer: ReturnType<typeof setTimeout> | undefined;

/** The raw lines under ## Priorities (indentation intact), without the blank lines around them. */
function prioritiesBody(markdown: string): string {
  const lines = markdown.split("\n");
  const range = sectionRange(lines, /^##\s+priorities\s*$/i);
  return range ? lines.slice(range.head + 1, range.end).join("\n").replace(/^\s*\n/, "").trimEnd() : "";
}

/** Saves the priorities into the latest copy of the file, so edits elsewhere in it survive. */
async function savePriorities(): Promise<void> {
  clearTimeout(prioritiesTimer);
  if (state.prioritiesDraft === null) return;
  const next = setPriorities(state.markdown, state.prioritiesDraft);
  if (next === state.markdown) return;
  state.markdown = next;
  await save(next);
}

function startPriorities(): void {
  state.prioritiesDraft = prioritiesBody(state.markdown);
  render();
}

function prioritiesEditor(): HTMLElement {
  const ta = h("textarea", { class: "dump dump-edit priorities-edit", spellcheck: false, placeholder: "- [ ] Something that matters today" }) as HTMLTextAreaElement;
  ta.value = state.prioritiesDraft!;
  const grow = (): void => {
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 2}px`;
  };
  ta.addEventListener("input", () => {
    state.prioritiesDraft = ta.value;
    grow();
    clearTimeout(prioritiesTimer);
    prioritiesTimer = setTimeout(() => void savePriorities(), DUMP_SAVE_MS);
  });
  const finish = async (keep: boolean): Promise<void> => {
    if (state.prioritiesDraft === null) return;
    if (keep) await savePriorities();
    clearTimeout(prioritiesTimer);
    state.prioritiesDraft = null;
    await load(state.date);
  };
  ta.addEventListener("blur", () => void finish(true));
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter"))) {
      e.preventDefault();
      ta.blur();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const r = indentLines(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey);
      ta.value = r.value;
      ta.setSelectionRange(r.selStart, r.selEnd);
      ta.dispatchEvent(new Event("input"));
    }
  });
  queueMicrotask(() => {
    grow();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  return ta;
}

function priorities(day: Day): HTMLElement {
  const editing = state.prioritiesDraft !== null;
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("h2", { class: "label" }, "Today's priorities"),
      editing
        ? h("span", { class: "text-muted hint" }, "saves as you type · Tab to nest · Esc to finish")
        : h("button", { class: "icon-btn", title: "Edit priorities", onclick: () => startPriorities() }, pencil()),
    ),
    editing
      ? prioritiesEditor()
      : day.priorities.length
      ? h(
          "ul",
          { class: "priorities" },
          ...day.priorities.map((p) =>
            h(
              "li",
              { class: p.done ? "done" : "", style: `padding-left:${p.depth * 1.25}rem` },
              h("label", {},
                h("input", {
                  type: "checkbox",
                  checked: p.done,
                  onchange: async () => {
                    await save(togglePriority(state.markdown, p.line));
                    render();
                  },
                }),
                h("span", {}, p.text),
                p.total > 0 && h("span", { class: "text-muted hint count" }, `${p.doneCount}/${p.total}`),
              ),
            ),
          ),
        )
      : h("p", { class: "empty" }, "None yet. Add them under ## Priorities."),
  );
}

let dumpTimer: ReturnType<typeof setTimeout> | undefined;

/** Saves the brain dump into the latest copy of the file, so edits elsewhere in it (Claude, the editor) survive. */
async function saveDump(): Promise<void> {
  clearTimeout(dumpTimer);
  if (state.dumpDraft === null) return;
  const next = setBrainDump(state.markdown, state.dumpDraft);
  if (next === state.markdown) return;
  state.markdown = next; // before the request, so a click elsewhere (a checkbox, a slot) builds on it
  await save(next);
}

function brainDump(day: Day): HTMLElement {
  const editing = state.dumpDraft !== null;
  let body: HTMLElement;
  if (editing) {
    const ta = h("textarea", { class: "dump dump-edit", spellcheck: false, placeholder: "Anything on your mind…" }) as HTMLTextAreaElement;
    ta.value = state.dumpDraft!;
    const grow = (): void => {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight + 2}px`;
    };
    ta.addEventListener("input", () => {
      state.dumpDraft = ta.value;
      grow();
      clearTimeout(dumpTimer);
      dumpTimer = setTimeout(() => void saveDump(), DUMP_SAVE_MS);
    });
    const finish = async (keep: boolean): Promise<void> => {
      if (state.dumpDraft === null) return;
      if (keep) await saveDump();
      clearTimeout(dumpTimer);
      state.dumpDraft = null;
      await load(state.date); // pick up anything that changed while typing
    };
    ta.addEventListener("blur", () => void finish(true));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter"))) {
        e.preventDefault();
        ta.blur();
      }
    });
    queueMicrotask(() => {
      grow();
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    body = ta;
  } else {
    body = h(
      "div",
      {
        class: `dump dump-view${day.brainDump ? "" : " empty"}`,
        role: "button",
        tabindex: "0",
        title: "Click to write",
        onclick: () => startDump(day.brainDump),
        onkeydown: (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter") {
            e.preventDefault();
            startDump(day.brainDump);
          }
        },
      },
      day.brainDump || "Click to jot something down…",
    );
  }
  return h(
    "section",
    { class: "card grow" },
    h("div", { class: "card-head" }, h("h2", { class: "label" }, "Brain dump"), editing && h("span", { class: "text-muted hint" }, "saves as you type · Esc to finish")),
    body,
  );
}

function startDump(current: string): void {
  state.dumpDraft = current;
  render();
}

function schedule(day: Day): HTMLElement {
  const startMin = day.startHour * 60;
  const slots = (day.endHour - day.startHour) * 2;
  const grid = h("div", { class: "timeline", style: `height:${slots * SLOT_PX}px` });

  for (let s = 0; s < slots; s++) {
    const minutes = startMin + s * 30;
    grid.append(
      h(
        "button",
        {
          class: `slot${s % 2 ? " half" : ""}`,
          style: `top:${s * SLOT_PX}px;height:${SLOT_PX}px`,
          title: `Add a block at ${formatTime(minutes)}`,
          onclick: () => openDialog(null, { start: minutes, end: minutes + 30 }),
        },
        s % 2 ? "" : h("span", { class: "hour" }, formatTime(minutes)),
      ),
    );
  }

  const isToday = day.date === state.today;
  const now = nowMinutes();
  for (const { block, lane, lanes } of layoutBlocks(day.blocks)) {
    const cat = findCategory(state.categories, block.category);
    const top = ((block.start - startMin) / 30) * SLOT_PX;
    const height = ((block.end - block.start) / 30) * SLOT_PX;
    const current = isToday && now >= block.start && now < block.end;
    const past = isToday && now >= block.end;
    const mins = block.end - block.start;
    const hidden = state.hidePersonal && block.category === "personal";
    const label = cat?.label ?? block.category;
    const title = hidden ? label : block.title || label;
    // Meetings open their link (from the calendar sync), or Google Meet when there isn't one.
    const link = block.url ?? (block.category === "meeting" ? "https://meet.google.com/" : undefined);
    const time = `${formatTime(block.start)}–${formatTime(block.end)}`;
    const own = !block.gcal;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const timeEl = h("span", { class: "block-time" }, time);
    const el = h(
      "div",
      {
        class: `block ${own ? "own" : "calendar"} ${cat ? cat.style : "hatched unknown"}${current ? " current" : ""}${past ? " past" : ""}${mins < 60 ? " short" : ""}${mins <= 15 ? " tiny" : ""}${hidden ? " private" : ""}${link ? " linked" : ""}`,
        style: `--cat:${categoryColor(cat)};top:${top}px;height:${height - 2}px;left:calc(var(--gutter) + (100% - var(--gutter)) * ${lane} / ${lanes});width:calc((100% - var(--gutter)) / ${lanes} - 4px)`,
        title: `${time} · ${label}${hidden ? "" : `\n${block.title}`}${link ? `\nClick to open ${block.url ? "the meeting link" : "Google Meet"} · double-click to edit` : "\nDouble-click to edit"}${own ? "\nDrag to move · drag the bottom edge to resize" : ""}`,
        // Wait out a possible double-click so editing a meeting doesn't also open it.
        onclick: () => {
          if (!link) return;
          clearTimeout(clickTimer);
          clickTimer = setTimeout(() => window.open(link, "_blank", "noopener"), 250);
        },
        ondblclick: () => {
          clearTimeout(clickTimer);
          openDialog(block);
        },
      },
      timeEl,
      h("span", { class: "block-title" }, title),
    );
    if (own) {
      const handle = h("div", { class: "resize-handle", "aria-hidden": "true" });
      el.append(handle);
      const snap = snapshotBlock(state.markdown, block.line);
      const date = state.date;
      attachDrag(el, handle, {
        start: block.start,
        end: block.end,
        pxPerMinute: SLOT_PX / 30,
        onPreview: (s, e) => {
          clearTimeout(clickTimer); // a click just before the drag must not open the link
          timeEl.textContent = `${formatTime(s)}–${formatTime(e)}`;
          // Let the timeline grow under a block dragged past the last hour, as it will once dropped.
          grid.style.height = `${Math.max(slots * SLOT_PX, ((e - startMin) / 30) * SLOT_PX)}px`;
        },
        onCommit: (s, e) => void dropBlock(snap, date, s, e),
        onCancel: () => afterDrag(),
      });
    }
    grid.append(el);
  }

  if (isToday && now >= startMin && now <= day.endHour * 60) {
    grid.append(h("div", { class: "now", style: `top:${((now - startMin) / 30) * SLOT_PX}px` }));
  }

  const totals = state.categories.map((c) => ({
    c,
    mins: day.blocks.filter((b) => b.category === c.id).reduce((n, b) => n + b.end - b.start, 0),
  })).filter((t) => t.mins);

  return h(
    "section",
    { class: "card schedule" },
    h(
      "div",
      { class: "schedule-head" },
      h("h2", { class: "label" }, "Schedule"),
      h(
        "div",
        { class: "totals" },
        ...totals.map((t) =>
          h("span", { class: "legend-item", style: `--cat:${categoryColor(t.c)}` }, h("i"), `${t.c.label} ${(t.mins / 60).toFixed(1).replace(/\.0$/, "")}h`),
        ),
        h("button", { class: "icon-btn", title: "Edit categories", onclick: () => startEditingCategories() }, pencil()),
      ),
    ),
    grid,
  );
}

function editor(): HTMLElement {
  const target = state.editing!.target;
  const ta = h("textarea", { class: "editor", spellcheck: false }) as HTMLTextAreaElement;
  ta.value = state.editing!.text;
  const remember = (): void => {
    state.editing!.text = ta.value;
    state.editing!.caret = ta.selectionStart;
  };
  ta.addEventListener("input", remember);
  ta.addEventListener("click", remember);
  ta.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void saveEditor();
    } else if (e.key === "Escape") {
      state.editing = null;
      render();
    }
  });
  queueMicrotask(() => {
    ta.focus();
    const caret = state.editing?.caret ?? 0;
    ta.setSelectionRange(caret, caret);
    // Bring the caret's line into view.
    const line = ta.value.slice(0, caret).split("\n").length;
    ta.scrollTop = Math.max(0, line * 20 - ta.clientHeight / 2);
  });
  return h(
    "div",
    { class: "editor-wrap" },
    state.changedOnDisk &&
      h(
        "div",
        { class: "error-bar" },
        target === "day" ? "This day changed on disk while you were editing. " : "The categories changed on disk while you were editing. ",
        h(
          "button",
          {
            class: "link-btn",
            onclick: () =>
              void (target === "day"
                ? load(state.date).then(() => startEditing())
                : loadCategories().then(() => startEditingCategories())),
          },
          "Load the new version",
        ),
        " (discards your edits) or Save to overwrite it.",
      ),
    ta,
    h(
      "p",
      { class: "text-muted hint" },
      target === "day"
        ? "⌘S / Ctrl+S saves · Esc cancels · blocks: - 09:00-09:30 [meeting] Title"
        : "⌘S / Ctrl+S saves · Esc cancels · - tag: Label · colour · solid|hatched",
    ),
  );
}

async function saveEditor(): Promise<void> {
  if (!state.editing) return;
  if (state.editing.target === "categories") await saveCategories(state.editing.text);
  else await save(state.editing.text);
  state.editing = null;
  render();
}

function render(): void {
  if (isDragging()) return; // the page is redrawn when the drag ends (afterDrag), so the block under the pointer stays put
  const day = parseDay(state.date, state.markdown);
  app.replaceChildren(header());
  const warnings = [...day.warnings, ...state.categoryWarnings];
  if (warnings.length && !state.editing) app.append(h("div", { class: "error-bar" }, warnings.join("\n")));
  app.append(
    state.editing
      ? editor()
      : h("main", { class: "layout" }, h("div", { class: "side" }, priorities(day), brainDump(day)), schedule(day)),
  );
}

// ---------- wiring ----------

function onCategoriesChanged(): void {
  if (state.editing?.target === "categories") {
    // Our own save also fires this; only flag it if the file really differs from what we last saw.
    void fetch("/api/categories")
      .then((r) => r.json() as Promise<{ markdown: string }>)
      .then((b) => {
        if (state.editing?.target === "categories" && b.markdown !== state.categoriesText) {
          state.changedOnDisk = true;
          render();
        }
      });
  } else {
    void loadCategories().then(() => {
      if (!state.editing && state.dumpDraft === null && state.prioritiesDraft === null) render();
    });
  }
}

function connectLive(): void {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data as string) as { type: string; date?: string };
    if (ev.type === "categories") {
      onCategoriesChanged();
      return;
    }
    if (ev.type !== "day" || ev.date !== state.date) return;
    if (state.dumpDraft !== null || state.prioritiesDraft !== null) {
      // Keep the text box (and its focus) as it is; just track the file so the next save merges into it.
      void fetch(`/api/day/${state.date}`)
        .then((r) => r.json() as Promise<{ markdown: string }>)
        .then((b) => (state.markdown = b.markdown));
    } else if (state.editing?.target === "day") {
      // Our own save also fires this; only flag it if the file really differs from what we last saw.
      void fetch(`/api/day/${state.date}`)
        .then((r) => r.json() as Promise<{ markdown: string }>)
        .then((b) => {
          if (state.editing?.target === "day" && b.markdown !== state.markdown) {
            state.changedOnDisk = true;
            render();
          }
        });
    } else if (!state.editing) {
      void load(state.date);
    }
  };
}

document.addEventListener("keydown", (e) => {
  if (state.editing || state.dumpDraft !== null || state.prioritiesDraft !== null || isDragging() || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest("input, textarea, select, dialog")) return;
  if (e.key === "ArrowLeft") void load(addDays(state.date, -1));
  else if (e.key === "ArrowRight") void load(addDays(state.date, 1));
  else if (e.key === "t") void load(state.today);
  else if (e.key === "p") togglePersonal();
  else if (e.key === "b") {
    e.preventDefault();
    startDump(parseDay(state.date, state.markdown).brainDump);
  }
  else if (e.key === "e") {
    e.preventDefault();
    startEditing();
  }
});

window.addEventListener("hashchange", () => {
  const d = location.hash.slice(1);
  void load(isDate(d) ? d : state.today);
});

async function boot(): Promise<void> {
  applySavedTheme();
  state.today = ((await (await fetch("/api/today")).json()) as { date: string }).date;
  const d = location.hash.slice(1);
  await loadCategories();
  await load(isDate(d) ? d : state.today);
  connectLive();
  // Keep the now-line moving and roll over to the new day at midnight.
  setInterval(async () => {
    const today = ((await (await fetch("/api/today")).json()) as { date: string }).date;
    const wasToday = state.date === state.today;
    state.today = today;
    if (state.editing || state.dumpDraft !== null || state.prioritiesDraft !== null) return;
    if (wasToday && state.date !== today) await load(today);
    else render();
  }, 60_000);
}

void boot();
