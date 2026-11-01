import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { parseDay } from "../src/shared/day.ts";
import { deleteBlock, formatBlockLine, locateBlock, pushBlocks, retimeBlock, snapshotBlock, upsertBlock } from "../src/shared/schedule.ts";

const example = fs.readFileSync(new URL("../examples/2026-10-29.md", import.meta.url), "utf8");
const exampleLines = example.split("\n");
// The schedule line mentioning `needle` (priorities share some words with blocks).
const lineOf = (text: string, needle: string): number => text.split("\n").findIndex((l) => /^- \d/.test(l) && l.includes(needle));
const blockByTitle = (text: string, title: string) => parseDay("2026-10-29", text).blocks.find((b) => b.title.startsWith(title));

test("formatBlockLine writes the standard form", () => {
  assert.equal(formatBlockLine({ start: 540, end: 570, category: "focus", title: "X" }), "- 09:00-09:30 [focus] X");
  assert.equal(
    formatBlockLine({ start: 660, end: 690, category: "meeting", title: "1:1", url: "https://meet.google.com/a", gcal: "x1" }),
    "- 11:00-11:30 [meeting] 1:1 https://meet.google.com/a <!-- gcal:x1 -->",
  );
  assert.equal(formatBlockLine({ start: 540, end: 570, category: "", title: "X" }), "- 09:00-09:30 X");
});

test("retime keeps the rest of the line", () => {
  const at = lineOf(example, "Q1 hiring plan");
  const text = retimeBlock(example, at, 585, 675);
  const lines = text.split("\n");
  assert.equal(lines[at], "- 09:45-11:15 [focus] Q1 hiring plan");
  assert.equal(lines.length, exampleLines.length);
  lines.forEach((l, i) => i !== at && assert.equal(l, exampleLines[i]));
});

test("retime replaces a loose time range without touching the title", () => {
  const text = "## Schedule\n\n- 9-10:30 Deep work  https://x.test  \n";
  assert.equal(retimeBlock(text, 2, 600, 660), "## Schedule\n\n- 10:00-11:00 Deep work  https://x.test  \n");
});

