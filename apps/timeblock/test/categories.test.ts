import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryColor, DEFAULT_CATEGORIES, formatCategories, parseCategories } from "../src/shared/categories.ts";

test("formatCategories round-trips the defaults", () => {
  const text = formatCategories(DEFAULT_CATEGORIES);
  assert.ok(text.startsWith("# Categories\n\n- meeting: Meeting · chart-2 · solid\n"));
  assert.deepEqual(parseCategories(text), { categories: [...DEFAULT_CATEGORIES], warnings: [] });
});

test("parses labels, colours and styles", () => {
  const { categories, warnings } = parseCategories("- training: Deep Training · chart-5 · hatched\n- Gym: Gym | success | solid");
  assert.deepEqual(warnings, []);
  assert.deepEqual(categories, [
    { id: "training", label: "Deep Training", color: "chart-5", style: "hatched" },
    { id: "gym", label: "Gym", color: "success", style: "solid" },
  ]);
});

test("missing parts default", () => {
  assert.deepEqual(parseCategories("- x: X").categories, [{ id: "x", label: "X", color: "dim", style: "hatched" }]);
});

test("bad lines warn and are skipped", () => {
  const { categories, warnings } = parseCategories("- a: A · pink · hatched\n- a: Again\n- nonsense\n- b: B · accent · dotted");
  assert.equal(warnings.length, 4);
  assert.deepEqual(categories.map((c) => [c.id, c.color, c.style]), [
    ["a", "dim", "hatched"],
    ["b", "accent", "hatched"],
  ]);
});

test("empty file means no categories", () => {
  assert.deepEqual(parseCategories(""), { categories: [], warnings: [] });
});

test("categoryColor", () => {
  assert.equal(categoryColor(DEFAULT_CATEGORIES[0]), "var(--chart-2)");
  assert.equal(categoryColor(undefined), "var(--dim)");
});
