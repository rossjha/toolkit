// Settings: your time zones and copyable snippets, kept outside the repo in ~/.config/tools/timeblock.md.
//
//   ## Time zones
//   - UK: Europe/London
//   - New York: America/New_York (IC)
//
//   ## Snippets
//   ### Status update
//   Any text, copied exactly as written.
//
// Parsing is forgiving, like categories: a line we can't read becomes a warning and is skipped.

export interface Zone {
  name: string;
  /** An IANA time zone, e.g. "America/New_York". */
  tz: string;
  /** The zone you work to as incident commander; highlighted. */
  ic: boolean;
}

export interface Snippet {
  name: string;
  text: string;
}

export interface Settings {
  zones: Zone[];
  snippets: Snippet[];
  warnings: string[];
}

const ZONE_LINE = /^\s*[-*]\s+(.+?)\s*:\s*(\S+)\s*(\(IC\))?\s*$/i;

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseSettings(text: string): Settings {
  const zones: Zone[] = [];
  const snippets: Snippet[] = [];
  const warnings: string[] = [];
  let section: "zones" | "snippets" | null = null;
  let snippet: { name: string; lines: string[] } | null = null;

  const endSnippet = (): void => {
    if (!snippet) return;
    const lines = snippet.lines;
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length) snippets.push({ name: snippet.name, text: lines.join("\n") });
    snippet = null;
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const h2 = /^##\s+(.*?)\s*$/.exec(raw);
    if (h2) {
      endSnippet();
      const title = h2[1].toLowerCase();
      section = title === "time zones" ? "zones" : title === "snippets" ? "snippets" : null;
      return;
    }
    if (section === "snippets") {
      const h3 = /^###\s+(.*?)\s*$/.exec(raw);
      if (h3) {
        endSnippet();
        snippet = { name: h3[1], lines: [] };
      } else if (snippet) snippet.lines.push(raw);
      return;
    }
    if (section !== "zones" || !/^\s*[-*]\s/.test(raw)) return; // prose under the heading is ignored
    const n = i + 1;
    const m = ZONE_LINE.exec(raw);
    if (!m) {
      warnings.push(`Line ${n}: can't read "${raw.trim()}" (expected "- Name: Area/City")`);
      return;
    }
    if (!isTimeZone(m[2])) {
      warnings.push(`Line ${n}: unknown time zone "${m[2]}" (use a name like America/New_York)`);
      return;
    }
    zones.push({ name: m[1], tz: m[2], ic: Boolean(m[3]) });
  });
  endSnippet();
  return { zones, snippets, warnings: warnings.map((w) => `timeblock.md: ${w}`) };
}

// ---------- time zone maths ----------

function parts(ms: number, tz: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return Object.fromEntries(fmt.formatToParts(ms).map((p) => [p.type, p.value]));
}

/** The instant when the clocks in `tz` show `minutes` past midnight on `date` (YYYY-MM-DD). */
export function zonedInstant(date: string, minutes: number, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const wanted = Date.UTC(y, mo - 1, d, 0, minutes);
  // Guess, see what the zone's clock says then, and correct by the difference; twice covers a clock change in between.
  let ms = wanted;
  for (let i = 0; i < 2; i++) {
    const p = parts(ms, tz);
    ms += wanted - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return ms;
}

/** "HH:MM" on the clock in `tz`. */
export function clockIn(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.hour}:${p.minute}`;
}

/** YYYY-MM-DD on the calendar in `tz`. */
export function dateIn(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The offset from GMT, e.g. "GMT", "GMT+1", "GMT−5", "GMT+5:30". */
export function gmtOffset(ms: number, tz: string): string {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return name === "GMT+0" ? "GMT" : name.replace("-", "−"); // some browsers write GMT itself as "GMT+0"
}

/** "next day", "previous day" or "" for the day `tz` is on compared with `date`. */
export function dayShift(ms: number, tz: string, date: string): string {
  const d = dateIn(ms, tz);
  return d === date ? "" : d > date ? "next day" : "previous day";
}
