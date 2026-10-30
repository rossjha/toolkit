// The day file: one markdown file per day, written by hand or by Claude. See CLAUDE.md for the format.
// Parsing is forgiving: a line we can't read is shown as a warning, never dropped from the file.

export interface Category {
  id: string;
  label: string;
  /** A theme variable, so every forge theme colours the blocks in its own palette. */
  color: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: "meeting", label: "Meeting", color: "var(--chart-2)" },
  { id: "focus", label: "Focus", color: "var(--accent)" },
  { id: "study", label: "Study", color: "var(--chart-3)" },
  { id: "personal", label: "Personal", color: "var(--success)" },
  { id: "admin", label: "Admin", color: "var(--chart-4)" },
  { id: "break", label: "Break", color: "var(--muted)" },
];

export const DEFAULT_CATEGORY = "focus";
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 19;

export interface Priority {
  text: string;
  done: boolean;
  /** 0-based line in the file, so the UI can tick it off without rewriting anything else. */
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

export function categoryFor(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
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

function parseTime(s: string): number | null {
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
const BLOCK_RE = /^[-*]\s+(\d{1,2}(?::?\d{2})?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::?\d{2})?)\s+(?:\[([\w-]+)\]\s*)?(.*)$/i;
const URL_RE = /https?:\/\/\S+/;
const TASK_RE = /^[-*]\s+\[( |x|X)\]\s?(.*)$/;

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
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = heading[1].toLowerCase().replace(/[^a-z]/g, "");
      continue;
    }
    if (section === "priorities") {
      const t = TASK_RE.exec(line);
      if (t && t[2].trim()) day.priorities.push({ text: t[2].trim(), done: t[1] !== " ", line: i });
    } else if (section === "schedule") {
      if (!line) continue;
      const b = BLOCK_RE.exec(line);
      const start = b ? parseTime(b[1]) : null;
      const end = b ? parseTime(b[2]) : null;
      if (!b || start === null || end === null || end <= start) {
        day.warnings.push(`Line ${i + 1}: couldn't read "${line}" as a time block`);
        continue;
      }
      const category = (b[3] ?? DEFAULT_CATEGORY).toLowerCase();
      if (!categoryFor(category)) day.warnings.push(`Line ${i + 1}: unknown category [${b[3]}]`);
      // A trailing HTML comment (e.g. <!-- gcal:abc123 -->, Claude's calendar-sync marker) isn't part of the title,
      // and nor is a link: it becomes the block's click target.
      let title = b[4].replace(/\s*<!--.*?-->\s*$/, "");
      const url = URL_RE.exec(title)?.[0];
      if (url) title = title.replace(url, "").replace(/\s{2,}/g, " ");
      day.blocks.push({ start, end, category, title: title.trim(), ...(url && { url }), line: i });
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

function sectionRange(lines: string[], name: RegExp): { head: number; end: number } | null {
  const head = lines.findIndex((l) => name.test(l.trim()));
  if (head === -1) return null;
  let end = head + 1;
  while (end < lines.length && !/^##\s/.test(lines[end].trim())) end++;
  return { head, end };
}

/** Adds a block line to the Schedule in start-time order (creating the section if it's missing). */
export function insertBlock(text: string, blockLine: string): { text: string; line: number } {
  const lines = text.split("\n");
  let range = sectionRange(lines, /^##\s+schedule\s*$/i);
  if (!range) {
    const dump = lines.findIndex((l) => /^##\s+brain\s*dump/i.test(l.trim()));
    const at = dump === -1 ? lines.length : dump;
    lines.splice(at, 0, "## Schedule", "");
    range = { head: at, end: at + 2 };
  }
  const startOf = (l: string): number | null => {
    const m = BLOCK_RE.exec(l.trim());
    return m ? parseTime(m[1]) : null;
  };
  const mine = startOf(blockLine) ?? 0;
  let last = range.head;
  let at = -1;
  for (let i = range.head + 1; i < range.end; i++) {
    if (!lines[i].trim()) continue;
    const t = startOf(lines[i]);
    if (at === -1 && t !== null && t > mine) at = i;
    last = i;
  }
  if (at !== -1) {
    lines.splice(at, 0, blockLine);
    return { text: lines.join("\n"), line: at };
  }
  // Last in the day: blank line under the heading, then the blocks, then a blank line before the next heading.
  const add = last === range.head ? ["", blockLine] : [blockLine];
  lines.splice(last + 1, 0, ...add);
  at = last + add.length;
  if (lines[at + 1] !== undefined && lines[at + 1].trim() !== "") lines.splice(at + 1, 0, "");
  return { text: lines.join("\n"), line: at };
}

/** Replaces the Brain dump section's body, leaving the rest of the file alone. */
export function setBrainDump(text: string, dump: string): string {
  const lines = text.split("\n");
  const body = dump.trim() ? ["", ...dump.trimEnd().split("\n"), ""] : [""];
  const range = sectionRange(lines, /^##\s+brain\s*dump\s*$/i);
  if (!range) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return [...lines, "", "## Brain dump", ...body].join("\n");
  }
  // At the end of the file keep a single trailing newline; before another section keep the blank separator.
  lines.splice(range.head + 1, range.end - range.head - 1, ...body);
  return lines.join("\n");
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
