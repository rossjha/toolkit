import assert from "node:assert/strict";
import { test } from "node:test";
import { textParts } from "../src/shared/links.ts";

test("a markdown link shows only its label", () => {
  assert.deepEqual(textParts("See the [thread](https://example.slack.com/archives/C1/p2) for context"), [
    { text: "See the " },
    { label: "thread", url: "https://example.slack.com/archives/C1/p2" },
    { text: " for context" },
  ]);
});

test("a bare URL is a link to itself, without the full stop after it", () => {
  assert.deepEqual(textParts("Docs at https://example.com/a?b=1."), [
    { text: "Docs at " },
    { label: "https://example.com/a?b=1", url: "https://example.com/a?b=1" },
    { text: "." },
  ]);
});

test("several links, and text with none", () => {
  assert.deepEqual(textParts("[a](https://a.example) and [b](https://b.example)"), [
    { label: "a", url: "https://a.example" },
    { text: " and " },
    { label: "b", url: "https://b.example" },
  ]);
  assert.deepEqual(textParts("no links here"), [{ text: "no links here" }]);
  assert.deepEqual(textParts(""), []);
});

test("brackets without a web URL are left as text", () => {
  assert.deepEqual(textParts("[x] done [y](not-a-url)"), [{ text: "[x] done [y](not-a-url)" }]);
});
