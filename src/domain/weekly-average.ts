import type { Session, TaskId } from "../types.js";
import { clampInterval, DAY_MS, intervalToMinutes } from "../utils/time.js";
import { getLogicalWeekStartMs, type WorkdayOptions } from "./workday.js";

export interface WeeklyAverageResult {
  totalTrackedMinutes: number;
  logicalWeekCount: number;
  averageMinutesPerWeek: number;
}

function calculateLogicalWeekCount(
  taskCreatedAtMs: number,
  nowMs: number,
  options?: WorkdayOptions
): number {
  const startWeekMs = getLogicalWeekStartMs(taskCreatedAtMs, options);
  const nowWeekMs = getLogicalWeekStartMs(nowMs, options);
  const startWeekDate = new Date(startWeekMs);
  const nowWeekDate = new Date(nowWeekMs);

  const startDayOrdinal = Math.floor(
    Date.UTC(startWeekDate.getFullYear(), startWeekDate.getMonth(), startWeekDate.getDate()) / DAY_MS
  );
  const nowDayOrdinal = Math.floor(
    Date.UTC(nowWeekDate.getFullYear(), nowWeekDate.getMonth(), nowWeekDate.getDate()) / DAY_MS
  );

  const dayDiff = nowDayOrdinal - startDayOrdinal;
  return Math.max(1, Math.floor(dayDiff / 7) + 1);
}

function calculateTrackedMinutes(
  sessions: Session[],
  taskId: TaskId,
  taskCreatedAtMs: number,
  nowMs: number
): number {
  let total = 0;

  for (const session of sessions) {
    if (session.taskId !== taskId) {
      continue;
    }

    const clamped = clampInterval(session.startMs, session.endMs, taskCreatedAtMs, nowMs);
    if (clamped === null) {
      continue;
    }

    total += intervalToMinutes(clamped.startMs, clamped.endMs);
  }

  return total;
}

export function calculateWeeklyAverageMinutes(
  sessions: Session[],
  taskId: TaskId,
  taskCreatedAtMs: number,
  nowMs: number,
  options?: WorkdayOptions
): WeeklyAverageResult {
  const totalTrackedMinutes = calculateTrackedMinutes(sessions, taskId, taskCreatedAtMs, nowMs);
  const logicalWeekCount = calculateLogicalWeekCount(taskCreatedAtMs, nowMs, options);

  return {
    totalTrackedMinutes,
    logicalWeekCount,
    averageMinutesPerWeek: totalTrackedMinutes / logicalWeekCount
  };
}
