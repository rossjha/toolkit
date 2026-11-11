// The day file: one markdown file per day, written by hand or by Claude. See CLAUDE.md for the format.
// Parsing is forgiving: a line we can't read is shown as a warning, never dropped from the file.

export const DEFAULT_CATEGORY = "focus";

/** Today in this machine's time zone, as YYYY-MM-DD. The browser's answer is the one that counts: the server may run
 * in a container on UTC. */
export function localToday(now = new Date()): string {
  const off = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - off).toISOString().slice(0, 10);
}
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 19;

export interface Priority {
  text: string;
  done: boolean;
  /** 0-based line in the file, so the UI can tick it off without rewriting anything else. */
  line: number;
  /** Nesting level: 0 for a top-level task. */
  depth: number;
  /** Direct children only. */
  total: number;
  doneCount: number;
}

export interface BlockChild {
  kind: "link" | "note";
  /** The content with the bullet stripped. */
  text: string;
  label?: string;
  url?: string;
  /** 1 = directly under the block. */
  depth: number;
  line: number;
}

export interface Block {
  /** Minutes since midnight. */
  start: number;
  end: number;
  category: string;
  title: string;
  /** A link on the line (e.g. the Google Meet URL), opened when the block is clicked. */
  url?: string;
  /** The Google Calendar event id from a trailing `<!-- gcal:ID -->`. */
  gcal?: string;
  children: BlockChild[];
  line: number;
}

export interface Day {
  date: string;
  startHour: number;
  endHour: number;
  priorities: Priority[];
  blocks: Block[];
  brainDump: string;
  warnings: string[];
}

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function emptyDay(date: string): string {
  return `---
date: ${date}
---

## Priorities

- [ ]
- [ ]
- [ ]

## Schedule

## Brain dump

`;
}

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// "- 09:00-09:30 [meeting] Standup" — dash, en dash or "to" between times; category optional.
export const BLOCK_RE = /^[-*]\s+(\d{1,2}(?::?\d{2})?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::?\d{2})?)\s+(?:\[([\w-]+)\]\s*)?(.*)$/i;
const URL_RE = /https?:\/\/\S+/;
const TASK_RE = /^[-*]\s+\[( |x|X)\]\s?(.*)$/;
const GCAL_RE = /<!--\s*gcal:([^\s>]+)\s*-->\s*$/;
const LINK_RE = /^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/;
const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/;
const BARE_URL_RE = /^https?:\/\/\S+$/;

/** Leading whitespace width; a tab counts as 2. */
export function indentWidth(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 2;
    else break;
  }
  return n;
}

function parseChild(content: string, depth: number, line: number): BlockChild {
  const link = LINK_RE.exec(content);
  if (link) return { kind: "link", text: content, label: link[1], url: link[2], depth, line };
  if (BARE_URL_RE.test(content)) return { kind: "link", text: content, label: content, url: content, depth, line };
  return { kind: "note", text: content, depth, line };
}

