import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDay } from "../src/shared/day.ts";
import { childEdits, loadedChildren } from "../src/web/dialog-children.ts";

const block = (children: string): ReturnType<typeof parseDay>["blocks"][number] =>
  parseDay("", `## Schedule\n\n- 09:00-10:00 [focus] Work\n${children}`).blocks[0];

test("untouched hand-formatted links and notes are not reported as edits", () => {
  const b = block("  - [](https://x.test)\n  - [ Doc ](https://d.test)\n  - https://bare.test\n  - note  \n    - deeper");
  const loaded = loadedChildren(b.children);
  // The dialog's inputs hold exactly the loaded values.
  const current = { links: loaded.links.map((l) => ({ ...l })), notes: loaded.notes };
  assert.deepEqual(childEdits(loaded, current), {});
});

test("an edited link list is written tidy: trimmed, empty URLs dropped, empty label falls back to the URL", () => {
  const loaded = loadedChildren(block("  - [Doc](https://d.test)").children);
  const current = { links: [{ label: " Doc ", url: "https://d.test" }, { label: "", url: " https://n.test " }, { label: "x", url: "" }], notes: loaded.notes };
  assert.deepEqual(childEdits(loaded, current), {
    links: [
      { label: "Doc", url: "https://d.test" },
      { label: "https://n.test", url: "https://n.test" },
    ],
  });
});

test("only the part that changed is in the edit", () => {
  const loaded = loadedChildren(block("  - [Doc](https://d.test)\n  - prep").children);
  assert.deepEqual(loaded.notes, "prep");
  assert.deepEqual(childEdits(loaded, { links: loaded.links, notes: "prep\n  more" }), { notes: "prep\n  more" });
  assert.deepEqual(childEdits(loaded, { links: [], notes: loaded.notes }), { links: [] });
});

test("nested notes load with two spaces per level below the first", () => {
  assert.equal(loadedChildren(block("  - a\n    - b\n      - c").children).notes, "a\n  b\n    c");
});
