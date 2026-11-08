import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { clockIn, dayShift, gmtOffset, parseSettings, zonedInstant } from "../src/shared/settings.ts";

const SAMPLE = `# Timeblock

Prose is ignored.

## Time zones

- UK: Europe/London
- New York: America/New_York (IC)
- Tokyo: Asia/Tokyo

## Snippets

### Status update
*Status update*

• *Summary:*
• *Next update:*

### Thanks
Thanks, all!

## Something else
- Ignored: Not/AZone
`;

test("parseSettings reads zones in order and marks the IC zone", () => {
  const s = parseSettings(SAMPLE);
  assert.deepEqual(s.zones, [
    { name: "UK", tz: "Europe/London", ic: false },
    { name: "New York", tz: "America/New_York", ic: true },
    { name: "Tokyo", tz: "Asia/Tokyo", ic: false },
  ]);
  assert.deepEqual(s.warnings, []);
});

test("parseSettings keeps snippet text exactly, minus blank lines at either end", () => {
  const s = parseSettings(SAMPLE);
  assert.deepEqual(s.snippets, [
    { name: "Status update", text: "*Status update*\n\n• *Summary:*\n• *Next update:*" },
    { name: "Thanks", text: "Thanks, all!" },
  ]);
});

test("parseSettings warns about unreadable lines and unknown zones, and skips them", () => {
  const s = parseSettings("## Time zones\n- UK: Europe/London\n- Mars: Olympus/Mons\n- just words\nSome prose.\n");
  assert.deepEqual(s.zones, [{ name: "UK", tz: "Europe/London", ic: false }]);
  assert.equal(s.warnings.length, 2);
  assert.match(s.warnings[0], /Line 3: unknown time zone "Olympus\/Mons"/);
  assert.match(s.warnings[1], /Line 4: can't read "- just words"/);
});

test("parseSettings drops empty snippets and handles an empty file", () => {
  assert.deepEqual(parseSettings("## Snippets\n### Empty\n\n### Real\nHi\n").snippets, [{ name: "Real", text: "Hi" }]);
  assert.deepEqual(parseSettings(""), { zones: [], snippets: [], warnings: [] });
});

test("the example config parses cleanly", () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "config.example.md");
  const s = parseSettings(fs.readFileSync(file, "utf8"));
  assert.deepEqual(s.warnings, []);
  assert.ok(s.zones.length > 1);
  assert.ok(s.snippets.length > 0);
});

test("zonedInstant and clockIn convert between zones in winter", () => {
  const ms = zonedInstant("2026-11-09", 15 * 60, "Europe/London");
  assert.equal(new Date(ms).toISOString(), "2026-11-09T15:00:00.000Z");
  assert.equal(clockIn(ms, "America/New_York"), "10:00");
  assert.equal(clockIn(ms, "America/Chicago"), "09:00");
  assert.equal(clockIn(ms, "Asia/Kathmandu"), "20:45");
});

test("conversions follow each zone's own clock changes", () => {
  // 2026-03-15: the US is on summer time, the UK isn't yet, so New York is only four hours behind.
  const gap = zonedInstant("2026-03-15", 15 * 60, "Europe/London");
  assert.equal(clockIn(gap, "America/New_York"), "11:00");
  assert.equal(gmtOffset(gap, "Europe/London"), "GMT");
  // In July both are on summer time.
  const summer = zonedInstant("2026-07-01", 15 * 60, "Europe/London");
  assert.equal(new Date(summer).toISOString(), "2026-07-01T14:00:00.000Z");
  assert.equal(clockIn(summer, "America/New_York"), "10:00");
});

test("gmtOffset names the offset, including half hours", () => {
  const winter = Date.UTC(2026, 10, 9, 12);
  const summer = Date.UTC(2026, 6, 1, 12);
  assert.equal(gmtOffset(winter, "Europe/London"), "GMT");
  assert.equal(gmtOffset(summer, "Europe/London"), "GMT+1");
  assert.equal(gmtOffset(winter, "America/New_York"), "GMT−5");
  assert.equal(gmtOffset(winter, "Asia/Kathmandu"), "GMT+5:45");
});

test("dayShift flags times on another calendar day", () => {
  const late = zonedInstant("2026-11-09", 22 * 60, "Europe/London");
  assert.equal(dayShift(late, "Asia/Tokyo", "2026-11-09"), "next day");
  assert.equal(dayShift(late, "America/New_York", "2026-11-09"), "");
  const early = zonedInstant("2026-11-09", 2 * 60, "Europe/London");
  assert.equal(dayShift(early, "America/Chicago", "2026-11-09"), "previous day");
});
