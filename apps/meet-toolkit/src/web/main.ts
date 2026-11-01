import { formatClock, typedDuration } from "../shared/duration.ts";
import { onEnter, onTab, type EditResult } from "../shared/editor.ts";
import { adjust, initialTimer, isRunning, remaining, reset, setRemaining, start, stop, type TimerState } from "../shared/timer.ts";
import { h } from "./dom.ts";
import { icon } from "./icons.ts";
import { THEMES, applySavedTheme, currentTheme, saveTheme } from "./themes.ts";

const TIMER_KEY = "meet-toolkit.timer";
const DURATION_KEY = "meet-toolkit.duration";
const DEFAULT_S = 1800;
const STEP_S = 300;
const SAVE_MS = 500;
const RETRY_MS = 3000;
const CLICK_MS = 220; // a single click waits this long so a double-click (reset) can win

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable: defaults apply
  }
}
function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: works until reload
  }
}

// ---- Timer -------------------------------------------------------------------------------------

function loadTimer(): TimerState {
  try {
    const t = JSON.parse(readStore(TIMER_KEY) ?? "null") as TimerState | null;
    if (t && typeof t.durationS === "number" && typeof t.remainingS === "number" && (t.endAt === null || typeof t.endAt === "number")) return t;
  } catch {
    // corrupt: fall through
  }
  const last = Number(readStore(DURATION_KEY));
  return initialTimer(Number.isFinite(last) && last > 0 ? last : DEFAULT_S);
}

let timer = loadTimer();
let tick: number | undefined;

const time = h("button", { class: "time", title: "Click to type a time (27 or 27:30), double-click to reset" });
const play = h("button", { class: "ctl play", title: "Start / stop" });
const bar = h(
  "div",
  { class: "bar" },
  h("button", { class: "ctl step", title: "−5 min", onclick: () => setTimer(adjust(timer, -STEP_S, Date.now())) }, icon("minus")),
  time,
  h("button", { class: "ctl step", title: "+5 min", onclick: () => setTimer(adjust(timer, STEP_S, Date.now())) }, icon("plus")),
  play,
);

function setTimer(t: TimerState): void {
  if (t.durationS !== timer.durationS) writeStore(DURATION_KEY, String(t.durationS));
  timer = t;
  writeStore(TIMER_KEY, JSON.stringify(t));
  updateBar();
}

function updateBar(): void {
  const now = Date.now();
  const running = isRunning(timer, now);
  time.textContent = formatClock(remaining(timer, now));
  time.classList.toggle("running", running);
  bar.classList.toggle("done", remaining(timer, now) <= 0);
  play.replaceChildren(icon(running ? "pause" : "play"));
  if (running && tick === undefined) tick = window.setInterval(updateBar, 250);
  if (!running && tick !== undefined) {
    clearInterval(tick);
    tick = undefined;
  }
}

play.addEventListener("click", () => {
  const now = Date.now();
  setTimer(isRunning(timer, now) ? stop(timer, now) : start(timer, now));
});

let clickTimer: number | undefined;
time.addEventListener("click", () => {
  clearTimeout(clickTimer);
  clickTimer = window.setTimeout(editTime, CLICK_MS);
});
time.addEventListener("dblclick", () => {
  clearTimeout(clickTimer);
  setTimer(reset(timer));
});

function editTime(): void {
  const prefilled = formatClock(remaining(timer, Date.now()));
  const input = h("input", { class: "time-input", value: prefilled, "aria-label": "Time" });
  time.replaceWith(input);
  input.select();
  const finish = (apply: boolean): void => {
    if (!input.isConnected) return;
    const s = apply ? typedDuration(input.value, prefilled) : null; // untouched input changes nothing
    input.replaceWith(time);
    if (s !== null) setTimer(setRemaining(timer, s, Date.now()));
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

// ---- Notes -------------------------------------------------------------------------------------

const notes = h("textarea", { class: "notes", spellcheck: "false", "aria-label": "Meeting notes", placeholder: "- notes…" });
const noticeText = h("span");
const notice = h(
  "div",
  { class: "notice", hidden: true },
  noticeText,
  h("button", { class: "ctl", title: "Dismiss", onclick: () => (notice.hidden = true) }, icon("xMark")),
);
const saveState = h("span", { class: "save" }, "loading…");
const pathEl = h("span", { class: "path" });

let synced = ""; // the text we know the file holds
let inFlight: string | null = null; // the text being saved
let repull = false; // a file change arrived mid-save; look again afterwards
let saveTimer: number | undefined;

const dirty = (): boolean => notes.value !== synced;

function setSaveState(text: string, failed = false): void {
  saveState.textContent = text;
  saveState.classList.toggle("failed", failed);
}

function scheduleSave(ms = SAVE_MS): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void save(), ms);
}

