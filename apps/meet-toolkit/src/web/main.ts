import { formatClock, typedDuration } from "../shared/duration.ts";
import { onEnter, onTab, type EditResult } from "../shared/editor.ts";
import { createSync } from "../shared/sync.ts";
import { adjust, initialTimer, isRunning, remaining, reset, setRemaining, start, stop, type TimerState } from "../shared/timer.ts";
import { h } from "./dom.ts";
import { icon } from "./icons.ts";
import { THEMES, applySavedTheme, currentTheme, saveTheme } from "./themes.ts";

const TIMER_KEY = "meet-toolkit.timer";
const DURATION_KEY = "meet-toolkit.duration";
const DEFAULT_S = 1800;
const STEP_S = 300;
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
  // Swap the icon only on a change: replacing it on every tick would swallow a click that lands on it.
  if (play.dataset.running !== String(running)) {
    play.dataset.running = String(running);
    play.replaceChildren(icon(running ? "pause" : "play"));
  }
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

function setSaveState(text: string, failed = false): void {
  saveState.textContent = text;
  saveState.classList.toggle("failed", failed);
}

const sync = createSync({
  getText: () => notes.value,
  setText: (text) => {
    const caret = Math.min(notes.selectionStart, text.length);
    notes.value = text;
    notes.setSelectionRange(caret, caret);
  },
  request: (method, body) => fetch("/api/notes", { method, body }),
  onSaveState: (s) => setSaveState(s === "saving" ? "saving…" : s === "saved" ? "saved" : "save failed", s === "failed"),
  onConflict: (file) => {
    noticeText.textContent = `Notes changed elsewhere while you typed. Their version: ${file.split("/").pop()}`;
    notice.hidden = false;
  },
});

function apply(r: EditResult): void {
  notes.setRangeText(r.text, 0, notes.value.length);
  notes.setSelectionRange(r.selStart, r.selEnd);
  sync.edited();
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
notes.addEventListener("input", () => sync.edited());
notes.addEventListener("blur", () => void sync.save());
// Closing the tab mid-sentence: send what's left without waiting.
window.addEventListener("pagehide", () => {
  const last = sync.unsaved();
  if (last) void fetch("/api/notes", { method: "PUT", body: JSON.stringify(last), keepalive: true });
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
    const { path } = await sync.load();
    pathEl.replaceChildren(h("bdi", {}, path)); // isolated, so the rtl ellipsis trims the start and keeps the filename
    pathEl.title = path;
  } catch {
    setSaveState("can't reach the server", true);
  }
  const events = new EventSource("/api/events");
  events.onmessage = () => void sync.pull();
  events.onopen = () => void sync.pull(); // after a reconnect, catch anything missed
})();
