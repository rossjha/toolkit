import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { MAX_WAIT_MS, SAVE_MS, createSync } from "../src/shared/sync.ts";

/** A fake editor + server. PUTs can be held open to simulate a save in flight. */
function harness(fileText = "") {
  let editor = "";
  const puts: { text: string; base: string }[] = [];
  let hold: (() => void) | null = null;
  let holdNext = false;
  const sync = createSync({
    getText: () => editor,
    setText: (t) => (editor = t),
    request: async (method, body) => {
      if (method === "GET") return { ok: true, json: async () => ({ text: fileText, path: "/n.md" }) };
      const put = JSON.parse(body!) as { text: string; base: string };
      puts.push(put);
      if (holdNext) {
        holdNext = false;
        await new Promise<void>((r) => (hold = r));
      }
      fileText = put.text;
      return { ok: true, json: async () => ({ ok: true, conflictFile: null }) };
    },
    onSaveState: () => {},
    onConflict: () => {},
  });
  return {
    sync,
    puts,
    type: (t: string) => ((editor += t), sync.edited()),
    holdNextPut: () => (holdNext = true),
    release: () => hold?.(),
    setFile: (t: string) => (fileText = t),
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test("a pause in typing saves after the debounce", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = harness();
  await h.sync.load();
  h.type("a");
  t.mock.timers.tick(SAVE_MS - 1);
  await flush();
  assert.equal(h.puts.length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(h.puts, [{ text: "a", base: "" }]);
});

test("continuous typing still saves at least every MAX_WAIT_MS", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = harness();
  await h.sync.load();
  for (let ms = 0; ms <= MAX_WAIT_MS; ms += 200) {
    h.type("x");
    t.mock.timers.tick(200);
    await flush();
  }
  assert.ok(h.puts.length >= 1, "saved while typing never paused");
});

test("text typed during a save, then blurred, with an echo mid-save, is still saved", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = harness();
  await h.sync.load();
  h.type("a");
  h.holdNextPut();
  t.mock.timers.tick(SAVE_MS);
  await flush(); // PUT "a" in flight
  h.type("b"); // more typing during the save…
  void h.sync.save(); // …then the editor loses focus: blur save bails out because one is in flight
  void h.sync.pull(); // our own echo arrives mid-save
  h.release();
  await flush();
  t.mock.timers.tick(MAX_WAIT_MS);
  await flush();
  assert.equal(h.puts.at(-1)?.text, "ab");
});

test("an external change replaces the editor when nothing is unsaved", async () => {
  const h = harness("- old");
  await h.sync.load();
  h.setFile("- external");
  await h.sync.pull();
  assert.equal(h.sync.dirty(), false);
  assert.equal(h.puts.length, 0);
});

void mock;
