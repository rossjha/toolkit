import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, parseDuration, typedDuration } from "../src/shared/duration.ts";

test("parseDuration reads minutes or mm:ss", () => {
  assert.equal(parseDuration("27"), 1620);
  assert.equal(parseDuration(" 27 "), 1620);
  assert.equal(parseDuration("27:30"), 1650);
  assert.equal(parseDuration("0"), 0);
  assert.equal(parseDuration("120"), 7200);
  assert.equal(parseDuration("120:00"), 7200);
});

test("parseDuration rejects junk", () => {
  for (const bad of ["", "abc", "5:75", "1:2", "-5", "27:", ":30", "1000"]) assert.equal(parseDuration(bad), null, bad);
});

test("formatClock pads, rounds up and never goes negative", () => {
  assert.equal(formatClock(1650), "27:30");
  assert.equal(formatClock(59.4), "01:00"); // countdowns round up: 00:00 only when time is really up
  assert.equal(formatClock(0.2), "00:01");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(-12), "00:00");
  assert.equal(formatClock(6000), "100:00");
});

test("typedDuration ignores an untouched input", () => {
  assert.equal(typedDuration("12:34", "12:34"), null);
  assert.equal(typedDuration(" 12:34 ", "12:34"), null);
  assert.equal(typedDuration("27", "12:34"), 1620);
  assert.equal(typedDuration("abc", "12:34"), null);
});
