import { describe, expect, it } from "vitest";

import {
  createTimerState,
  getTodayTrackedMinutesForTask,
  startTimer,
  stopTimer
} from "../../src/domain/timer-engine.js";

describe("timer-engine", () => {
  it("enforces a single active timer and switches by closing the previous session", () => {
    let idCounter = 0;
    const createSessionId = () => `s-${++idCounter}`;

    const t0 = Date.parse("2026-03-10T09:00:00.000Z");
    const t1 = Date.parse("2026-03-10T09:25:00.000Z");
    const t2 = Date.parse("2026-03-10T10:00:00.000Z");

    let state = createTimerState();
    state = startTimer(state, "task-a", t0, { createSessionId }).state;

    const switchResult = startTimer(state, "task-b", t1, { createSessionId });
    state = switchResult.state;

    expect(switchResult.switchedFromTaskId).toBe("task-a");
    expect(state.active?.taskId).toBe("task-b");
    expect(state.sessions).toEqual([
      {
        id: "s-1",
        taskId: "task-a",
        startMs: t0,
        endMs: t1
      }
    ]);

    state = stopTimer(state, t2);
    expect(state.active).toBeNull();
    expect(state.sessions).toEqual([
      { id: "s-1", taskId: "task-a", startMs: t0, endMs: t1 },
      { id: "s-2", taskId: "task-b", startMs: t1, endMs: t2 }
    ]);
  });

  it("does not open a second session when starting an already-active task", () => {
    let idCounter = 0;
    const createSessionId = () => `s-${++idCounter}`;
    const t0 = Date.parse("2026-03-10T09:00:00.000Z");
    const t1 = Date.parse("2026-03-10T09:05:00.000Z");

    const initial = startTimer(createTimerState(), "task-a", t0, { createSessionId }).state;
    const repeated = startTimer(initial, "task-a", t1, { createSessionId });

    expect(repeated.switchedFromTaskId).toBeNull();
    expect(repeated.state).toBe(initial);
    expect(repeated.state.sessions).toHaveLength(0);
    expect(repeated.state.active?.sessionId).toBe("s-1");
  });

  it("computes today's tracked minutes for active task only", () => {
    let idCounter = 0;
    const createSessionId = () => `s-${++idCounter}`;

    const nowMs = Date.parse("2026-03-10T11:00:00.000Z");
    const startA = Date.parse("2026-03-10T09:00:00.000Z");
    const startB = Date.parse("2026-03-10T10:00:00.000Z");

    let state = createTimerState();
    state = startTimer(state, "task-a", startA, { createSessionId }).state;
    state = startTimer(state, "task-b", startB, { createSessionId }).state;

    expect(getTodayTrackedMinutesForTask(state, "task-a", nowMs)).toBe(60);
    expect(getTodayTrackedMinutesForTask(state, "task-b", nowMs)).toBe(60);
  });
});
