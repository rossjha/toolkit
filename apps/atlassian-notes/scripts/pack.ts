import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PACK_INCLUDE: string[] = [
  "package.json",
  "tsconfig.json",
  "tsconfig.web.json",
  "tsconfig.scratchpad.json",
  ".env.example",
  "README.md",
  "Dockerfile",
  "Dockerfile.dockerignore",
  "compose.yaml",
  "examples",
  "scripts",
  "src",
  "public/index.html",
  "public/favicon.svg",
  "public/fonts",
  "public/theme-init.js",
];

export function isExcluded(name: string): boolean {
  return name === ".DS_Store" || (name.startsWith(".env") && name !== ".env.example");
}

/** compose.yaml builds from the monorepo root; the zip has no monorepo, so it builds from its own folder. */
export function standaloneCompose(yaml: string): string {
  const block = /(?:^ {4}#.*\n)*^ {4}build:\n(?:^ {6}.*\n)+/m;
  if (!block.test(yaml)) throw new Error("compose.yaml: no multi-line build: block to replace.");
  return yaml.replace(block, "    build: .\n");
}

/** npm only applies overrides from the root package.json, so the zip's package.json gets the monorepo's. */
export function withOverrides(packageJson: string, overrides: Record<string, unknown>): string {
  const pkg = JSON.parse(packageJson) as { overrides?: Record<string, unknown> };
  pkg.overrides = { ...overrides, ...pkg.overrides };
  return JSON.stringify(pkg, null, 2) + "\n";
}

/** The monorepo root's overrides (patched transitive deps, one React copy), or {} outside the monorepo. */
function monorepoOverrides(root: string): Record<string, unknown> {
  const file = join(root, "..", "..", "package.json");
  if (!existsSync(file)) return {};
  const pkg = JSON.parse(readFileSync(file, "utf8")) as { workspaces?: string[]; overrides?: Record<string, unknown> };
  return pkg.workspaces ? (pkg.overrides ?? {}) : {};
}

/** Writes a standalone package-lock.json for the staged app (the monorepo's lockfile lives at the repo root). */
function npmLock(dir: string): void {
  const res = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: dir,
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error("npm could not generate package-lock.json.");
}

/**
 * Stages PACK_INCLUDE (no symlinks, no env files) under <tmp>/atlassian-notes, makes compose.yaml and package.json
 * standalone, adds a lockfile and zips that folder.
 */
export function buildZip(
  root: string,
  out: string,
  makeLock: (dir: string) => void = npmLock,
  overrides: Record<string, unknown> = monorepoOverrides(root),
): void {
  const stage = mkdtempSync(join(tmpdir(), "atlassian-notes-pack-"));
  try {
    const dest = join(stage, "atlassian-notes");
    for (const entry of PACK_INCLUDE) {
      mkdirSync(dirname(join(dest, entry)), { recursive: true });
      cpSync(join(root, entry), join(dest, entry), {
        recursive: true,
        filter: (src) => !isExcluded(basename(src)) && !lstatSync(src).isSymbolicLink(),
      });
    }
    const compose = join(dest, "compose.yaml");
    writeFileSync(compose, standaloneCompose(readFileSync(compose, "utf8")));
    if (Object.keys(overrides).length) {
      const pkg = join(dest, "package.json");
      writeFileSync(pkg, withOverrides(readFileSync(pkg, "utf8"), overrides));
    }
    makeLock(dest);
    rmSync(out, { force: true });
    const res = spawnSync("zip", ["-r", "-q", "-y", out, "atlassian-notes", "-x", "*.DS_Store"], {
      cwd: stage,
      stdio: "inherit",
    });
    if (res.status !== 0) throw new Error("zip failed.");
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const out = join(dirname(root), "atlassian-notes.zip");

  const missing = PACK_INCLUDE.filter((e) => !existsSync(join(root, e)));
  if (missing.length) {
    console.error(`Cannot pack, missing: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (spawnSync("zip", ["-v"], { stdio: "ignore" }).error) {
    console.error("The `zip` command was not found. Install it (macOS and most Linux distros ship it) and try again.");
    process.exit(1);
  }
  try {
    buildZip(root, out);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  console.log(out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
