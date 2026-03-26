import { describe, expect, it } from "vitest";

import {
  bucketIntervalMinutesByWeek,
  formatDayKey,
  getLogicalDayStartMs,
  splitIntervalByWorkday
} from "../../src/domain/workday.js";

function localMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
}

function localDateKey(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

describe("workday math", () => {
  it("assigns timestamps before boundary to previous logical day", () => {
    const options = { boundaryMinuteOfDay: 4 * 60 };

    const beforeBoundary = localMs(2026, 3, 10, 3, 59, 59);
    const atBoundary = localMs(2026, 3, 10, 4, 0, 0);

    expect(formatDayKey(beforeBoundary, options)).toBe(localDateKey(2026, 3, 9));
    expect(formatDayKey(atBoundary, options)).toBe(localDateKey(2026, 3, 10));

    expect(getLogicalDayStartMs(atBoundary, options)).toBe(localMs(2026, 3, 10, 4, 0, 0));
  });

  it("splits intervals exactly at workday boundary", () => {
    const options = { boundaryMinuteOfDay: 4 * 60 };
    const startMs = localMs(2026, 3, 10, 3, 30, 0);
    const endMs = localMs(2026, 3, 10, 4, 30, 0);

    expect(splitIntervalByWorkday(startMs, endMs, options)).toEqual([
      {
        startMs,
        endMs: localMs(2026, 3, 10, 4, 0, 0),
        dayKey: localDateKey(2026, 3, 9),
        weekKey: localDateKey(2026, 3, 9),
        minutes: 30
      },
      {
        startMs: localMs(2026, 3, 10, 4, 0, 0),
        endMs,
        dayKey: localDateKey(2026, 3, 10),
        weekKey: localDateKey(2026, 3, 9),
        minutes: 30
      }
    ]);
  });

  it("buckets minutes by logical week across week rollover", () => {
    const options = { boundaryMinuteOfDay: 4 * 60, weekStartsOn: 1 as const };
    const startMs = localMs(2026, 3, 15, 3, 0, 0);
    const endMs = localMs(2026, 3, 16, 5, 0, 0);

    expect(bucketIntervalMinutesByWeek(startMs, endMs, options)).toEqual({
      [localDateKey(2026, 3, 9)]: 1500,
      [localDateKey(2026, 3, 16)]: 60
    });
  });
});
