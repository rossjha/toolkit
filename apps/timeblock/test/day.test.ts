import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { emptyDay, insertBlock, isDate, layoutBlocks, parseDay, setBrainDump, setPriorities, togglePriority } from "../src/shared/day.ts";

const example = fs.readFileSync(new URL("../examples/2026-10-29.md", import.meta.url), "utf8");

test("parses the example day", () => {
  const day = parseDay("2026-10-29", example);
  assert.deepEqual(day.warnings, []);
  assert.equal(day.priorities.length, 5);
  assert.equal(day.priorities[0].done, true);
  assert.equal(day.blocks.length, 10);
  assert.deepEqual(day.blocks[1], { start: 540, end: 555, category: "meeting", title: "Team standup", children: [], line: 15 });
  assert.match(day.brainDump, /Edinburgh/);
  assert.equal(day.startHour, 7);
  assert.equal(day.endHour, 19);
});

test("accepts loose times and defaults the category", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- 9-10:30 Deep work\n- 6:15 – 7 [Personal] Gym\n* 20:00 to 21:00 [study] Course\n");
  assert.deepEqual(day.warnings, []);
  assert.deepEqual(day.blocks.map((b) => [b.start, b.end, b.category, b.title]), [
    [375, 420, "personal", "Gym"],
    [540, 630, "focus", "Deep work"],
    [1200, 1260, "study", "Course"],
  ]);
  assert.equal(day.startHour, 6);
  assert.equal(day.endHour, 21);
});

test("calendar markers are hidden from the title", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- 11:00-11:30 [meeting] 1:1 with Sam <!-- gcal:abc_123 -->\n");
  assert.equal(day.blocks[0].title, "1:1 with Sam");
});

test("warns about unreadable lines", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- sometime: lunch\n- 10:00-09:00 backwards\n- 10:00-11:00 [gym] Run\n");
  assert.equal(day.warnings.length, 2);
  assert.equal(day.blocks.length, 1);
});

test("front matter sets the visible hours", () => {
  const day = parseDay("2026-10-29", "---\ndate: 2026-10-29\nstart: 5\nend: 23\n---\n");
  assert.equal(day.startHour, 5);
  assert.equal(day.endHour, 23);
});

test("togglePriority only touches that line", () => {
  const out = togglePriority(example, 7);
  assert.equal(out.split("\n")[7], "- [ ] Draft Q1 hiring plan".replace("[ ]", "[x]"));
  assert.equal(togglePriority(out, 7), example);
});

test("insertBlock appends to the schedule", () => {
  const { text, line } = insertBlock(example, "- 17:00-17:30 [admin] Wrap up");
  assert.equal(text.split("\n")[line], "- 17:00-17:30 [admin] Wrap up");
  assert.equal(parseDay("2026-10-29", text).blocks.length, 11);
  assert.match(text, /Wrap up\n\n## Brain dump/);
});

test("insertBlock keeps the schedule in time order", () => {
  const { text, line } = insertBlock(example, "- 10:00-10:30 [focus] Wedged in");
  const day = parseDay("2026-10-29", text);
  const lines = text.split("\n");
  assert.equal(lines[line], "- 10:00-10:30 [focus] Wedged in");
  assert.match(lines[line - 1], /09:30-11:00/);
  assert.match(lines[line + 1], /11:00-11:30/);
  assert.equal(day.blocks.length, 11);
  const early = insertBlock(example, "- 07:00-07:30 [personal] Gym");
  assert.equal(early.text.split("\n")[early.line - 1], "");
  assert.match(early.text.split("\n")[early.line + 1], /08:30-09:00/);
});

test("meeting links become the block's url", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- 11:00-11:30 [meeting] 1:1 with Sam https://meet.google.com/abc-defg-hij <!-- gcal:x -->\n");
  assert.equal(day.blocks[0].title, "1:1 with Sam");
  assert.equal(day.blocks[0].url, "https://meet.google.com/abc-defg-hij");
});

