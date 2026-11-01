// The block details dialog: edit one block's title, category, times, links and notes, or add a new one.
// It only gathers the edit; the caller applies it to the latest file text, so the markdown stays the source of truth.

import { formatTime, type Block } from "../shared/day.ts";
import type { Category } from "../shared/categories.ts";
import type { BlockEdit, BlockFields } from "../shared/schedule.ts";
import { h, link, svg, trash } from "./dom.ts";

export interface DialogOptions {
  block: Block | null; // null = new block
  slot?: { start: number; end: number };
  categories: readonly Category[];
  onSave(edit: BlockEdit, pushMinutes?: number): Promise<string | null>; // resolves to an error message or null
  onDelete(): Promise<string | null>;
  onOpenMarkdown(): void;
}

const DEFAULT_CATEGORY = "focus";
const DEFAULT_PUSH = 15;
const DAY_END = 24 * 60;

const xMark = (): SVGSVGElement => svg('<path d="M6 18 18 6M6 6l12 12"/>');
const plus = (): SVGSVGElement => svg('<path d="M12 4.5v15m7.5-7.5h-15"/>');

interface LinkRow {
  label: HTMLInputElement;
  url: HTMLInputElement;
}

function toMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function duration(mins: number): string {
  if (mins <= 0) return "";
  const hrs = Math.floor(mins / 60);
  const rest = mins % 60;
  return [hrs && `${hrs}h`, rest && `${rest}m`].filter(Boolean).join(" ");
}

/** The notes as the textarea shows them: one line each, two spaces per level below the first. */
function notesText(block: Block | null): string {
  return (block?.children ?? [])
    .filter((c) => c.kind === "note")
    .map((c) => `${"  ".repeat(Math.max(0, c.depth - 1))}${c.text}`)
    .join("\n");
}

function loadedLinks(block: Block | null): { label: string; url: string }[] {
  return (block?.children ?? []).filter((c) => c.kind === "link").map((c) => ({ label: c.label ?? c.text, url: c.url ?? c.text }));
}

function sameLinks(a: { label: string; url: string }[], b: { label: string; url: string }[]): boolean {
  return a.length === b.length && a.every((l, i) => l.label === b[i].label && l.url === b[i].url);
}

