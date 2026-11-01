import path from "node:path";

export interface Config {
  scratchpad: string;
  port: number;
  host: string;
  openBrowser: boolean;
}

const DEFAULT_SCRATCHPAD = "~/meet-toolkit/meet-toolkit-scratchpad.md";

export function loadConfig(env: NodeJS.ProcessEnv, home: string): Config {
  const raw = env.MEET_SCRATCHPAD || DEFAULT_SCRATCHPAD;
  const expanded = raw === "~" || raw.startsWith("~/") ? path.join(home, raw.slice(1)) : raw;
  return {
    scratchpad: path.resolve(expanded),
    port: Number(env.PORT ?? 4319),
    host: env.HOST || "127.0.0.1",
    openBrowser: env.OPEN_BROWSER !== "false",
  };
}

/** Where the other side of a save clash is kept: n.md → n.conflict.md, next to it. */
export function conflictPath(scratchpad: string): string {
  const { dir, name, ext } = path.parse(scratchpad);
  return path.join(dir, `${ext === ".md" ? name : name + ext}.conflict.md`);
}
