import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictPath, loadConfig } from "../src/server/config.ts";

test("defaults", () => {
  assert.deepEqual(loadConfig({}, "/h"), {
    scratchpad: "/h/meet-toolkit/meet-toolkit-scratchpad.md",
    port: 4319,
    host: "127.0.0.1",
    openBrowser: true,
  });
});

test("MEET_SCRATCHPAD expands ~ and resolves", () => {
  assert.equal(loadConfig({ MEET_SCRATCHPAD: "~/x/n.md" }, "/h").scratchpad, "/h/x/n.md");
  assert.equal(loadConfig({ MEET_SCRATCHPAD: "/abs/n.md" }, "/h").scratchpad, "/abs/n.md");
});

test("PORT, HOST and OPEN_BROWSER", () => {
  const c = loadConfig({ PORT: "4400", HOST: "0.0.0.0", OPEN_BROWSER: "false" }, "/h");
  assert.equal(c.port, 4400);
  assert.equal(c.host, "0.0.0.0");
  assert.equal(c.openBrowser, false);
});

test("conflictPath sits next to the scratchpad", () => {
  assert.equal(conflictPath("/a/n.md"), "/a/n.conflict.md");
  assert.equal(conflictPath("/a/notes"), "/a/notes.conflict.md");
});
