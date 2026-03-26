import type { RecurringPeriod, Session, Task } from "../types.js";
import { clampInterval, intervalToMinutes } from "../utils/time.js";
import {
  formatDayKey,
  formatWeekKey,
  getLogicalDayStartMs,
  getLogicalWeekStartMs,
  shiftLogicalDayStartMs,
  type WorkdayOptions
} from "./workday.js";

export interface RecurringProgress {
  period: RecurringPeriod;
  periodKey: string;
  periodStartMs: number;
  periodEndMs: number;
  targetMinutes: number;
  trackedMinutes: number;
  remainingMinutes: number;
  met: boolean;
}

export interface ClosedRecurringPeriodStatus {
  period: RecurringPeriod;
  periodKey: string;
  periodStartMs: number;
  periodEndMs: number;
  targetMinutes: number;
  trackedMinutes: number;
  missed: boolean;
}

function getPeriodWindow(
  period: RecurringPeriod,
  nowMs: number,
  options?: WorkdayOptions
): { key: string; startMs: number; endMs: number } {
  if (period === "daily") {
    const startMs = getLogicalDayStartMs(nowMs, options);
    return {
      key: formatDayKey(nowMs, options),
      startMs,
      endMs: shiftLogicalDayStartMs(startMs, 1, options)
    };
  }

  const startMs = getLogicalWeekStartMs(nowMs, options);
  return {
    key: formatWeekKey(nowMs, options),
    startMs,
    endMs: shiftLogicalDayStartMs(startMs, 7, options)
  };
}

function trackedMinutesInWindow(
  sessions: Session[],
  taskId: string,
  startMs: number,
  endMs: number
): number {
  let total = 0;
  for (const session of sessions) {
    if (session.taskId !== taskId) {
      continue;
    }

    const clamped = clampInterval(session.startMs, session.endMs, startMs, endMs);
    if (clamped === null) {
      continue;
    }

    total += intervalToMinutes(clamped.startMs, clamped.endMs);
  }
  return total;
}

export function evaluateRecurringProgress(
  task: Task,
  sessions: Session[],
  nowMs: number,
  options?: WorkdayOptions
): RecurringProgress | null {
  if (task.recurring === undefined || task.completedAtMs !== undefined) {
    return null;
  }

  const window = getPeriodWindow(task.recurring.period, nowMs, options);
  const trackedMinutes = trackedMinutesInWindow(sessions, task.id, window.startMs, window.endMs);
  const remainingMinutes = Math.max(0, task.recurring.targetMinutes - trackedMinutes);

  return {
    period: task.recurring.period,
    periodKey: window.key,
    periodStartMs: window.startMs,
    periodEndMs: window.endMs,
    targetMinutes: task.recurring.targetMinutes,
    trackedMinutes,
    remainingMinutes,
    met: trackedMinutes >= task.recurring.targetMinutes
  };
}

export function evaluateMostRecentlyClosedRecurringPeriod(
  task: Task,
  sessions: Session[],
  nowMs: number,
  options?: WorkdayOptions
): ClosedRecurringPeriodStatus | null {
  if (task.recurring === undefined || task.completedAtMs !== undefined) {
    return null;
  }

  const currentWindow = getPeriodWindow(task.recurring.period, nowMs, options);
  const periodStartMs =
    task.recurring.period === "daily"
      ? shiftLogicalDayStartMs(currentWindow.startMs, -1, options)
      : shiftLogicalDayStartMs(currentWindow.startMs, -7, options);
  const periodEndMs = currentWindow.startMs;

  if (task.createdAtMs >= periodEndMs) {
    return null;
  }

  const trackedMinutes = trackedMinutesInWindow(
    sessions,
    task.id,
    Math.max(task.createdAtMs, periodStartMs),
    periodEndMs
  );
  const periodKey =
    task.recurring.period === "daily"
      ? formatDayKey(periodStartMs, options)
      : formatWeekKey(periodStartMs, options);

  return {
    period: task.recurring.period,
    periodKey,
    periodStartMs,
    periodEndMs,
    targetMinutes: task.recurring.targetMinutes,
    trackedMinutes,
    missed: trackedMinutes < task.recurring.targetMinutes
  };
}
