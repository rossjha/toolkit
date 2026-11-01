import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApp } from "../src/server/app.ts";
import { DEFAULT_CATEGORIES, formatCategories } from "../src/shared/categories.ts";

async function withApp(fn: (base: string, daysDir: string) => Promise<void>): Promise<void> {
  const daysDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeblock-days-"));
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeblock-public-"));
  const app = createApp({ daysDir, publicDir });
  const server = http.createServer(app.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, daysDir);
  } finally {
    app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(daysDir, { recursive: true, force: true });
    fs.rmSync(publicDir, { recursive: true, force: true });
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
