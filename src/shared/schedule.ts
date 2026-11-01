// Schedule edits from the UI: pure text→text transforms on the day file.
// Each one touches only the affected block's own lines, plus the move that keeps the Schedule in start-time order;
// every other line keeps every byte, because the same file is edited by hand and by Claude.

import { type Block, blockStart, formatTime, indentWidth, parseDay, placeBlockLines, sectionRange } from "./day.ts";

export interface BlockFields {
  start: number;
  end: number;
  category: string;
  title: string;
  url?: string;
  gcal?: string;
}

export interface BlockEdit {
  fields: BlockFields;
  /** Undefined = keep the block's link lines as they are. */
  links?: { label: string; url: string }[];
  /** Undefined = keep the block's note lines as they are. */
  notes?: string;
}

/** The block's raw lines when the dialog opened, to find it again and to notice edits made underneath. */
export interface Snapshot {
  line: number;
  text: string;
  children: string[];
}

export type EditResult = { ok: true; text: string; line: number } | { ok: false; error: string };

const GONE = "This block is no longer in the file.";
const CHANGED = "This block changed in the file — reopen it.";
const CALENDAR = "Calendar meetings can't be deleted here.";
const DAY_END = 24 * 60;
const MIN_LENGTH = 5;

const SCHEDULE_RE = /^##\s+schedule\s*$/i;
const HEADING_RE = /^##\s/;
// The time range at the start of a block line, as BLOCK_RE reads it.
const RANGE_RE = /^([-*]\s+)(\d{1,2}(?::?\d{2})?\s*(?:-|–|—|to)\s*\d{1,2}(?::?\d{2})?)/i;

export function formatBlockLine(f: BlockFields): string {
  const parts = [`${formatTime(f.start)}-${formatTime(f.end)}`];
  if (f.category) parts.push(`[${f.category}]`);
  if (f.title) parts.push(f.title);
  if (f.url) parts.push(f.url);
  if (f.gcal) parts.push(`<!-- gcal:${f.gcal} -->`);
  return `- ${parts.join(" ")}`;
}

export function snapshotBlock(text: string, line: number): Snapshot {
  const lines = text.split("\n");
  return { line, text: lines[line] ?? "", children: childLines(lines, line) };
}

/** Only Schedule block lines count, so an identical line elsewhere (say, pasted into Brain dump) is never picked up. */
export function locateBlock(text: string, snap: Snapshot): number {
  const lines = text.split("\n");
  const found = (i: number): boolean => lines[i] === snap.text && isScheduleBlock(lines, i);
  if (found(snap.line)) return snap.line;
  return lines.findIndex((_l, i) => found(i));
}

export function retimeBlock(text: string, line: number, start: number, end: number): string {
  const lines = text.split("\n");
  if (!isScheduleBlock(lines, line)) return text;
  retimeAt(lines, line, start, end);
  return lines.join("\n");
}

export function pushBlocks(text: string, from: number, minutes: number): string {
  const lines = text.split("\n");
  const targets = parseDay("", text)
    .blocks.filter((b) => !b.gcal && b.start >= from && isScheduleBlock(lines, b.line))
    .map((b) => ({ ...b }))
    .sort((a, b) => b.line - a.line);
  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    const r = b.line;
    const size = groupEnd(lines, r) - r;
    const p = retimeAt(lines, r, b.start + minutes, b.end + minutes);
    // A block moved up shifts the lines it jumped over (unprocessed targets sit above `r`).
    if (p < r) for (const t of targets.slice(i + 1)) if (t.line >= p) t.line += size;
  }
  return lines.join("\n");
}

export function upsertBlock(text: string, snap: Snapshot | null, edit: BlockEdit): EditResult {
  const lines = text.split("\n");
  if (!snap) {
    const children = [...linkLines(edit.links ?? []), ...noteLines(edit.notes ?? "")];
    const line = placeBlockLines(lines, [formatBlockLine(edit.fields), ...children], edit.fields.start);
    return { ok: true, text: lines.join("\n"), line };
  }
  const at = locateBlock(text, snap);
  if (at === -1) return { ok: false, error: GONE };
  const current = childLines(lines, at);
  const editsChildren = edit.links !== undefined || edit.notes !== undefined;
  if (editsChildren && !sameLines(current, snap.children)) return { ok: false, error: CHANGED };

  const parsed = parseGroup(lines.slice(at, groupEnd(lines, at)));
  if (!parsed) return { ok: false, error: GONE };
  if (!sameFields(parsed, edit.fields)) lines[at] = formatBlockLine(edit.fields);
  if (editsChildren) {
    const end = groupEnd(lines, at);
    const group = lines.slice(at, end);
    const isLink = new Set(parsed.children.filter((c) => c.kind === "link").map((c) => c.line - 1));
    const kept = (link: boolean): string[] => group.filter((l, i) => i > 0 && l.trim() && isLink.has(i) === link);
    const children = [
      ...(edit.links === undefined ? kept(true) : linkLines(edit.links)),
      ...(edit.notes === undefined ? kept(false) : noteLines(edit.notes)),
    ];
    if (!sameLines(children, current)) lines.splice(at + 1, end - at - 1, ...children);
  }
  const line = settle(lines, at, edit.fields.start);
  return { ok: true, text: lines.join("\n"), line };
}

