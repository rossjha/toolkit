import fs from "node:fs";
import fsp from "node:fs/promises";
import type http from "node:http";
import path from "node:path";
import { readNotes, saveNotes } from "./notes.ts";

const DEBOUNCE_MS = 150;
const MAX_BODY = 1024 * 1024;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export interface AppOptions {
  scratchpad: string;
  publicDir: string;
}

class BadRequest extends Error {}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new BadRequest("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseSave(body: string): { text: string; base: string } {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new BadRequest("body must be JSON");
  }
  const { text, base } = (data ?? {}) as Record<string, unknown>;
  if (typeof text !== "string" || typeof base !== "string") throw new BadRequest("expected { text, base } strings");
  return { text, base };
}

export function createApp(opts: AppOptions): { handle: http.RequestListener; close: () => void } {
  const clients = new Set<http.ServerResponse>();
  const name = path.basename(opts.scratchpad);
  let timer: NodeJS.Timeout | undefined;

  // Watch the folder, not the file: atomic saves (ours, Obsidian's) replace the file, which a file watch loses.
  const watcher = fs.watch(path.dirname(opts.scratchpad), (_event, filename) => {
    if (filename?.toString() !== name) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const res of clients) res.write(`data: ${JSON.stringify({ type: "notes" })}\n\n`);
    }, DEBOUNCE_MS);
  });
  watcher.on("error", (e) => console.error("file watcher error:", e.message));
  const keepAlive = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 25_000);

  const handle: http.RequestListener = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (url.pathname === "/api/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (url.pathname === "/api/notes") {
        if (req.method === "GET") return send(200, { text: await readNotes(opts.scratchpad), path: opts.scratchpad });
        if (req.method === "PUT") {
          const { text, base } = parseSave(await readBody(req));
          return send(200, { ok: true, ...(await saveNotes(opts.scratchpad, text, base)) });
        }
        return send(405, { error: "method not allowed" });
      }

      if (req.method !== "GET") return send(404, { error: "not found" });
      const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(opts.publicDir, rel);
      if (!file.startsWith(opts.publicDir + path.sep)) return send(404, { error: "not found" });
      const body = await fsp.readFile(file).catch(() => null);
      if (!body) return send(404, { error: "not found" });
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(body);
    } catch (e) {
      if (e instanceof BadRequest) return send(400, { error: e.message });
      console.error(e);
      if (!res.headersSent) send(500, { error: (e as Error).message });
    }
  };

  return {
    handle,
    close: () => {
      watcher.close();
      clearInterval(keepAlive);
      clearTimeout(timer);
      for (const res of clients) res.end();
    },
  };
}
