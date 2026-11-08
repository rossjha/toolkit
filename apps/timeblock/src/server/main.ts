import { assertNodeVersion } from "./nodeVersion.ts";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

assertNodeVersion(); // first statement: a clear message instead of an obscure failure on old Node

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const daysDir = path.resolve(process.env.TIMEBLOCK_DIR ?? path.join(root, "days"));
const settingsFile = path.resolve(process.env.TIMEBLOCK_SETTINGS ?? path.join(os.homedir(), ".config", "tools", "timeblock.md"));
const port = Number(process.env.PORT ?? 4318);
const host = process.env.HOST || "127.0.0.1"; // the Docker image sets 0.0.0.0; compose publishes it on 127.0.0.1 only

function openUrl(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

fs.mkdirSync(daysDir, { recursive: true });
const app = createApp({ daysDir, publicDir: path.join(root, "public"), settingsFile });
const server = http.createServer(app.handle);
server.listen(port, host, () => {
  const url = `http://timeblock.localhost:${port}`;
  console.log(`timeblock on ${url} — day files in ${daysDir}`);
  if (process.env.OPEN_BROWSER !== "false") openUrl(url);
});
process.on("SIGINT", () => {
  app.close();
  server.close();
  process.exit(0);
});
