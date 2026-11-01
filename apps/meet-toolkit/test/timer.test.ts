import { test } from "node:test";
import assert from "node:assert/strict";
import { adjust, initialTimer, isRunning, remaining, reset, setRemaining, start, stop } from "../src/shared/timer.ts";

test("counts down from the end time", () => {
  assert.equal(remaining(start(initialTimer(1800), 0), 600_000), 1200);
});

test("survives sleep: remaining comes from the clock, not ticks", () => {
  const t = start(initialTimer(60), 0);
  assert.equal(remaining(t, 3_600_000), 0);
  assert.equal(isRunning(t, 3_600_000), false);
});

test("stop then start resumes where it left off", () => {
  const stopped = stop(start(initialTimer(1800), 0), 10_000);
  assert.equal(remaining(stopped, 40_000), 1790);
  assert.equal(remaining(start(stopped, 50_000), 60_000), 1780);
});

test("adjust while running moves the end time", () => {
  assert.equal(remaining(adjust(start(initialTimer(600), 0), 300, 0), 0), 900);
});

test("adjust never goes below zero", () => {
  assert.equal(remaining(adjust(initialTimer(120), -300, 0), 0), 0);
});

test("adding time after time's up resumes the countdown", () => {
  const expired = start(initialTimer(60), 0);
  const t = adjust(expired, 300, 120_000);
  assert.equal(remaining(t, 120_000), 300);
  assert.equal(isRunning(t, 120_000), true);
});

test("setRemaining on a stopped timer also sets the duration", () => {
  const t = setRemaining(initialTimer(1800), 1620, 0);
  assert.equal(t.durationS, 1620);
  assert.equal(remaining(t, 0), 1620);
});

test("setRemaining on a running timer leaves the duration", () => {
  const t = setRemaining(start(initialTimer(1800), 0), 1620, 0);
  assert.equal(t.durationS, 1800);
  assert.equal(remaining(t, 0), 1620);
  assert.equal(isRunning(t, 0), true);
});

test("start does nothing at zero", () => {
  const t = initialTimer(0);
  assert.deepEqual(start(t, 0), t);
});

test("reset stops and restores the duration", () => {
  const t = reset(start(initialTimer(1800), 0));
  assert.equal(t.endAt, null);
  assert.equal(t.remainingS, 1800);
});
