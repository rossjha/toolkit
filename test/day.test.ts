import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { emptyDay, insertBlock, isDate, layoutBlocks, parseDay, togglePriority } from "../src/shared/day.ts";

const example = fs.readFileSync(new URL("../examples/2026-10-29.md", import.meta.url), "utf8");

test("parses the example day", () => {
  const day = parseDay("2026-10-29", example);
  assert.deepEqual(day.warnings, []);
  assert.equal(day.priorities.length, 3);
  assert.equal(day.priorities[0].done, true);
  assert.equal(day.blocks.length, 10);
  assert.deepEqual(day.blocks[1], { start: 540, end: 555, category: "meeting", title: "Team standup", line: 13 });
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

test("warns about unreadable lines and unknown categories", () => {
  const day = parseDay("2026-10-29", "## Schedule\n- sometime: lunch\n- 10:00-09:00 backwards\n- 10:00-11:00 [gym] Run\n");
  assert.equal(day.warnings.length, 3);
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