async function save(): Promise<void> {
  clearTimeout(saveTimer);
  if (inFlight !== null || !dirty()) return;
  const text = notes.value;
  inFlight = text;
  setSaveState("saving…");
  let ok = false;
  try {
    const res = await fetch("/api/notes", { method: "PUT", body: JSON.stringify({ text, base: synced }) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { conflictFile: string | null };
    synced = text;
    ok = true;
    setSaveState("saved");
    if (body.conflictFile) {
      noticeText.textContent = `Notes changed elsewhere while you typed. Their version: ${body.conflictFile.split("/").pop()}`;
      notice.hidden = false;
    }
  } catch {
    setSaveState("save failed", true);
  } finally {
    inFlight = null;
  }
  if (repull) {
    repull = false;
    void pull();
  } else if (dirty()) scheduleSave(ok ? 0 : RETRY_MS);
}

/** Looks at the file after it changed on disk. Our own saves come back as text we already have. */
async function pull(): Promise<void> {
  if (inFlight !== null) {
    repull = true;
    return;
  }
  const res = await fetch("/api/notes").catch(() => null);
  if (!res?.ok) return;
  const { text } = (await res.json()) as { text: string };
  if (text === synced) return;
  if (dirty()) {
    void save(); // typing wins; the server keeps their version as a conflict file
    return;
  }
  const caret = notes.selectionStart;
  notes.value = text;
  synced = text;
  notes.setSelectionRange(Math.min(caret, text.length), Math.min(caret, text.length));
}

function apply(r: EditResult): void {
  notes.setRangeText(r.text, 0, notes.value.length);
  notes.setSelectionRange(r.selStart, r.selEnd);
  scheduleSave();
}

notes.addEventListener("keydown", (e) => {
  if (e.isComposing || e.altKey || e.metaKey || e.ctrlKey) return;
  if (e.key === "Enter" && !e.shiftKey) {
    const r = onEnter(notes.value, notes.selectionStart, notes.selectionEnd);
    if (r) {
      e.preventDefault();
      apply(r);
    }
  } else if (e.key === "Tab") {
    e.preventDefault();
    apply(onTab(notes.value, notes.selectionStart, notes.selectionEnd, e.shiftKey));
  }
});
notes.addEventListener("input", () => scheduleSave());
notes.addEventListener("blur", () => void save());
// Closing the tab mid-sentence: send what's left without waiting.
window.addEventListener("pagehide", () => {
  if (dirty()) void fetch("/api/notes", { method: "PUT", body: JSON.stringify({ text: notes.value, base: synced }), keepalive: true });
});

// ---- Theme picker (bottom right) ---------------------------------------------------------------

function themePicker(): HTMLElement {
  const menu = h("div", { class: "menu", hidden: true });
  const fill = (): void => {
    menu.replaceChildren(
      ...THEMES.map((t) =>
        h(
          "button",
          { class: `menu-item${t.id === currentTheme() ? " active" : ""}`, onclick: () => (saveTheme(t.id), fill()) },
          h("span", { class: "swatch" }, ...t.swatch.map((c) => h("i", { style: `background:${c}` }))),
          t.name,
        ),
      ),
    );
  };
  fill();
  const btn = h("button", { class: "ctl", title: "Theme", onclick: (e: Event) => (e.stopPropagation(), (menu.hidden = !menu.hidden)) }, icon("swatch"));
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target as Node)) menu.hidden = true;
  });
  return h("div", { class: "menu-wrap" }, btn, menu);
}

// ---- Boot --------------------------------------------------------------------------------------

applySavedTheme();
document.getElementById("app")!.replaceChildren(
  h("div", { class: "app" }, bar, notice, notes, h("div", { class: "status" }, saveState, pathEl, themePicker())),
);
updateBar();

void (async () => {
  try {
    const res = await fetch("/api/notes");
    const { text, path } = (await res.json()) as { text: string; path: string };
    notes.value = text;
    synced = text;
    pathEl.replaceChildren(h("bdi", {}, path)); // isolated, so the rtl ellipsis trims the start and keeps the filename
    pathEl.title = path;
    setSaveState("saved");
  } catch {
    setSaveState("can't reach the server", true);
  }
  const events = new EventSource("/api/events");
  events.onmessage = () => void pull();
  events.onopen = () => void pull(); // after a reconnect, catch anything missed
})();
