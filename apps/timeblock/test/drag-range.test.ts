import assert from "node:assert/strict";
import { test } from "node:test";
import { dragRange } from "../src/web/drag-range.ts";

const t = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

test("move keeps the length and snaps the start to 5 minutes", () => {
  assert.deepEqual(dragRange("move", t("09:30"), t("11:00"), 15), { start: t("09:45"), end: t("11:15") });
  assert.deepEqual(dragRange("move", t("09:30"), t("11:00"), 13.4), { start: t("09:45"), end: t("11:15") });
  assert.deepEqual(dragRange("move", t("09:30"), t("11:00"), -7.6), { start: t("09:20"), end: t("10:50") });
});

test("a small wobble snaps back to where the block started", () => {
  assert.deepEqual(dragRange("move", t("09:30"), t("10:00"), 2.4), { start: t("09:30"), end: t("10:00") });
  assert.deepEqual(dragRange("resize", t("09:30"), t("10:00"), -2.4), { start: t("09:30"), end: t("10:00") });
});

test("an off-grid start lands on the 5-minute grid when moved", () => {
  assert.deepEqual(dragRange("move", t("09:02"), t("09:32"), 10), { start: t("09:10"), end: t("09:40") });
});

test("move is clamped to the day without shrinking the block", () => {
  assert.deepEqual(dragRange("move", t("00:30"), t("01:30"), -120), { start: 0, end: t("01:00") });
  assert.deepEqual(dragRange("move", t("23:00"), t("23:30"), 300), { start: t("23:30"), end: 24 * 60 });
});

test("resize moves only the end, snapped to 5 minutes", () => {
  assert.deepEqual(dragRange("resize", t("09:30"), t("10:00"), 17), { start: t("09:30"), end: t("10:15") });
  assert.deepEqual(dragRange("resize", t("09:30"), t("10:00"), -11), { start: t("09:30"), end: t("09:50") });
});

test("resize keeps at least 5 minutes and stops at midnight", () => {
  assert.deepEqual(dragRange("resize", t("09:30"), t("10:00"), -90), { start: t("09:30"), end: t("09:35") });
  assert.deepEqual(dragRange("resize", t("09:32"), t("10:00"), -90), { start: t("09:32"), end: t("09:37") });
  assert.deepEqual(dragRange("resize", t("23:00"), t("23:30"), 600), { start: t("23:00"), end: 24 * 60 });
});
