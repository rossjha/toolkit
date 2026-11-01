// Durations typed into the timer: "27" is 27 minutes, "27:30" is 27 minutes 30 seconds.

const DURATION = /^(\d{1,3})(?::([0-5]\d))?$/;

/** Seconds for "m", "mm", "mmm" or "m:ss" input; null when it isn't one of those. */
export function parseDuration(input: string): number | null {
  const m = DURATION.exec(input.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
}

/** "MM:SS", rounding up so the clock only reads 00:00 once time is really up. */
export function formatClock(seconds: number): string {
  const s = Math.ceil(Math.max(0, seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
