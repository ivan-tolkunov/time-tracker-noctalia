import { MINUTE_MS } from "../utils/time.js";

export interface WorkdayOptions {
  boundaryMinuteOfDay?: number;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TimeSegment {
  startMs: number;
  endMs: number;
  dayKey: string;
  weekKey: string;
  minutes: number;
}

function getBoundaryMinuteOfDay(options?: WorkdayOptions): number {
  return options?.boundaryMinuteOfDay ?? 0;
}

function getWeekStartsOn(options?: WorkdayOptions): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return options?.weekStartsOn ?? 1;
}

function getBoundaryTimeParts(boundaryMinuteOfDay: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(boundaryMinuteOfDay / 60),
    minutes: boundaryMinuteOfDay % 60
  };
}

function getBoundaryStartMsForLocalDate(
  year: number,
  monthIndex: number,
  dayOfMonth: number,
  boundaryMinuteOfDay: number
): number {
  const boundaryTime = getBoundaryTimeParts(boundaryMinuteOfDay);
  return new Date(
    year,
    monthIndex,
    dayOfMonth,
    boundaryTime.hours,
    boundaryTime.minutes,
    0,
    0
  ).getTime();
}

function getLocalDateParts(timestampMs: number): { year: number; monthIndex: number; dayOfMonth: number } {
  const date = new Date(timestampMs);
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    dayOfMonth: date.getDate()
  };
}

export function shiftLogicalDayStartMs(
  logicalDayStartMs: number,
  dayOffset: number,
  options?: WorkdayOptions
): number {
  const boundaryMinuteOfDay = getBoundaryMinuteOfDay(options);
  const parts = getLocalDateParts(logicalDayStartMs);
  return getBoundaryStartMsForLocalDate(
    parts.year,
    parts.monthIndex,
    parts.dayOfMonth + dayOffset,
    boundaryMinuteOfDay
  );
}

export function getLogicalDayStartMs(
  timestampMs: number,
  options?: WorkdayOptions
): number {
  const boundaryMinuteOfDay = getBoundaryMinuteOfDay(options);
  const parts = getLocalDateParts(timestampMs);
  const candidateStartMs = getBoundaryStartMsForLocalDate(
    parts.year,
    parts.monthIndex,
    parts.dayOfMonth,
    boundaryMinuteOfDay
  );

  if (timestampMs >= candidateStartMs) {
    return candidateStartMs;
  }

  return getBoundaryStartMsForLocalDate(
    parts.year,
    parts.monthIndex,
    parts.dayOfMonth - 1,
    boundaryMinuteOfDay
  );
}

export function getNextLogicalDayStartMs(
  timestampMs: number,
  options?: WorkdayOptions
): number {
  const logicalDayStartMs = getLogicalDayStartMs(timestampMs, options);
  return shiftLogicalDayStartMs(logicalDayStartMs, 1, options);
}

export function formatDayKey(timestampMs: number, options?: WorkdayOptions): string {
  const logicalDayStartMs = getLogicalDayStartMs(timestampMs, options);
  const dayDate = new Date(logicalDayStartMs);
  const year = String(dayDate.getFullYear());
  const month = String(dayDate.getMonth() + 1).padStart(2, "0");
  const day = String(dayDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLogicalWeekStartMs(
  timestampMs: number,
  options?: WorkdayOptions
): number {
  const logicalDayStartMs = getLogicalDayStartMs(timestampMs, options);
  const weekStartsOn = getWeekStartsOn(options);
  const logicalDate = new Date(logicalDayStartMs);
  const dayOfWeek = logicalDate.getDay();
  const daysSinceWeekStart = (dayOfWeek - weekStartsOn + 7) % 7;
  return shiftLogicalDayStartMs(logicalDayStartMs, -daysSinceWeekStart, options);
}

export function formatWeekKey(timestampMs: number, options?: WorkdayOptions): string {
  return formatDayKey(getLogicalWeekStartMs(timestampMs, options), options);
}

export function splitIntervalByWorkday(
  startMs: number,
  endMs: number,
  options?: WorkdayOptions
): TimeSegment[] {
  if (endMs <= startMs) {
    return [];
  }

  const segments: TimeSegment[] = [];
  let cursorMs = startMs;

  while (cursorMs < endMs) {
    const dayStartMs = getLogicalDayStartMs(cursorMs, options);
    const nextDayStartMs = shiftLogicalDayStartMs(dayStartMs, 1, options);
    const segmentEndMs = Math.min(endMs, nextDayStartMs);
    const minutes = Math.floor((segmentEndMs - cursorMs) / MINUTE_MS);

    segments.push({
      startMs: cursorMs,
      endMs: segmentEndMs,
      dayKey: formatDayKey(cursorMs, options),
      weekKey: formatWeekKey(cursorMs, options),
      minutes
    });

    cursorMs = segmentEndMs;
  }

  return segments;
}

export function bucketIntervalMinutesByDay(
  startMs: number,
  endMs: number,
  options?: WorkdayOptions
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const segment of splitIntervalByWorkday(startMs, endMs, options)) {
    totals[segment.dayKey] = (totals[segment.dayKey] ?? 0) + segment.minutes;
  }
  return totals;
}

export function bucketIntervalMinutesByWeek(
  startMs: number,
  endMs: number,
  options?: WorkdayOptions
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const segment of splitIntervalByWorkday(startMs, endMs, options)) {
    totals[segment.weekKey] = (totals[segment.weekKey] ?? 0) + segment.minutes;
  }
  return totals;
}