export function openBlockDialog(opts: DialogOptions): void {
  const { block, categories } = opts;
  const calendar = !!block?.gcal;
  const start0 = block?.start ?? opts.slot?.start ?? 9 * 60;
  const end0 = block?.end ?? opts.slot?.end ?? start0 + 30;
  const category0 = block?.category ?? (categories.some((c) => c.id === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : categories[0]?.id ?? DEFAULT_CATEGORY);
  const links0 = loadedLinks(block);
  const notes0 = notesText(block);

  const title = h("input", { class: "field-input", type: "text", value: block?.title ?? "", placeholder: "What's this block for?", readonly: calendar }) as HTMLInputElement;

  const category = h("select", { class: "field-input", disabled: calendar }) as HTMLSelectElement;
  for (const c of categories) category.append(h("option", { value: c.id }, c.label));
  if (!categories.some((c) => c.id === category0)) category.append(h("option", { value: category0 }, `${category0} (removed)`));
  category.value = category0;

  const timeInput = (minutes: number): HTMLInputElement =>
    h("input", { class: "field-input", type: "time", step: "300", value: formatTime(minutes % DAY_END), readonly: calendar }) as HTMLInputElement;
  const start = timeInput(start0);
  const end = timeInput(end0);
  const length = h("span", { class: "text-muted dialog-duration" });
  const readTimes = (): { start: number; end: number } | null => {
    const s = toMinutes(start.value);
    let e = toMinutes(end.value);
    if (s === null || e === null) return null;
    if (e === 0 && s > 0) e = DAY_END; // 00:00 as an end time means midnight
    return { start: s, end: e };
  };
  const showDuration = (): void => {
    const t = readTimes();
    length.textContent = t ? duration(t.end - t.start) || "ends before it starts" : "";
  };
  start.addEventListener("input", showDuration);
  end.addEventListener("input", showDuration);
  showDuration();

  const video = h("input", { class: "field-input", type: "url", value: block?.url ?? "", placeholder: "https://meet.google.com/…", readonly: calendar }) as HTMLInputElement;

  const rows: LinkRow[] = [];
  const linkList = h("div", { class: "dialog-links" });
  const addLink = (l?: { label: string; url: string }): LinkRow => {
    const row: LinkRow = {
      label: h("input", { class: "field-input", type: "text", value: l?.label ?? "", placeholder: "Label", "aria-label": "Link label" }) as HTMLInputElement,
      url: h("input", { class: "field-input", type: "url", value: l?.url ?? "", placeholder: "https://…", "aria-label": "Link URL" }) as HTMLInputElement,
    };
    rows.push(row);
    const el = h(
      "div",
      { class: "dialog-link" },
      row.label,
      row.url,
      h("button", {
        class: "icon-btn",
        type: "button",
        title: "Remove link",
        onclick: () => {
          rows.splice(rows.indexOf(row), 1);
          el.remove();
        },
      }, xMark()),
    );
    linkList.append(el);
    return row;
  };
  links0.forEach((l) => addLink(l));

  const notes = h("textarea", { class: "field-input dialog-notes", rows: "4", spellcheck: false, placeholder: "Prep notes, one per line" }) as HTMLTextAreaElement;
  notes.value = notes0;

  const pushBy = h("input", { class: "field-input dialog-push-minutes", type: "number", min: "5", step: "5", value: String(DEFAULT_PUSH), "aria-label": "Minutes to push by" }) as HTMLInputElement;
  const error = h("div", { class: "error-bar", role: "alert", hidden: true });
  const buttons: HTMLButtonElement[] = [];
  let busy = false;

  const fail = (message: string): void => {
    error.textContent = message;
    error.hidden = false;
  };

  /** The dialog's state as an edit, or an error message. */
  const gather = (): BlockEdit | string => {
    let fields: BlockFields;
    if (calendar && block) {
      // Read-only: hand back exactly what was parsed so the meeting's own line is never rewritten.
      fields = { start: block.start, end: block.end, category: block.category, title: block.title, url: block.url, gcal: block.gcal };
    } else {
      const t = readTimes();
      if (!t) return "Enter a start and end time.";
      if (t.end <= t.start) return "The end time must be after the start.";
      const url = video.value.trim();
      fields = { start: t.start, end: t.end, category: category.value, title: title.value.trim(), ...(url && { url }) };
    }
    const edit: BlockEdit = { fields };
    const links = rows
      .map((r) => ({ label: r.label.value.trim(), url: r.url.value.trim() }))
      .filter((l) => l.url)
      .map((l) => ({ label: l.label || l.url, url: l.url }));
    if (!sameLinks(links, links0)) edit.links = links;
    if (notes.value.trimEnd() !== notes0) edit.notes = notes.value;
    return edit;
  };

  const run = async (action: () => Promise<string | null>): Promise<void> => {
    if (busy) return;
    busy = true;
    error.hidden = true;
    buttons.forEach((b) => (b.disabled = true));
    let message: string | null;
    try {
      message = await action();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
    if (message) fail(message);
    else dialog.close();
  };

  const save = (pushMinutes?: number): void => {
    const edit = gather();
    if (typeof edit === "string") return fail(edit);
    void run(() => opts.onSave(edit, pushMinutes));
  };

  const button = (attrs: Record<string, string | boolean | ((e: Event) => void)>, ...children: (Node | string)[]): HTMLButtonElement => {
    const b = h("button", { type: "button", ...attrs }, ...children);
    buttons.push(b);
    return b;
  };

  const field = (label: string, ...control: (Node | string)[]): HTMLElement => h("label", { class: "field" }, h("span", { class: "field-label" }, label), ...control);

  const dialog = h(
    "dialog",
    { class: "dialog", "aria-label": block ? "Block details" : "New block" },
    h(
      "div",
      { class: "dialog-head" },
      h("h2", { class: "label" }, block ? (calendar ? "Calendar meeting" : "Block") : "New block"),
      h("button", { class: "link-btn", type: "button", title: "Edit this block's lines in the day's markdown", onclick: () => {
        dialog.close();
        opts.onOpenMarkdown();
      } }, "Open in markdown"),
    ),
    calendar && h("p", { class: "text-muted hint dialog-note" }, "From Google Calendar: title, category and times sync from there. Links and notes are yours."),
    field("Title", title),
    h(
      "div",
      { class: "dialog-row" },
      field("Category", category),
      field("Start", start),
      field("End", end),
      length,
    ),
    field("Video link", h("span", { class: "dialog-with-icon" }, link(), video)),
    h(
      "div",
      { class: "field" },
      h("span", { class: "field-label" }, "Links"),
      linkList,
      h("button", { class: "link-btn dialog-add", type: "button", onclick: () => addLink().label.focus() }, plus(), "Add link"),
    ),
    field("Notes", notes),
    block &&
      h(
        "div",
        { class: "dialog-push" },
        button({ class: "btn", title: "Saves this dialog and moves your own blocks starting at or after this one; calendar meetings stay put", onclick: () => {
          const n = Number(pushBy.value);
          if (!Number.isInteger(n) || n <= 0) return fail("Push by a whole number of minutes.");
          save(n);
        } }, "Push my blocks after this back"),
        pushBy,
        h("span", { class: "text-muted" }, "min"),
      ),
    error,
    h(
      "div",
      { class: "dialog-actions" },
      block && !calendar && button({ class: "btn btn-danger", onclick: () => void run(opts.onDelete) }, trash(), "Delete"),
      h("span", { class: "dialog-spacer" }),
      button({ class: "btn", onclick: () => dialog.close() }, "Cancel"),
      button({ class: "btn btn-primary", title: "⌘↵ / Ctrl+↵", onclick: () => save() }, "Save"),
    ),
  ) as HTMLDialogElement;

  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      save();
    }
  });
  dialog.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
  dialog.addEventListener("close", () => dialog.remove());

  document.body.append(dialog);
  dialog.showModal();
  (calendar ? notes : title).focus();
}
