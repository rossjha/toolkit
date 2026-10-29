import {
  CATEGORIES,
  categoryFor,
  formatTime,
  insertBlock,
  isDate,
  layoutBlocks,
  parseDay,
  togglePriority,
  type Day,
} from "../shared/day.ts";
import { THEMES, applySavedTheme, currentTheme, saveTheme } from "./themes.ts";

const SLOT_PX = 30; // height of 30 minutes on the timeline

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
}

const state: State = { today: "", date: "", markdown: "", exists: false, editing: null, changedOnDisk: false };
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
      ...CATEGORIES.map((c) => h("span", { class: "legend-item", style: `--cat:${c.color}` }, h("i"), c.label)),
    ),
    h(
      "div",
      { class: "actions" },
      state.editing && h("button", { class: "btn", onclick: () => ((state.editing = null), render()) }, "Cancel"),
      state.editing
        ? h("button", { class: "btn btn-primary", onclick: () => void saveEditor() }, "Save")
        : h("button", { class: "btn", title: "Edit the markdown (E)", onclick: () => startEditing() }, "Edit"),
      themePicker(),
    ),
  );
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

function brainDump(day: Day): HTMLElement {
  return h(
    "section",
    { class: "card grow" },
    h("h2", { class: "label" }, "Brain dump"),
    day.brainDump ? h("div", { class: "dump" }, day.brainDump) : h("p", { class: "empty" }, "Empty."),
  );
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
    const cat = categoryFor(block.category);
    const top = ((block.start - startMin) / 30) * SLOT_PX;
    const height = ((block.end - block.start) / 30) * SLOT_PX;
    const current = isToday && now >= block.start && now < block.end;
    const past = isToday && now >= block.end;
    grid.append(
      h(
        "div",
        {
          class: `block cat-${block.category}${current ? " current" : ""}${past ? " past" : ""}${height <= SLOT_PX ? " short" : ""}${height < SLOT_PX ? " tiny" : ""}`,
          style: `--cat:${cat?.color ?? "var(--dim)"};top:${top}px;height:${height - 2}px;left:calc(var(--gutter) + (100% - var(--gutter)) * ${lane} / ${lanes});width:calc((100% - var(--gutter)) / ${lanes} - 4px)`,
          title: `${formatTime(block.start)}–${formatTime(block.end)} · ${cat?.label ?? block.category}\n${block.title}`,
          ondblclick: () => {
            const caret = state.markdown.split("\n").slice(0, block.line + 1).join("\n").length;
            startEditing(state.markdown, caret);
          },
        },
        h("span", { class: "block-time" }, `${formatTime(block.start)}–${formatTime(block.end)}`),
        h("span", { class: "block-title" }, block.title || (cat?.label ?? block.category)),
      ),
    );
  }

  if (isToday && now >= startMin && now <= day.endHour * 60) {
    grid.append(h("div", { class: "now", style: `top:${((now - startMin) / 30) * SLOT_PX}px` }));
  }

  const totals = CATEGORIES.map((c) => ({
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
          h("span", { class: "legend-item", style: `--cat:${t.c.color}` }, h("i"), `${t.c.label} ${(t.mins / 60).toFixed(1).replace(/\.0$/, "")}h`),
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
    if (state.editing) {
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
  if (state.editing || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest("input, textarea")) return;
  if (e.key === "ArrowLeft") void load(addDays(state.date, -1));
  else if (e.key === "ArrowRight") void load(addDays(state.date, 1));
  else if (e.key === "t") void load(state.today);
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
    if (state.editing) return;
    if (wasToday && state.date !== today) await load(today);
    else render();
  }, 60_000);
}

void boot();