export function deleteBlock(text: string, snap: Snapshot): EditResult {
  const lines = text.split("\n");
  const at = locateBlock(text, snap);
  if (at === -1) return { ok: false, error: GONE };
  const parsed = parseGroup([lines[at]]);
  if (parsed?.gcal) return { ok: false, error: CALENDAR };
  if (!sameLines(childLines(lines, at), snap.children)) return { ok: false, error: CHANGED };
  removeGroup(lines, at, groupEnd(lines, at));
  return { ok: true, text: lines.join("\n"), line: at };
}

// ---- helpers (all mutate `lines` in place) ----

/** Rewrites the time range on `line`, clamped to the day, then moves the block into order. Returns its new line. */
function retimeAt(lines: string[], line: number, start: number, end: number): number {
  const [s, e] = clampRange(start, end);
  lines[line] = lines[line].replace(RANGE_RE, (_m, bullet: string) => `${bullet}${formatTime(s)}-${formatTime(e)}`);
  return settle(lines, line, s);
}

/** 0 ≤ start < end ≤ 24:00, shifting rather than shrinking a range that runs off either end of the day. */
function clampRange(start: number, end: number): [number, number] {
  const length = Math.min(Math.max(end - start, MIN_LENGTH), DAY_END);
  if (start < 0) return [0, length];
  if (start + length > DAY_END) return [DAY_END - length, DAY_END];
  return [start, start + length];
}

function isScheduleBlock(lines: string[], line: number): boolean {
  const range = sectionRange(lines, SCHEDULE_RE);
  return !!range && line > range.head && line < range.end && blockStart(lines[line]) !== null;
}

/** End (exclusive) of the block on `line` and its child lines; blank lines count only between children. */
function groupEnd(lines: string[], line: number): number {
  let end = line + 1;
  for (let i = line + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (indentWidth(lines[i]) === 0 || HEADING_RE.test(lines[i].trim())) break;
    end = i + 1;
  }
  return end;
}

function childLines(lines: string[], line: number): string[] {
  return lines.slice(line + 1, groupEnd(lines, line)).filter((l) => l.trim());
}

/** Reads a block line (plus children) the way the day parser does. */
function parseGroup(group: string[]): Block | undefined {
  return parseDay("", ["## Schedule", ...group].join("\n")).blocks[0];
}

function sameFields(b: Block, f: BlockFields): boolean {
  return (
    b.start === f.start &&
    b.end === f.end &&
    b.category === f.category &&
    b.title === f.title &&
    (b.url ?? "") === (f.url ?? "") &&
    (b.gcal ?? "") === (f.gcal ?? "")
  );
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

function linkLines(links: { label: string; url: string }[]): string[] {
  return links.map((l) => `  - [${l.label}](${l.url})`);
}

/** One child per non-empty textarea line; a typed bullet is dropped, extra leading spaces nest deeper. */
function noteLines(notes: string): string[] {
  return notes
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `  ${" ".repeat(indentWidth(l))}- ${l.trim().replace(/^[-*]\s+/, "")}`);
}

function blockStarts(lines: string[], from: number, to: number, step: 1 | -1): number | null {
  for (let i = from; step === 1 ? i < to : i > to; i += step) {
    const t = blockStart(lines[i]);
    if (t !== null) return t;
  }
  return null;
}

/** Moves the block on `line` (with its children) to its start-time position, if it isn't there already. */
function settle(lines: string[], line: number, start: number): number {
  const range = sectionRange(lines, SCHEDULE_RE);
  if (!range) return line;
  const end = groupEnd(lines, line);
  const prev = blockStarts(lines, line - 1, range.head, -1);
  const next = blockStarts(lines, end, range.end, 1);
  if ((prev === null || prev <= start) && (next === null || start <= next)) return line;
  const group = lines.slice(line, end);
  removeGroup(lines, line, end);
  return placeBlockLines(lines, group, start, line);
}

/** Removes lines [from, end), collapsing the double blank line that can leave behind. */
function removeGroup(lines: string[], from: number, end: number): void {
  lines.splice(from, end - from);
  if (from > 0 && lines[from - 1]?.trim() === "" && lines[from] !== undefined && lines[from].trim() === "") lines.splice(from, 1);
}
