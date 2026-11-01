import fsp from "node:fs/promises";
import path from "node:path";
import { conflictPath } from "./config.ts";

/** Write to a temp file then rename, so Obsidian or a skill never sees half a file. */
async function writeAtomic(file: string, text: string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, text, "utf8");
  await fsp.rename(tmp, file);
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fsp.readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** The scratchpad's text; a missing file (or folder) is created empty. */
export async function readNotes(file: string): Promise<string> {
  const text = await readIfExists(file);
  if (text !== null) return text;
  await writeAtomic(file, "");
  return "";
}

/**
 * Saves the page's text. `base` is what the page last knew the file held: if the file has
 * changed since, to something other than what we're saving, that version is kept in the
 * conflict file first, so nothing is lost silently.
 */
export async function saveNotes(file: string, text: string, base: string): Promise<{ conflictFile: string | null }> {
  const current = (await readIfExists(file)) ?? "";
  let conflictFile: string | null = null;
  if (current !== base && current !== text) {
    conflictFile = conflictPath(file);
    await writeAtomic(conflictFile, current);
  }
  await writeAtomic(file, text);
  return { conflictFile };
}
