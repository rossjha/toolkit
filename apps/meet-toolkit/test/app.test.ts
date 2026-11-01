import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server/app.ts";
import { readNotes } from "../src/server/notes.ts";

async function serve() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "meet-app-"));
  const scratchpad = path.join(dir, "n.md");
  await readNotes(scratchpad);
  // macOS reports the file's creation a moment after a watcher starts; let it pass so events below are ours.
  await new Promise((r) => setTimeout(r, 300));
  const publicDir = mkdtempSync(path.join(os.tmpdir(), "meet-pub-"));
  await fs.writeFile(path.join(publicDir, "index.html"), "<p>hi</p>");
  const app = createApp({ scratchpad, publicDir });
  const server = http.createServer(app.handle);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const close = () => (app.close(), new Promise((r) => server.close(r)));
  return { dir, scratchpad, base, close };
}

/** Resolves true if a notes event arrives within ms, false otherwise. */
async function nextEvent(base: string, trigger: () => Promise<void>, ms: number): Promise<boolean> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  await reader.read(); // ": connected"
  const got = (async () => {
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return false;
      buf += new TextDecoder().decode(value);
      if (buf.includes('data: {"type":"notes"}')) return true;
    }
  })().catch(() => false);
  await trigger();
  const result = await Promise.race([got, new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);
  ctrl.abort();
  return result;
}

test("GET and PUT /api/notes round-trip", async () => {
  const s = await serve();
  try {
    assert.deepEqual(await (await fetch(`${s.base}/api/notes`)).json(), { text: "", path: s.scratchpad });
    const put = await fetch(`${s.base}/api/notes`, { method: "PUT", body: JSON.stringify({ text: "- a", base: "" }) });
    assert.deepEqual(await put.json(), { ok: true, conflictFile: null });
    assert.equal((await (await fetch(`${s.base}/api/notes`)).json()).text, "- a");
  } finally {
    await s.close();
  }
});

test("PUT with a bad body is a 400", async () => {
  const s = await serve();
  try {
    assert.equal((await fetch(`${s.base}/api/notes`, { method: "PUT", body: "nope" })).status, 400);
    assert.equal((await fetch(`${s.base}/api/notes`, { method: "PUT", body: '{"text":1}' })).status, 400);
  } finally {
    await s.close();
  }
});

test("a change to the scratchpad is pushed to open pages", async () => {
  const s = await serve();
  try {
    assert.equal(await nextEvent(s.base, () => fs.writeFile(s.scratchpad, "- external"), 2000), true);
  } finally {
    await s.close();
  }
});

test("other files in the folder don't trigger events", async () => {
  const s = await serve();
  try {
    assert.equal(await nextEvent(s.base, () => fs.writeFile(path.join(s.dir, "other.md"), "x"), 500), false);
  } finally {
    await s.close();
  }
});

test("static files are served and paths can't escape public", async () => {
  const s = await serve();
  try {
    assert.equal(await (await fetch(`${s.base}/`)).text(), "<p>hi</p>");
    assert.equal((await fetch(`${s.base}/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  } finally {
    await s.close();
  }
});
