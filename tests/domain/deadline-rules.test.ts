import { describe, expect, it } from "vitest";

import { getDeadlineStatus, isTaskOverdue } from "../../src/domain/deadline-rules.js";
import { createTimerState, startTimer, stopTimer } from "../../src/domain/timer-engine.js";
import type { Task } from "../../src/types.js";

describe("deadline rules", () => {
  it("uses strict greater-than comparison for overdue", () => {
    const dueAtMs = Date.parse("2026-03-10T12:00:00.000Z");
    const task: Task = {
      id: "t1",
      title: "File taxes",
      createdAtMs: dueAtMs - 10_000,
      deadline: { dueAtMs }
    };

    expect(isTaskOverdue(task, dueAtMs)).toBe(false);
    expect(isTaskOverdue(task, dueAtMs + 1)).toBe(true);
    expect(getDeadlineStatus(task, dueAtMs)).toBe("pending");
    expect(getDeadlineStatus(task, dueAtMs + 1)).toBe("overdue");
  });

  it("marks deadline tasks completed when completedAtMs exists", () => {
    const dueAtMs = Date.parse("2026-03-10T12:00:00.000Z");
    const task: Task = {
      id: "t1",
      title: "File taxes",
      createdAtMs: dueAtMs - 10_000,
      completedAtMs: dueAtMs + 60_000,
      deadline: { dueAtMs }
    };

    expect(isTaskOverdue(task, dueAtMs + 120_000)).toBe(false);
    expect(getDeadlineStatus(task, dueAtMs + 120_000)).toBe("completed");
  });

  it("does not block timer behavior even when task is overdue", () => {
    let counter = 0;
    const createSessionId = () => `s-${++counter}`;

    const nowMs = Date.parse("2026-03-10T12:10:00.000Z");
    const dueAtMs = Date.parse("2026-03-10T12:00:00.000Z");
    const overdueTask: Task = {
      id: "t-overdue",
      title: "Overdue but still trackable",
      createdAtMs: dueAtMs - 1,
      deadline: { dueAtMs }
    };

    expect(isTaskOverdue(overdueTask, nowMs)).toBe(true);

    let state = createTimerState();
    state = startTimer(state, overdueTask.id, nowMs, { createSessionId }).state;
    state = stopTimer(state, nowMs + 30 * 60 * 1000);

    expect(state.sessions).toEqual([
      {
        id: "s-1",
        taskId: overdueTask.id,
        startMs: nowMs,
        endMs: nowMs + 30 * 60 * 1000
      }
    ]);
  });
});
