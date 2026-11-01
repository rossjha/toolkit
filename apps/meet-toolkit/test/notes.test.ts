import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { conflictPath } from "../src/server/config.ts";
import { readNotes, saveNotes } from "../src/server/notes.ts";

const tmp = (): string => mkdtempSync(path.join(os.tmpdir(), "meet-notes-"));
const exists = (f: string) => fs.stat(f).then(() => true, () => false);

test("readNotes creates a missing folder and file", async () => {
  const file = path.join(tmp(), "deep", "dir", "n.md");
  assert.equal(await readNotes(file), "");
  assert.equal(await fs.readFile(file, "utf8"), "");
});

test("save with matching base never writes a conflict", async () => {
  const file = path.join(tmp(), "n.md");
  await readNotes(file);
  assert.deepEqual(await saveNotes(file, "a", ""), { conflictFile: null });
  assert.deepEqual(await saveNotes(file, "b", "a"), { conflictFile: null });
  assert.equal(await fs.readFile(file, "utf8"), "b");
  assert.equal(await exists(conflictPath(file)), false);
});

test("save over an external change keeps the external version as a conflict file", async () => {
  const file = path.join(tmp(), "n.md");
  await fs.writeFile(file, "external");
  const res = await saveNotes(file, "mine", "old");
  assert.equal(res.conflictFile, conflictPath(file));
  assert.equal(await fs.readFile(conflictPath(file), "utf8"), "external");
  assert.equal(await fs.readFile(file, "utf8"), "mine");
});

test("a scratchpad deleted by something else comes back empty", async () => {
  const file = path.join(tmp(), "n.md");
  await fs.writeFile(file, "x");
  await fs.rm(file);
  assert.equal(await readNotes(file), "");
  assert.equal(await exists(file), true);
});

test("saves leave no temp files behind", async () => {
  const dir = tmp();
  const file = path.join(dir, "n.md");
  await saveNotes(file, "a", "");
  assert.deepEqual(await fs.readdir(dir), ["n.md"]);
});

test("overlapping saves both succeed", async () => {
  const file = path.join(tmp(), "n.md");
  await readNotes(file);
  await Promise.all([saveNotes(file, "a", ""), saveNotes(file, "a", ""), saveNotes(file, "a", "")]);
  assert.equal(await fs.readFile(file, "utf8"), "a");
});
