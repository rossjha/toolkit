import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PACK_INCLUDE, buildZip, isExcluded, standaloneCompose, withOverrides } from "../scripts/pack.ts";

const root = join(import.meta.dirname, "..");

test("PACK_INCLUDE excludes secrets, build output and absolute paths", () => {
  for (const bad of [".env", "node_modules", "public/js", "public/app.css"]) {
    assert.ok(!PACK_INCLUDE.includes(bad), bad);
  }
  for (const e of PACK_INCLUDE) {
    assert.ok(!e.startsWith("~") && !e.startsWith("/"), e);
    assert.ok(!e.split("/").includes(".."), e);
  }
});

test("every PACK_INCLUDE entry exists", () => {
  for (const e of PACK_INCLUDE) assert.ok(existsSync(join(root, e)), e);
});

test("isExcluded drops env files and .DS_Store but keeps .env.example", () => {
  assert.ok(isExcluded(".env"));
  assert.ok(isExcluded(".env.local"));
  assert.ok(isExcluded(".DS_Store"));
  assert.ok(!isExcluded(".env.example"));
  assert.ok(!isExcluded("main.ts"));
});

test("buildZip nests under atlassian-notes/ and skips env files, .DS_Store and symlinks", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pack-test-"));
  try {
    const fake = join(tmp, "repo");
    for (const e of PACK_INCLUDE) {
      mkdirSync(dirname(join(fake, e)), { recursive: true });
      if (!/\.\w+$/.test(e) && !e.startsWith(".")) mkdirSync(join(fake, e), { recursive: true });
      else writeFileSync(join(fake, e), "x");
    }
    copyFileSync(join(root, "compose.yaml"), join(fake, "compose.yaml"));
    writeFileSync(join(fake, "package.json"), JSON.stringify({ name: "atlassian-notes" }));
    writeFileSync(join(fake, "src", "a.ts"), "x");
    writeFileSync(join(fake, "src", ".env"), "SECRET");
    writeFileSync(join(fake, "src", ".env.local"), "SECRET");
    writeFileSync(join(fake, "src", ".DS_Store"), "x");
    writeFileSync(join(tmp, "outside.txt"), "x");
    symlinkSync(join(tmp, "outside.txt"), join(fake, "src", "link.txt"));
    const zip = join(tmp, "out.zip");
    buildZip(fake, zip, (dir) => writeFileSync(join(dir, "package-lock.json"), "{}"), { nanoid: "^3.3.20" });
    const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
    assert.ok(names.every((n) => n.startsWith("atlassian-notes/")), names.join());
    assert.ok(names.includes("atlassian-notes/src/a.ts"));
    assert.ok(names.includes("atlassian-notes/.env.example"));
    assert.ok(names.includes("atlassian-notes/package-lock.json"), "lockfile generated for the standalone zip");
    const inZip = (name: string): string => execFileSync("unzip", ["-p", zip, `atlassian-notes/${name}`], { encoding: "utf8" });
    assert.match(inZip("compose.yaml"), /^ {4}build: \.$/m, "the zip builds from its own folder");
    assert.deepEqual(JSON.parse(inZip("package.json")).overrides, { nanoid: "^3.3.20" }, "monorepo overrides carried over");
    for (const bad of [".env", ".env.local", ".DS_Store", "link.txt"]) {
      assert.ok(!names.some((n) => n.endsWith(`/src/${bad}`)), bad);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("standaloneCompose swaps the monorepo build block for `build: .` and keeps everything else", () => {
  const yaml = readFileSync(join(root, "compose.yaml"), "utf8");
  const out = standaloneCompose(yaml);
  assert.match(out, /^ {4}build: \.$/m);
  for (const gone of ["context:", "dockerfile:", "APP:", "../.."]) assert.ok(!out.includes(gone), gone);
  const kept = new Set(out.split("\n"));
  const removed = yaml.split("\n").filter((l) => !kept.has(l));
  assert.ok(removed.length > 0);
  for (const l of removed) assert.match(l, /^ {4}(#|build:)|^ {6}(context|dockerfile|args):|^ {8}APP:/, l);
  for (const l of out.split("\n")) assert.ok(l === "    build: ." || yaml.includes(l), l);
});

test("standaloneCompose refuses a compose.yaml without a multi-line build block", () => {
  assert.throws(() => standaloneCompose("services:\n  app:\n    build: .\n"), /no multi-line build/);
});

test("withOverrides adds the monorepo's overrides; the app's own win on a clash", () => {
  const out = JSON.parse(withOverrides(JSON.stringify({ name: "a", overrides: { react: "19.0.0" } }), { react: "^19.3.1", katex: "^0.18.2" }));
  assert.deepEqual(out.overrides, { react: "19.0.0", katex: "^0.18.2" });
  assert.equal(out.name, "a");
});
