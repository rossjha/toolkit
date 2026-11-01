import {
  formatTime,
  insertBlock,
  isDate,
  layoutBlocks,
  parseDay,
  setBrainDump,
  togglePriority,
  type Day,
} from "../shared/day.ts";
import { DEFAULT_CATEGORIES, categoryColor, findCategory } from "../shared/categories.ts";
import { THEMES, applySavedTheme, currentTheme, saveTheme } from "./themes.ts";

const SLOT_PX = 36; // height of 30 minutes on the timeline
const DUMP_SAVE_MS = 600;
const HIDE_PERSONAL_KEY = "timeblock.hidePersonal";

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

interface State {
  today: string;
  date: string;
  markdown: string;
  exists: boolean;
  editing: { text: string; caret?: number } | null;
  changedOnDisk: boolean;
  /** The brain dump being typed in place; while set, live updates refresh the file text but not the page. */
  dumpDraft: string | null;
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
  changedOnDisk: false,
  dumpDraft: null,
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

function startEditing(text = state.markdown, caret?: number): void {
  state.editing = { text, caret };
  state.changedOnDisk = false;
  render();
}

function addBlockAt(minutes: number): void {
  const line = `- ${formatTime(minutes)}-${formatTime(minutes + 30)} [focus] `;
  const { text, line: at } = insertBlock(state.markdown, line);
  const caret = text.split("\n").slice(0, at + 1).join("\n").length;
  startEditing(text, caret);
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
      ...DEFAULT_CATEGORIES.map((c) => h("span", { class: "legend-item", style: `--cat:${categoryColor(c)}` }, h("i"), c.label)),
    ),
    h(
      "div",
      { class: "actions" },
      state.editing && h("button", { class: "btn", onclick: () => ((state.editing = null), render()) }, "Cancel"),
      state.editing
        ? h("button", { class: "btn btn-primary", onclick: () => void saveEditor() }, "Save")
        : h("button", { class: "btn", title: "Edit the markdown (E)", onclick: () => startEditing() }, "Edit"),
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

function svg(paths: string): SVGSVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("class", "icon-btn-svg");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "2");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.innerHTML = paths;
  return el;
}
const eye = (): SVGSVGElement => svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const eyeOff = (): SVGSVGElement =>
  svg('<path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>');

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

function priorities(day: Day): HTMLElement {
  return h(
    "section",
    { class: "card" },
    h("h2", { class: "label" }, "Today's priorities"),
    day.priorities.length
      ? h(
          "ul",
          { class: "priorities" },
          ...day.priorities.map((p) =>
            h(
              "li",
              { class: p.done ? "done" : "" },
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
          onclick: () => addBlockAt(minutes),
        },
        s % 2 ? "" : h("span", { class: "hour" }, formatTime(minutes)),
      ),
    );
  }

  const isToday = day.date === state.today;
  const now = nowMinutes();
  for (const { block, lane, lanes } of layoutBlocks(day.blocks)) {
    const cat = findCategory(DEFAULT_CATEGORIES, block.category);
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
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    grid.append(
      h(
        "div",
        {
          class: `block cat-${block.category}${current ? " current" : ""}${past ? " past" : ""}${mins < 60 ? " short" : ""}${mins <= 15 ? " tiny" : ""}${hidden ? " private" : ""}${link ? " linked" : ""}`,
          style: `--cat:${categoryColor(cat)};top:${top}px;height:${height - 2}px;left:calc(var(--gutter) + (100% - var(--gutter)) * ${lane} / ${lanes});width:calc((100% - var(--gutter)) / ${lanes} - 4px)`,
          title: `${time} · ${label}${hidden ? "" : `\n${block.title}`}${link ? `\nClick to open ${block.url ? "the meeting link" : "Google Meet"} · double-click to edit` : "\nDouble-click to edit"}`,
          // Wait out a possible double-click so editing a meeting doesn't also open it.
          onclick: () => {
            if (!link) return;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => window.open(link, "_blank", "noopener"), 250);
          },
          ondblclick: () => {
            clearTimeout(clickTimer);
            const caret = state.markdown.split("\n").slice(0, block.line + 1).join("\n").length;
            startEditing(state.markdown, caret);
          },
        },
        h("span", { class: "block-time" }, time),
        h("span", { class: "block-title" }, title),
      ),
    );
  }

  if (isToday && now >= startMin && now <= day.endHour * 60) {
    grid.append(h("div", { class: "now", style: `top:${((now - startMin) / 30) * SLOT_PX}px` }));
  }

  const totals = DEFAULT_CATEGORIES.map((c) => ({
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
      ),
    ),
    grid,
  );
}

function editor(): HTMLElement {
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
        "This day changed on disk while you were editing. ",
        h("button", { class: "link-btn", onclick: () => void load(state.date).then(() => startEditing()) }, "Load the new version"),
        " (discards your edits) or Save to overwrite it.",
      ),
    ta,
    h("p", { class: "text-muted hint" }, "⌘S / Ctrl+S saves · Esc cancels · blocks: - 09:00-09:30 [meeting] Title"),
  );
}

async function saveEditor(): Promise<void> {
  if (!state.editing) return;
  await save(state.editing.text);
  state.editing = null;
  render();
}

function render(): void {
  const day = parseDay(state.date, state.markdown);
  app.replaceChildren(header());
  if (day.warnings.length && !state.editing) app.append(h("div", { class: "error-bar" }, day.warnings.join("\n")));
  app.append(
    state.editing
      ? editor()
      : h("main", { class: "layout" }, h("div", { class: "side" }, priorities(day), brainDump(day)), schedule(day)),
  );
}

// ---------- wiring ----------

function connectLive(): void {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data as string) as { type: string; date: string };
    if (ev.type !== "day" || ev.date !== state.date) return;
    if (state.dumpDraft !== null) {
      // Keep the text box (and its focus) as it is; just track the file so the next save merges into it.
      void fetch(`/api/day/${state.date}`)
        .then((r) => r.json() as Promise<{ markdown: string }>)
        .then((b) => (state.markdown = b.markdown));
    } else if (state.editing) {
      // Our own save also fires this; only flag it if the file really differs from what we last saw.
      void fetch(`/api/day/${state.date}`)
        .then((r) => r.json() as Promise<{ markdown: string }>)
        .then((b) => {
          if (state.editing && b.markdown !== state.markdown) {
            state.changedOnDisk = true;
            render();
          }
        });
    } else {
      void load(state.date);
    }
  };
}

document.addEventListener("keydown", (e) => {
  if (state.editing || state.dumpDraft !== null || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest("input, textarea")) return;
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
  await load(isDate(d) ? d : state.today);
  connectLive();
  // Keep the now-line moving and roll over to the new day at midnight.
  setInterval(async () => {
    const today = ((await (await fetch("/api/today")).json()) as { date: string }).date;
    const wasToday = state.date === state.today;
    state.today = today;
    if (state.editing || state.dumpDraft !== null) return;
    if (wasToday && state.date !== today) await load(today);
    else render();
  }, 60_000);
}

void boot();