test("setBrainDump replaces only the brain dump", () => {
  const out = setBrainDump(example, "- one\n- two");
  assert.equal(out.split("## Brain dump")[0], example.split("## Brain dump")[0]);
  assert.equal(parseDay("2026-10-29", out).brainDump, "- one\n- two");
  assert.match(out, /## Brain dump\n\n- one\n- two\n$/);
  assert.equal(parseDay("2026-10-29", setBrainDump(out, "")).brainDump, "");
  const added = setBrainDump("## Priorities\n\n- [ ] x\n", "note");
  assert.match(added, /- \[ \] x\n\n## Brain dump\n\nnote\n$/);
});

test("insertBlock into an empty template", () => {
  const { text } = insertBlock(emptyDay("2026-10-29"), "- 09:00-09:30 [focus] X");
  assert.match(text, /## Schedule\n\n- 09:00-09:30 \[focus\] X\n\n## Brain dump/);
});

test("overlapping blocks share lanes", () => {
  const day = parseDay("2026-10-29", example);
  const laid = layoutBlocks(day.blocks);
  const arch = laid.find((l) => l.block.title === "Architecture review")!;
  const vendor = laid.find((l) => l.block.title.startsWith("Vendor"))!;
  assert.deepEqual([arch.lane, arch.lanes, vendor.lane, vendor.lanes], [0, 2, 1, 2]);
  assert.equal(laid.find((l) => l.block.title === "Team standup")!.lanes, 1);
});

test("isDate", () => {
  assert.ok(isDate("2026-10-29"));
  assert.ok(!isDate("2026-02-30"));
  assert.ok(!isDate("../etc"));
});

test("nests priorities", () => {
  const day = parseDay("2026-10-29", example);
  const draft = day.priorities.find((p) => p.text === "Draft Q1 hiring plan")!;
  assert.deepEqual([draft.depth, draft.total, draft.doneCount], [0, 2, 1]);
  assert.equal(day.priorities.find((p) => p.text === "Write the proposal")!.depth, 1);
  const tabs = parseDay("2026-10-29", "## Priorities\n- [ ] a\n\t- [ ] b\n\t\t- [ ] c\n");
  assert.deepEqual(tabs.priorities.map((p) => p.depth), [0, 1, 2]);
  assert.equal(parseDay("2026-10-29", "## Priorities\n  - [ ] a\n").priorities[0].depth, 0);
});

test("block children", () => {
  const day = parseDay("2026-10-29", example);
  assert.deepEqual(day.warnings, []);
  const sam = day.blocks.find((b) => b.title === "1:1 with Sam")!;
  assert.equal(sam.gcal, "x1");
  assert.deepEqual(sam.children.map(({ kind, text, label, url, depth }) => ({ kind, text, label, url, depth })), [
    { kind: "link", text: "[1:1 running doc](https://docs.google.com/document/d/abc)", label: "1:1 running doc", url: "https://docs.google.com/document/d/abc", depth: 1 },
    { kind: "note", text: "Ask about on-call rota changes", label: undefined, url: undefined, depth: 1 },
  ]);
});

test("bare url child is a link", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- 10:00-11:00 Work\n\n  * https://example.com/x\n");
  assert.equal(day.blocks[0].children.length, 1);
  assert.equal(day.blocks[0].children[0].kind, "link");
  assert.equal(day.blocks[0].children[0].label, "https://example.com/x");
  assert.equal(day.blocks[0].children[0].url, "https://example.com/x");
});

test("orphan indented line warns", () => {
  assert.equal(parseDay("2026-10-29", "## Schedule\n  - stray\n").warnings.length, 1);
});

test("unknown categories don't warn", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- 10:00-11:00 [gym] Run\n");
  assert.equal(day.warnings.length, 0);
  assert.equal(day.blocks[0].category, "gym");
});

test("setPriorities replaces only priorities", () => {
  const out = setPriorities(example, "- [ ] a\n  - [ ] b");
  assert.equal(parseDay("2026-10-29", out).priorities.map((p) => p.depth).join(), "0,1");
  assert.equal(out.slice(out.indexOf("## Schedule")), example.slice(example.indexOf("## Schedule")));
  const bare = "---\ndate: 2026-10-29\n---\n\n## Schedule\n\n- 09:00-10:00 X\n";
  const added = setPriorities(bare, "- [ ] a");
  assert.equal(added, "---\ndate: 2026-10-29\n---\n\n## Priorities\n\n- [ ] a\n\n## Schedule\n\n- 09:00-10:00 X\n");
});

test("a markdown link in a block title keeps its label and becomes the block's url", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- 14:00-15:00 [meeting] Incident review [thread](https://example.slack.com/archives/C1/p2)\n");
  assert.equal(day.blocks[0].title, "Incident review thread");
  assert.equal(day.blocks[0].url, "https://example.slack.com/archives/C1/p2");
});