export function parseDay(date: string, text: string): Day {
  const day: Day = {
    date,
    startHour: DEFAULT_START_HOUR,
    endHour: DEFAULT_END_HOUR,
    priorities: [],
    blocks: [],
    brainDump: "",
    warnings: [],
  };
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (i = 1; i < lines.length && lines[i].trim() !== "---"; i++) {
      const m = /^(start|end):\s*(\d{1,2})\s*$/.exec(lines[i].trim());
      if (m) {
        const h = Number(m[2]);
        if (h <= 24) day[m[1] === "start" ? "startHour" : "endHour"] = h;
      }
    }
    i++;
  }

  let section = "";
  const dump: string[] = [];
  let taskStack: { indent: number; p: Priority }[] = [];
  let current: Block | null = null;
  let childIndents: number[] = [];
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = heading[1].toLowerCase().replace(/[^a-z]/g, "");
      taskStack = [];
      current = null;
      continue;
    }
    if (section === "priorities") {
      const t = TASK_RE.exec(line);
      if (t && t[2].trim()) {
        const indent = indentWidth(raw);
        while (taskStack.length && taskStack[taskStack.length - 1].indent >= indent) taskStack.pop();
        const p: Priority = { text: t[2].trim(), done: t[1] !== " ", line: i, depth: taskStack.length, total: 0, doneCount: 0 };
        const parent = taskStack[taskStack.length - 1]?.p;
        if (parent) {
          parent.total++;
          if (p.done) parent.doneCount++;
        }
        taskStack.push({ indent, p });
        day.priorities.push(p);
      }
    } else if (section === "schedule") {
      if (!line) continue;
      const indent = indentWidth(raw);
      if (indent > 0) {
        if (!current) {
          day.warnings.push(`Line ${i + 1}: couldn't read "${line}" as a time block`);
          continue;
        }
        while (childIndents.length && childIndents[childIndents.length - 1] >= indent) childIndents.pop();
        childIndents.push(indent);
        current.children.push(parseChild(line.replace(/^[-*]\s+/, ""), childIndents.length, i));
        continue;
      }
      current = null;
      childIndents = [];
      const b = BLOCK_RE.exec(line);
      const start = b ? parseTime(b[1]) : null;
      const end = b ? parseTime(b[2]) : null;
      if (!b || start === null || end === null || end <= start) {
        day.warnings.push(`Line ${i + 1}: couldn't read "${line}" as a time block`);
        continue;
      }
      const category = (b[3] ?? DEFAULT_CATEGORY).toLowerCase();
      // A trailing HTML comment (e.g. <!-- gcal:abc123 -->, Claude's calendar-sync marker) isn't part of the title,
      // and nor is a link: it becomes the block's click target.
      const gcal = GCAL_RE.exec(b[4])?.[1];
      let title = b[4].replace(/\s*<!--.*?-->\s*$/, "");
      // A markdown link keeps its label in the title ("Incident review [thread](https://…)" reads "Incident review thread").
      const md = MD_LINK_RE.exec(title);
      const url = md ? md[2] : URL_RE.exec(title)?.[0];
      if (md) title = title.replace(md[0], md[1]);
      else if (url) title = title.replace(url, "").replace(/\s{2,}/g, " ");
      current = { start, end, category, title: title.trim(), ...(url && { url }), ...(gcal && { gcal }), children: [], line: i };
      day.blocks.push(current);
    } else if (section === "braindump") {
      dump.push(raw);
    }
  }
  day.brainDump = dump.join("\n").trim();
  day.blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  if (day.blocks.length) {
    day.startHour = Math.min(day.startHour, Math.floor(day.blocks[0].start / 60));
    day.endHour = Math.max(day.endHour, Math.ceil(Math.max(...day.blocks.map((b) => b.end)) / 60));
  }
  if (day.endHour <= day.startHour) day.endHour = day.startHour + 1;
  return day;
}

/** Ticks or unticks the priority on `line`, leaving every other byte of the file alone. */
export function togglePriority(text: string, line: number): string {
  const lines = text.split("\n");
  const l = lines[line];
  if (l === undefined) return text;
  lines[line] = l.replace(/\[( |x|X)\]/, (_m, c: string) => (c === " " ? "[x]" : "[ ]"));
  return lines.join("\n");
}

