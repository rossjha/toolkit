import { test } from "node:test";
import assert from "node:assert/strict";
import { onEnter, onTab, type EditResult } from "../src/shared/editor.ts";

// "|" marks the cursor; a second "|" marks the end of a selection.
function at(s: string): [string, number, number] {
  const a = s.indexOf("|");
  const rest = s.slice(0, a) + s.slice(a + 1);
  const b = rest.indexOf("|");
  return b === -1 ? [rest, a, a] : [rest.slice(0, b) + rest.slice(b + 1), a, b];
}
function show(r: EditResult | null): string | null {
  if (!r) return null;
  return r.selStart === r.selEnd
    ? r.text.slice(0, r.selStart) + "|" + r.text.slice(r.selStart)
    : r.text.slice(0, r.selStart) + "|" + r.text.slice(r.selStart, r.selEnd) + "|" + r.text.slice(r.selEnd);
}
const enter = (s: string) => show(onEnter(...at(s)));
const tab = (s: string, outdent = false) => show(onTab(...at(s), outdent));

test("Enter continues a bullet at the same indent", () => {
  assert.equal(enter("- a|"), "- a\n- |");
  assert.equal(enter("  - a|"), "  - a\n  - |");
  assert.equal(enter("* a|"), "* a\n* |");
});

test("Enter continues checkboxes unticked", () => {
  assert.equal(enter("- [x] done|"), "- [x] done\n- [ ] |");
  assert.equal(enter("- [ ] todo|"), "- [ ] todo\n- [ ] |");
});

test("Enter on an empty nested bullet steps out a level", () => {
  assert.equal(enter("- a\n  - |"), "- a\n- |");
  assert.equal(enter("    - [ ] |"), "  - [ ] |");
});

test("Enter on an empty top-level bullet ends the list", () => {
  assert.equal(enter("- a\n- |"), "- a\n|");
  assert.equal(enter("- [ ] |"), "|");
});

test("Enter mid-line splits into a new bullet", () => {
  assert.equal(enter("- ab|cd"), "- ab\n- |cd");
});

test("Enter is left to the browser outside bullets or with a selection", () => {
  assert.equal(enter("1. a|"), null);
  assert.equal(enter("plain|"), null);
  assert.equal(enter("- a|b|"), null);
});

test("Tab indents the line and moves the cursor with it", () => {
  assert.equal(tab("- a|"), "  - a|");
  assert.equal(tab("x\n- |a"), "x\n  - |a");
});

test("Tab indents every selected line and keeps them selected", () => {
  assert.equal(tab("- |a\n- b|"), "  - |a\n  - b|");
});

test("Shift+Tab outdents by up to one level", () => {
  assert.equal(tab("  - a|", true), "- a|");
  assert.equal(tab(" - a|", true), "- a|");
  assert.equal(tab("- a|", true), "- a|");
  assert.equal(tab("  - |a\n    - b|", true), "- |a\n  - b|");
});

test("Shift+Tab never moves the cursor before its line", () => {
  assert.equal(tab("x\n | - a", true), "x\n|- a");
});

test("Enter at or before the bullet marker is a plain newline", () => {
  assert.equal(enter("|- foo"), null);
  assert.equal(enter(" |  - foo"), null);
  assert.equal(enter("- |foo"), null);
  assert.equal(enter("- [ ] |foo"), null);
  assert.equal(enter("- f|oo"), "- f\n- |oo");
});
