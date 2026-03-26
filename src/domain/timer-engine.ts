import type { Session, SessionId, TaskId, TimerState } from "../types.js";
import { clampInterval, intervalToMinutes } from "../utils/time.js";
import {
  getLogicalDayStartMs,
  getNextLogicalDayStartMs,
  type WorkdayOptions
} from "./workday.js";

export interface TimerEngineOptions {
  createSessionId: () => SessionId;
}

export interface StartTimerResult {
  state: TimerState;
  switchedFromTaskId: TaskId | null;
}

function closeSession(active: NonNullable<TimerState["active"]>, endMs: number): Session {
  return {
    id: active.sessionId,
    taskId: active.taskId,
    startMs: active.startMs,
    endMs
  };
}

export function createTimerState(): TimerState {
  return { active: null, sessions: [] };
}

export function startTimer(
  state: TimerState,
  taskId: TaskId,
  nowMs: number,
  options: TimerEngineOptions
): StartTimerResult {
  if (state.active !== null && state.active.taskId === taskId) {
    return { state, switchedFromTaskId: null };
  }

  const nextSessions = [...state.sessions];
  let switchedFromTaskId: TaskId | null = null;

  if (state.active !== null) {
    nextSessions.push(closeSession(state.active, nowMs));
    switchedFromTaskId = state.active.taskId;
  }

  return {
    state: {
      active: {
        sessionId: options.createSessionId(),
        taskId,
        startMs: nowMs
      },
      sessions: nextSessions
    },
    switchedFromTaskId
  };
}

export function stopTimer(state: TimerState, nowMs: number): TimerState {
  if (state.active === null) {
    return state;
  }

  return {
    active: null,
    sessions: [...state.sessions, closeSession(state.active, nowMs)]
  };
}

export function getAllClosedSessions(state: TimerState, nowMs: number): Session[] {
  if (state.active === null) {
    return state.sessions;
  }

  return [...state.sessions, closeSession(state.active, nowMs)];
}

export function getTrackedMinutesForTaskInRange(
  state: TimerState,
  taskId: TaskId,
  rangeStartMs: number,
  rangeEndMs: number,
  nowMs: number
): number {
  const sessions = getAllClosedSessions(state, nowMs).filter((session) => session.taskId === taskId);

  let totalMinutes = 0;
  for (const session of sessions) {
    const clamped = clampInterval(session.startMs, session.endMs, rangeStartMs, rangeEndMs);
    if (clamped === null) {
      continue;
    }

    totalMinutes += intervalToMinutes(clamped.startMs, clamped.endMs);
  }

  return totalMinutes;
}

export function getTodayTrackedMinutesForTask(
  state: TimerState,
  taskId: TaskId,
  nowMs: number,
  workdayOptions?: WorkdayOptions
): number {
  const dayStartMs = getLogicalDayStartMs(nowMs, workdayOptions);
  const nextDayStartMs = getNextLogicalDayStartMs(nowMs, workdayOptions);
  return getTrackedMinutesForTaskInRange(
    state,
    taskId,
    dayStartMs,
    nextDayStartMs,
    nowMs
  );
}
