import assert from "node:assert/strict";
import { test } from "node:test";
import { indentLines } from "../src/shared/indent.ts";

test("indent moves a caret line in by two spaces and the caret with it", () => {
  assert.deepEqual(indentLines("a\nb\nc", 3, 3, false), { value: "a\n  b\nc", selStart: 5, selEnd: 5 });
});

test("indent covers every line the selection touches", () => {
  assert.deepEqual(indentLines("a\nb\nc", 0, 3, false), { value: "  a\n  b\nc", selStart: 2, selEnd: 7 });
});

test("outdent removes up to two leading spaces", () => {
  assert.deepEqual(indentLines(" x", 2, 2, true), { value: "x", selStart: 1, selEnd: 1 });
  assert.deepEqual(indentLines("    x", 5, 5, true).value, "  x");
});

test("outdent of an unindented line changes nothing", () => {
  assert.deepEqual(indentLines("x", 1, 1, true), { value: "x", selStart: 1, selEnd: 1 });
});
