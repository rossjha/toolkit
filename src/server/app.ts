import fs from "node:fs";
import fsp from "node:fs/promises";
import type http from "node:http";
import path from "node:path";
import { emptyDay, isDate } from "../shared/day.ts";

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
  daysDir: string;
  publicDir: string;
}

/** Today in the machine's own time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const off = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - off).toISOString().slice(0, 10);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Write to a temp file then rename, so Claude or an editor never sees half a file. */
async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, text, "utf8");
  await fsp.rename(tmp, file);
}

export function createApp(opts: AppOptions): { handle: http.RequestListener; close: () => void } {
  const clients = new Set<http.ServerResponse>();
  const timers = new Map<string, NodeJS.Timeout>();
  const broadcast = (date: string): void => {
    for (const res of clients) res.write(`data: ${JSON.stringify({ type: "day", date })}\n\n`);
  };

  // Any change to days/<date>.md — from the UI, Claude or an editor — is pushed to open pages.
  const watcher = fs.watch(opts.daysDir, (_event, filename) => {
    const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(filename?.toString() ?? "");
    if (!m) return;
    const date = m[1];
    clearTimeout(timers.get(date));
    timers.set(date, setTimeout(() => (timers.delete(date), broadcast(date)), DEBOUNCE_MS));
  });
  watcher.on("error", (e) => console.error("file watcher error:", e.message));
  const keepAlive = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 25_000);

  const dayFile = (date: string): string => path.join(opts.daysDir, `${date}.md`);

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
      if (url.pathname === "/api/today") return send(200, { date: localToday() });

      const m = /^\/api\/day\/([^/]+)$/.exec(url.pathname);
      if (m) {
        const date = m[1];
        if (!isDate(date)) return send(400, { error: `not a date: ${date}` });
        if (req.method === "GET") {
          try {
            return send(200, { date, markdown: await fsp.readFile(dayFile(date), "utf8"), exists: true });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
          // Today's file is created on first look, so Claude always has a file to edit.
          if (date === localToday()) {
            await writeAtomic(dayFile(date), emptyDay(date));
            return send(200, { date, markdown: emptyDay(date), exists: true });
          }
          return send(200, { date, markdown: emptyDay(date), exists: false });
        }
        if (req.method === "PUT") {
          await writeAtomic(dayFile(date), await readBody(req));
          return send(200, { ok: true });
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
      console.error(e);
      if (!res.headersSent) send(500, { error: (e as Error).message });
    }
  };

  return {
    handle,
    close: () => {
      watcher.close();
      clearInterval(keepAlive);
      for (const t of timers.values()) clearTimeout(t);
      for (const res of clients) res.end();
    },
  };
}