test("retime moves the block with its children", () => {
  const text = retimeBlock(example, lineOf(example, "1:1 with Sam"), 990, 1020);
  const lines = text.split("\n");
  const rfc = lineOf(text, "RFC comments");
  assert.equal(lines[rfc + 1], "- 16:30-17:00 [meeting] 1:1 with Sam https://meet.google.com/abc-defg-hij <!-- gcal:x1 -->");
  assert.equal(lines[rfc + 2], "  - [1:1 running doc](https://docs.google.com/document/d/abc)");
  assert.equal(lines[rfc + 3], "  - Ask about on-call rota changes");
  assert.ok(text.endsWith(example.slice(example.indexOf("\n\n## Brain dump"))));
  assert.match(text, /Ask about on-call rota changes\n\n## Brain dump/);
  assert.match(text, /Q1 hiring plan\n- 12:00-12:45/);
  const day = parseDay("2026-10-29", text);
  assert.deepEqual(day.warnings, []);
  assert.equal(blockByTitle(text, "1:1")?.children.length, 2);
  assert.equal(lines.length, exampleLines.length);
});

test("retime is stable among equal starts", () => {
  const text = "## Schedule\n\n- 09:00-10:00 A\n- 10:00-11:00 B\n- 11:00-12:00 C\n";
  assert.equal(retimeBlock(text, 4, 600, 630), "## Schedule\n\n- 09:00-10:00 A\n- 10:00-11:00 B\n- 10:00-10:30 C\n");
  assert.equal(retimeBlock(text, 2, 600, 630), "## Schedule\n\n- 10:00-10:30 A\n- 10:00-11:00 B\n- 11:00-12:00 C\n");
});

test("retime clamps at midnight", () => {
  const text = retimeBlock(example, lineOf(example, "RFC comments"), 1430, 1470);
  assert.ok(text.split("\n")[lineOf(text, "RFC comments")].startsWith("- 23:20-24:00"));
  assert.deepEqual(parseDay("2026-10-29", text).warnings, []);
  const early = retimeBlock(example, lineOf(example, "Inbox and Slack"), -20, 10);
  assert.ok(early.split("\n")[lineOf(early, "Inbox and Slack")].startsWith("- 00:00-00:30"));
});

test("push skips calendar blocks", () => {
  const text = pushBlocks(example, 600, 15);
  const lines = text.split("\n");
  const day = parseDay("2026-10-29", text);
  assert.deepEqual(day.warnings, []);
  assert.equal(lines[lineOf(text, "1:1 with Sam")], exampleLines[lineOf(example, "1:1 with Sam")]);
  assert.equal(lines[lineOf(text, "Architecture review")], "- 13:15-14:15 [meeting] Architecture review");
  assert.equal(lines[lineOf(text, "Vendor call")], "- 13:45-14:15 [meeting] Vendor call (clashes)");
  assert.equal(lines[lineOf(text, "RFC comments")], "- 16:15-17:15 [focus] RFC comments");
  assert.equal(lines[lineOf(text, "Dentist")], "- 12:15-13:00 [personal] Dentist, then lunch with a very long title to check clipping");
  for (const t of ["Inbox and Slack", "Team standup", "Q1 hiring plan"]) assert.equal(lines[lineOf(text, t)], exampleLines[lineOf(example, t)]);
  assert.equal(lines.length, exampleLines.length);
  const starts = day.blocks.map((b) => b.line);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
});

test("push moves a block past a calendar meeting it now starts after", () => {
  const text = "## Schedule\n\n- 10:00-10:30 A\n- 10:15-10:45 Meet <!-- gcal:g -->\n\n## Brain dump\n";
  assert.equal(pushBlocks(text, 600, 30), "## Schedule\n\n- 10:15-10:45 Meet <!-- gcal:g -->\n- 10:30-11:00 A\n\n## Brain dump\n");
});

test("push past midnight clamps", () => {
  const text = "## Schedule\n\n- 23:00-23:20 [focus] Late\n- 23:30-23:45 [focus] Later\n\n## Brain dump\n";
  assert.equal(pushBlocks(text, 0, 30), "## Schedule\n\n- 23:30-23:50 [focus] Late\n- 23:45-24:00 [focus] Later\n\n## Brain dump\n");
});

test("upsert creates in order", () => {
  const r = upsertBlock(example, null, { fields: { start: 600, end: 630, category: "admin", title: "New" } });
  assert.ok(r.ok);
  const lines = r.text.split("\n");
  assert.equal(lines[r.line], "- 10:00-10:30 [admin] New");
  assert.match(lines[r.line - 1], /^- 09:30-11:00/);
  assert.match(lines[r.line + 1], /^- 11:00-11:30/);
  assert.deepEqual(parseDay("2026-10-29", r.text).warnings, []);
});

test("upsert creates with links and notes as children", () => {
  const r = upsertBlock(example, null, {
    fields: { start: 1080, end: 1110, category: "admin", title: "Wrap" },
    links: [{ label: "Doc", url: "https://d.test" }],
    notes: "- one\n\n   two\n* three",
  });
  assert.ok(r.ok);
  assert.match(r.text, /RFC comments\n- 18:00-18:30 \[admin\] Wrap\n {2}- \[Doc\]\(https:\/\/d\.test\)\n {2}- one\n {5}- two\n {2}- three\n\n## Brain dump/);
});

test("upsert notes on a calendar block keeps its line", () => {
  const at = lineOf(example, "1:1 with Sam");
  const snap = snapshotBlock(example, at);
  assert.deepEqual(snap.children, ["  - [1:1 running doc](https://docs.google.com/document/d/abc)", "  - Ask about on-call rota changes"]);
  const b = blockByTitle(example, "1:1")!;
  const r = upsertBlock(example, snap, {
    fields: { start: b.start, end: b.end, category: b.category, title: b.title, url: b.url, gcal: b.gcal },
    notes: "Ask about on-call rota changes\nPrep slides",
  });
  assert.ok(r.ok);
  const lines = r.text.split("\n");
  assert.equal(r.line, at);
  assert.equal(lines[at], exampleLines[at]);
  assert.deepEqual(lines.slice(at + 1, at + 4), [
    "  - [1:1 running doc](https://docs.google.com/document/d/abc)",
    "  - Ask about on-call rota changes",
    "  - Prep slides",
  ]);
  assert.equal(lines.length, exampleLines.length + 1);
  assert.deepEqual(parseDay("2026-10-29", r.text).warnings, []);
});

test("upsert rewrites the line only when fields change, and re-sorts", () => {
  const at = lineOf(example, "Q1 hiring plan");
  const snap = snapshotBlock(example, at);
  const same = upsertBlock(example, snap, { fields: { start: 570, end: 660, category: "focus", title: "Q1 hiring plan" } });
  assert.ok(same.ok);
  assert.equal(same.text, example);
  const moved = upsertBlock(example, snap, { fields: { start: 1000, end: 1030, category: "study", title: "Q1 plan" } });
  assert.ok(moved.ok);
  assert.equal(moved.text.split("\n")[moved.line], "- 16:40-17:10 [study] Q1 plan");
  assert.match(moved.text, /RFC comments\n- 16:40-17:10 \[study\] Q1 plan\n\n## Brain dump/);
});

test("upsert refuses when children changed underneath", () => {
  const at = lineOf(example, "1:1 with Sam");
  const snap = snapshotBlock(example, at);
  const changed = example.replace("  - Ask about on-call rota changes", "  - Ask about holidays");
  const b = blockByTitle(example, "1:1")!;
  const fields = { start: b.start, end: b.end, category: b.category, title: b.title, url: b.url, gcal: b.gcal };
  assert.deepEqual(upsertBlock(changed, snap, { fields, notes: "x" }), { ok: false, error: "This block changed in the file — reopen it." });
  assert.deepEqual(upsertBlock(changed, snap, { fields, links: [] }), { ok: false, error: "This block changed in the file — reopen it." });
  const r = upsertBlock(changed, snap, { fields: { ...fields, title: "1:1 with Sam B" } });
  assert.ok(r.ok);
  assert.match(r.text, /1:1 with Sam B https:\/\/meet\.google\.com\/abc-defg-hij <!-- gcal:x1 -->\n {2}- \[1:1 running doc\]/);
  assert.match(r.text, /Ask about holidays/);
});

test("upsert on a block that's gone", () => {
  const snap = snapshotBlock(example, lineOf(example, "Q1 hiring plan"));
  const gone = example.replace("- 09:30-11:00 [focus] Q1 hiring plan\n", "");
  assert.deepEqual(upsertBlock(gone, snap, { fields: { start: 0, end: 5, category: "focus", title: "x" } }), {
    ok: false,
    error: "This block is no longer in the file.",
  });
});

test("locate finds a moved line", () => {
  const snap = snapshotBlock(example, lineOf(example, "Architecture review"));
  assert.equal(locateBlock(example, snap), snap.line);
  const shifted = example.replace("## Schedule\n", "## Schedule\n- 06:00-06:30 Early\n");
  assert.equal(locateBlock(shifted, snap), snap.line + 1);
  assert.equal(locateBlock(example.replace("Architecture review", "Arch"), snap), -1);
});

test("delete removes children and refuses calendar", () => {
  const withKids = example.replace("- 16:00-17:00 [focus] RFC comments", "- 16:00-17:00 [focus] RFC comments\n  - note a\n\n    - note b");
  const snap = snapshotBlock(withKids, lineOf(withKids, "RFC comments"));
  assert.deepEqual(snap.children, ["  - note a", "    - note b"]);
  const r = deleteBlock(withKids, snap);
  assert.ok(r.ok);
  assert.equal(r.text, example.replace("- 16:00-17:00 [focus] RFC comments\n", ""));
  const mid = deleteBlock(example, snapshotBlock(example, lineOf(example, "Team standup")));
  assert.ok(mid.ok);
  assert.equal(mid.text, example.replace("- 09:00-09:15 [meeting] Team standup\n", ""));
  assert.deepEqual(deleteBlock(example, snapshotBlock(example, lineOf(example, "1:1 with Sam"))), {
    ok: false,
    error: "Calendar meetings can't be deleted here.",
  });
});

test("delete the only block leaves a tidy section", () => {
  const text = "## Schedule\n\n- 09:00-09:30 X\n\n## Brain dump\n";
  const r = deleteBlock(text, snapshotBlock(text, 2));
  assert.ok(r.ok);
  assert.equal(r.text, "## Schedule\n\n## Brain dump\n");
});

test("locate ignores identical lines outside the Schedule", () => {
  const text = "## Schedule\n\n- 11:00-12:00 B\n\n## Brain dump\n\n- 11:00-12:00 B\n";
  const snap = snapshotBlock(text, 2);
  const edited = text.replace("## Schedule\n\n- 11:00-12:00 B", "## Schedule\n\n- 12:30-13:30 B");
  assert.equal(locateBlock(edited, snap), -1);
  const gone = { ok: false, error: "This block is no longer in the file." };
  assert.deepEqual(upsertBlock(edited, snap, { fields: { start: 660, end: 720, category: "focus", title: "B" } }), gone);
  assert.deepEqual(deleteBlock(edited, snap), gone);
  const moved = "## Brain dump\n\n- 11:00-12:00 B\n\n## Schedule\n\n- 09:00-09:30 A\n- 11:00-12:00 B\n";
  assert.equal(locateBlock(moved, snap), 7);
});

test("delete refuses when children changed underneath", () => {
  const withKid = example.replace("- 16:00-17:00 [focus] RFC comments", "- 16:00-17:00 [focus] RFC comments\n  - note a");
  const snap = snapshotBlock(withKid, lineOf(withKid, "RFC comments"));
  const added = withKid.replace("  - note a", "  - note a\n  - added by Claude");
  assert.deepEqual(deleteBlock(added, snap), { ok: false, error: "This block changed in the file — reopen it." });
});
