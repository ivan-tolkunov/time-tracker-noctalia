export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

export function clampInterval(
  startMs: number,
  endMs: number,
  windowStartMs: number,
  windowEndMs: number
): { startMs: number; endMs: number } | null {
  const clampedStartMs = Math.max(startMs, windowStartMs);
  const clampedEndMs = Math.min(endMs, windowEndMs);

  if (clampedEndMs <= clampedStartMs) {
    return null;
  }

  return { startMs: clampedStartMs, endMs: clampedEndMs };
}

export function intervalToMinutes(startMs: number, endMs: number): number {
  if (endMs <= startMs) {
    return 0;
  }

  return Math.floor((endMs - startMs) / MINUTE_MS);
}
