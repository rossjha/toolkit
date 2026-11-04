// The meeting countdown as plain data. Running time is an end timestamp, so a sleeping laptop or a
// throttled background tab never drifts: remaining time is always worked out from the clock.

export interface TimerState {
  durationS: number;
  remainingS: number; // used while stopped
  endAt: number | null; // epoch ms while running
}

export function initialTimer(durationS: number): TimerState {
  return { durationS, remainingS: durationS, endAt: null };
}

export function remaining(t: TimerState, now: number): number {
  return t.endAt === null ? Math.max(0, t.remainingS) : Math.max(0, (t.endAt - now) / 1000);
}

export function isRunning(t: TimerState, now: number): boolean {
  return t.endAt !== null && remaining(t, now) > 0;
}

export function start(t: TimerState, now: number): TimerState {
  const left = remaining(t, now);
  if (left <= 0) return t;
  return { ...t, remainingS: left, endAt: now + left * 1000 };
}

export function stop(t: TimerState, now: number): TimerState {
  return { ...t, remainingS: remaining(t, now), endAt: null };
}

/** Moves the remaining time by deltaS. Never starts the timer: a countdown that ran out counts as stopped. */
export function adjust(t: TimerState, deltaS: number, now: number): TimerState {
  const left = Math.max(0, remaining(t, now) + deltaS);
  return isRunning(t, now) ? { ...t, remainingS: left, endAt: now + left * 1000 } : { ...t, remainingS: left, endAt: null };
}

/** A typed time: on a stopped (or run-out) timer it becomes the new duration too; on a running one it only changes what's left. */
export function setRemaining(t: TimerState, s: number, now: number): TimerState {
  const left = Math.max(0, s);
  if (!isRunning(t, now)) return { durationS: left, remainingS: left, endAt: null };
  return { ...t, remainingS: left, endAt: now + left * 1000 };
}

export function reset(t: TimerState): TimerState {
  return initialTimer(t.durationS);
}
