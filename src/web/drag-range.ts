// The time range a block drag lands on: pure arithmetic, kept out of drag.ts so it can be tested without a DOM.

export type DragMode = "move" | "resize";

const SNAP = 5;
const MIN_LENGTH = 5;
const DAY_END = 24 * 60;

const snap = (minutes: number): number => Math.round(minutes / SNAP) * SNAP;

/**
 * Where a block from `start`–`end` ends up after dragging it `deltaMinutes` (fractional, straight from pixels).
 * Move keeps the length and snaps the start; resize snaps the end and keeps at least 5 minutes. Both stay inside 00:00–24:00.
 */
export function dragRange(mode: DragMode, start: number, end: number, deltaMinutes: number): { start: number; end: number } {
  if (mode === "resize") {
    const e = Math.min(DAY_END, Math.max(start + MIN_LENGTH, snap(end + deltaMinutes)));
    return { start, end: e };
  }
  const length = end - start;
  const s = Math.min(DAY_END - length, Math.max(0, snap(start + deltaMinutes)));
  return { start: s, end: s + length };
}