export function sectionRange(lines: string[], name: RegExp): { head: number; end: number } | null {
  const head = lines.findIndex((l) => name.test(l.trim()));
  if (head === -1) return null;
  let end = head + 1;
  while (end < lines.length && !/^##\s/.test(lines[end].trim())) end++;
  return { head, end };
}

/** Adds a block line to the Schedule in start-time order (creating the section if it's missing). */
export function insertBlock(text: string, blockLine: string): { text: string; line: number } {
  const lines = text.split("\n");
  const m = BLOCK_RE.exec(blockLine.trim());
  const line = placeBlockLines(lines, [blockLine], (m && parseTime(m[1])) ?? 0);
  return { text: lines.join("\n"), line };
}

/** Start time of a Schedule block line; null for child lines and anything else. */
export function blockStart(raw: string): number | null {
  if (indentWidth(raw) > 0) return null;
  const m = BLOCK_RE.exec(raw.trim());
  return m ? parseTime(m[1]) : null;
}

/**
 * Inserts a block line (plus any child lines) into `lines` in start-time order: a blank line under the heading and a
 * blank line before the next heading. Blocks with the same start stay before it if they sit above `stableFrom`, after
 * it otherwise (so a new block goes after them). Creates the Schedule section if it's missing. Returns the first line.
 */
export function placeBlockLines(lines: string[], group: string[], start: number, stableFrom = Infinity): number {
  let range = sectionRange(lines, /^##\s+schedule\s*$/i);
  if (!range) {
    const dump = lines.findIndex((l) => /^##\s+brain\s*dump/i.test(l.trim()));
    const at = dump === -1 ? lines.length : dump;
    lines.splice(at, 0, "## Schedule", "");
    range = { head: at, end: at + 2 };
  }
  let last = range.head;
  let at = -1;
  for (let i = range.head + 1; i < range.end; i++) {
    if (!lines[i].trim()) continue;
    const t = blockStart(lines[i]);
    if (at === -1 && t !== null && (t > start || (t === start && i >= stableFrom))) at = i;
    last = i;
  }
  if (at !== -1) {
    lines.splice(at, 0, ...group);
    return at;
  }
  // Last in the day: blank line under the heading, then the blocks, then a blank line before the next heading.
  const add = last === range.head ? ["", ...group] : group;
  lines.splice(last + 1, 0, ...add);
  at = last + 1 + add.length - group.length;
  const after = at + group.length;
  if (lines[after] !== undefined && lines[after].trim() !== "") lines.splice(after, 0, "");
  return at;
}

/** Replaces a section's body (or adds the section where `place` says), leaving the rest of the file alone. */
function replaceSection(text: string, re: RegExp, heading: string, bodyLines: string[], place: (lines: string[]) => number): string {
  const lines = text.split("\n");
  const body = bodyLines.length ? ["", ...bodyLines, ""] : [""];
  const range = sectionRange(lines, re);
  if (!range) {
    const at = place(lines);
    if (at >= lines.length) {
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      return [...lines, "", heading, ...body].join("\n");
    }
    lines.splice(at, 0, ...(at > 0 && lines[at - 1].trim() ? [""] : []), heading, ...body);
    return lines.join("\n");
  }
  // At the end of the file keep a single trailing newline; before another section keep the blank separator.
  lines.splice(range.head + 1, range.end - range.head - 1, ...body);
  return lines.join("\n");
}

/** Replaces the Brain dump section's body, leaving the rest of the file alone. */
export function setBrainDump(text: string, dump: string): string {
  return replaceSection(text, /^##\s+brain\s*dump\s*$/i, "## Brain dump", dump.trim() ? dump.trimEnd().split("\n") : [], (lines) => lines.length);
}

/** Replaces the Priorities section's body; a missing section is inserted after the front matter. */
export function setPriorities(text: string, body: string): string {
  return replaceSection(text, /^##\s+priorities\s*$/i, "## Priorities", body.trim() ? body.trimEnd().split("\n") : [], (lines) => {
    if (lines[0]?.trim() !== "---") return 0;
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (close === -1) return 0;
    let at = close + 1;
    while (at < lines.length && !lines[at].trim()) at++;
    return at;
  });
}

/** Side-by-side lanes for overlapping blocks: each block gets a lane and the lane count of its cluster. */
export function layoutBlocks(blocks: readonly Block[]): { block: Block; lane: number; lanes: number }[] {
  const out: { block: Block; lane: number; lanes: number }[] = [];
  let cluster: { block: Block; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = (): void => {
    for (const c of cluster) c.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const block of blocks) {
    if (block.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= block.start);
    if (lane === -1) lane = laneEnds.push(block.end) - 1;
    else laneEnds[lane] = block.end;
    cluster.push({ block, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();
  return out;
}
