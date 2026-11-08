import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApp } from "../src/server/app.ts";
import { DEFAULT_CATEGORIES, formatCategories } from "../src/shared/categories.ts";
import { localToday } from "../src/shared/day.ts";

async function withApp(fn: (base: string, daysDir: string, settingsFile: string) => Promise<void>): Promise<void> {
  const daysDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeblock-days-"));
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeblock-public-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeblock-config-"));
  const settingsFile = path.join(configDir, "timeblock.md");
  const app = createApp({ daysDir, publicDir, settingsFile });
  const server = http.createServer(app.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, daysDir, settingsFile);
  } finally {
    app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(daysDir, { recursive: true, force: true });
    fs.rmSync(publicDir, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

test("GET /api/categories creates the defaults", () =>
  withApp(async (base, daysDir) => {
    const body = (await (await fetch(`${base}/api/categories`)).json()) as { markdown: string };
    const expected = formatCategories(DEFAULT_CATEGORIES);
    assert.equal(body.markdown, expected);
    assert.equal(fs.readFileSync(path.join(daysDir, "categories.md"), "utf8"), expected);
  }));

test("PUT /api/categories writes the file", () =>
  withApp(async (base, daysDir) => {
    const put = await fetch(`${base}/api/categories`, { method: "PUT", body: "- x: X" });
    assert.deepEqual(await put.json(), { ok: true });
    const body = (await (await fetch(`${base}/api/categories`)).json()) as { markdown: string };
    assert.equal(body.markdown, "- x: X");
    assert.equal(fs.readFileSync(path.join(daysDir, "categories.md"), "utf8"), "- x: X");
  }));

test("an empty categories file stays empty", () =>
  withApp(async (base, daysDir) => {
    fs.writeFileSync(path.join(daysDir, "categories.md"), "");
    const body = (await (await fetch(`${base}/api/categories`)).json()) as { markdown: string };
    assert.equal(body.markdown, "");
  }));

test("categories.md is not a day", () =>
  withApp(async (base) => {
    assert.equal((await fetch(`${base}/api/day/categories`)).status, 400);
  }));

test("a missing day the page calls today is created, so Claude has a file to edit", () =>
  withApp(async (base, daysDir) => {
    const body = (await (await fetch(`${base}/api/day/2031-01-02?today=1`)).json()) as { exists: boolean };
    assert.equal(body.exists, true);
    assert.ok(fs.existsSync(path.join(daysDir, "2031-01-02.md")));
  }));

test("a missing day the page says isn't today is shown but not created, even if it's the server's today", () =>
  withApp(async (base, daysDir) => {
    const serverToday = localToday();
    const body = (await (await fetch(`${base}/api/day/${serverToday}?today=0`)).json()) as { exists: boolean };
    assert.equal(body.exists, false);
    assert.ok(!fs.existsSync(path.join(daysDir, `${serverToday}.md`)));
  }));

test("without ?today the server's own date decides, as before", () =>
  withApp(async (base, daysDir) => {
    await fetch(`${base}/api/day/${localToday()}`);
    assert.ok(fs.existsSync(path.join(daysDir, `${localToday()}.md`)));
    const other = (await (await fetch(`${base}/api/day/2031-01-03`)).json()) as { exists: boolean };
    assert.equal(other.exists, false);
  }));

test("GET /api/settings says when there's no settings file, and creates nothing", () =>
  withApp(async (base, _daysDir, settingsFile) => {
    const body = await (await fetch(`${base}/api/settings`)).json();
    assert.deepEqual(body, { markdown: "", exists: false });
    assert.equal(fs.existsSync(settingsFile), false);
  }));

test("GET /api/settings returns the file, and the settings can't be written", () =>
  withApp(async (base, _daysDir, settingsFile) => {
    fs.writeFileSync(settingsFile, "## Time zones\n- UK: Europe/London\n");
    assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), { markdown: "## Time zones\n- UK: Europe/London\n", exists: true });
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", body: "x" })).status, 405);
  }));

test("a change to the settings file is pushed to open pages", () =>
  withApp(async (base, _daysDir, settingsFile) => {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: ac.signal });
    const reader = res.body!.getReader();
    await reader.read(); // ": connected"
    fs.writeFileSync(settingsFile, "## Snippets\n### Hi\nHello\n");
    let seen = "";
    while (!seen.includes('"settings"')) seen += new TextDecoder().decode((await reader.read()).value);
    ac.abort();
  }));
