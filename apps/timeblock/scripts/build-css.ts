// Inlines the @import of themes.css so the browser gets one stylesheet (no Tailwind needed for an app this small).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "src", "web");
const css = fs
  .readFileSync(path.join(web, "styles.css"), "utf8")
  .replace(/@import "\.\/([\w.-]+)";/g, (_m, file: string) => fs.readFileSync(path.join(web, file), "utf8"));
fs.writeFileSync(path.join(root, "public", "app.css"), css);
