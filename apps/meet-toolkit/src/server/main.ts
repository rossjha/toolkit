import { assertNodeVersion } from "./nodeVersion.ts";
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { readNotes } from "./notes.ts";

assertNodeVersion(); // first statement: a clear message instead of an obscure failure on old Node

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = loadConfig(process.env, os.homedir());

function openUrl(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

await readNotes(config.scratchpad); // creates the file and its folder before the watcher starts
const app = createApp({ scratchpad: config.scratchpad, publicDir: path.join(root, "public") });
const server = http.createServer(app.handle);
server.listen(config.port, config.host, () => {
  const url = `http://meet.localhost:${config.port}`;
  console.log(`meet-toolkit on ${url}, notes in ${config.scratchpad}`);
  if (config.openBrowser) openUrl(url);
});
const shutdown = (): void => {
  app.close();
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
