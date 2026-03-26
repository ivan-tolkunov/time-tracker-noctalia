import { describe, expect, it } from "vitest";

import {
  evaluateMostRecentlyClosedRecurringPeriod,
  evaluateRecurringProgress
} from "../../src/domain/recurring-rules.js";
import type { Session, Task } from "../../src/types.js";

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

describe("recurring rules", () => {
  it("daily recurring target resets each period with no carry-over", () => {
    const task: Task = {
      id: "task-daily",
      title: "Daily writing",
      createdAtMs: localMs(2026, 3, 10, 0, 0),
      recurring: { period: "daily", targetMinutes: 60 }
    };

    const sessions: Session[] = [
      {
        id: "yesterday",
        taskId: task.id,
        startMs: localMs(2026, 3, 10, 1, 0),
        endMs: localMs(2026, 3, 10, 2, 30)
      }
    ];

    const nowMs = localMs(2026, 3, 11, 10, 0);
    const progress = evaluateRecurringProgress(task, sessions, nowMs);

    expect(progress).not.toBeNull();
    expect(progress?.trackedMinutes).toBe(0);
    expect(progress?.remainingMinutes).toBe(60);
    expect(progress?.met).toBe(false);
    expect(progress?.periodKey).toBe(localDateKey(2026, 3, 11));
  });

  it("clips daily progress to the current workday when session crosses boundary", () => {
    const task: Task = {
      id: "task-daily",
      title: "Daily writing",
      createdAtMs: localMs(2026, 3, 10, 0, 0),
      recurring: { period: "daily", targetMinutes: 90 }
    };

    const sessions: Session[] = [
      {
        id: "cross-day",
        taskId: task.id,
        startMs: localMs(2026, 3, 10, 3, 30),
        endMs: localMs(2026, 3, 10, 5, 0)
      }
    ];

    const options = { boundaryMinuteOfDay: 4 * 60 };
    const nowMs = localMs(2026, 3, 10, 12, 0);
    const progress = evaluateRecurringProgress(task, sessions, nowMs, options);

    expect(progress?.periodKey).toBe(localDateKey(2026, 3, 10));
    expect(progress?.trackedMinutes).toBe(60);
    expect(progress?.remainingMinutes).toBe(30);
  });

  it("weekly recurring target also resets by logical week with no carry-over", () => {
    const task: Task = {
      id: "task-weekly",
      title: "Weekly planning",
      createdAtMs: localMs(2026, 3, 1, 0, 0),
      recurring: { period: "weekly", targetMinutes: 120 }
    };

    const sessions: Session[] = [
      {
        id: "last-week",
        taskId: task.id,
        startMs: localMs(2026, 3, 9, 8, 0),
        endMs: localMs(2026, 3, 9, 11, 0)
      }
    ];

    const nowMs = localMs(2026, 3, 16, 10, 0);
    const progress = evaluateRecurringProgress(task, sessions, nowMs, { weekStartsOn: 1 });

    expect(progress?.period).toBe("weekly");
    expect(progress?.periodKey).toBe(localDateKey(2026, 3, 16));
    expect(progress?.trackedMinutes).toBe(0);
    expect(progress?.remainingMinutes).toBe(120);
    expect(progress?.met).toBe(false);
  });

  it("detects missed most-recently-closed daily period with stable key", () => {
    const options = { boundaryMinuteOfDay: 4 * 60 };
    const task: Task = {
      id: "task-daily-miss",
      title: "Daily deep work",
      createdAtMs: localMs(2026, 3, 9, 0, 0),
      recurring: { period: "daily", targetMinutes: 60 }
    };
    const sessions: Session[] = [
      {
        id: "closed-period-partial",
        taskId: task.id,
        startMs: localMs(2026, 3, 11, 10, 0),
        endMs: localMs(2026, 3, 11, 10, 30)
      }
    ];

    const nowMs = localMs(2026, 3, 12, 12, 0);
    const closed = evaluateMostRecentlyClosedRecurringPeriod(task, sessions, nowMs, options);

    expect(closed).not.toBeNull();
    expect(closed?.period).toBe("daily");
    expect(closed?.periodKey).toBe(localDateKey(2026, 3, 11));
    expect(closed?.trackedMinutes).toBe(30);
    expect(closed?.targetMinutes).toBe(60);
    expect(closed?.missed).toBe(true);
  });

  it("detects missed most-recently-closed weekly period with stable key", () => {
    const task: Task = {
      id: "task-weekly-miss",
      title: "Weekly strategy",
      createdAtMs: localMs(2026, 3, 1, 0, 0),
      recurring: { period: "weekly", targetMinutes: 120 }
    };
    const sessions: Session[] = [
      {
        id: "closed-week-partial",
        taskId: task.id,
        startMs: localMs(2026, 3, 10, 9, 0),
        endMs: localMs(2026, 3, 10, 10, 30)
      }
    ];

    const nowMs = localMs(2026, 3, 18, 12, 0);
    const closed = evaluateMostRecentlyClosedRecurringPeriod(task, sessions, nowMs, {
      weekStartsOn: 1
    });

    expect(closed).not.toBeNull();
    expect(closed?.period).toBe("weekly");
    expect(closed?.periodKey).toBe(localDateKey(2026, 3, 9));
    expect(closed?.trackedMinutes).toBe(90);
    expect(closed?.targetMinutes).toBe(120);
    expect(closed?.missed).toBe(true);
  });

  it("treats completed recurring tasks as terminal for progress and missed-period checks", () => {
    const task: Task = {
      id: "task-completed-recurring",
      title: "Completed recurring task",
      createdAtMs: localMs(2026, 3, 1, 0, 0),
      completedAtMs: localMs(2026, 3, 15, 8, 0),
      recurring: { period: "daily", targetMinutes: 60 }
    };
    const sessions: Session[] = [
      {
        id: "session-before-complete",
        taskId: task.id,
        startMs: localMs(2026, 3, 14, 9, 0),
        endMs: localMs(2026, 3, 14, 10, 0)
      }
    ];
    const nowMs = localMs(2026, 3, 16, 12, 0);

    expect(evaluateRecurringProgress(task, sessions, nowMs)).toBeNull();
    expect(evaluateMostRecentlyClosedRecurringPeriod(task, sessions, nowMs)).toBeNull();
  });
});
