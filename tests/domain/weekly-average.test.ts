import { describe, expect, it } from "vitest";

import { calculateWeeklyAverageMinutes } from "../../src/domain/weekly-average.js";
import type { Session } from "../../src/types.js";

describe("weekly average", () => {
  it("uses all logical weeks since task creation, including current partial week", () => {
    const taskId = "task-1";
    const taskCreatedAtMs = Date.parse("2026-03-04T10:00:00.000Z");
    const nowMs = Date.parse("2026-03-19T10:00:00.000Z");

    const sessions: Session[] = [
      {
        id: "s1",
        taskId,
        startMs: Date.parse("2026-03-05T10:00:00.000Z"),
        endMs: Date.parse("2026-03-05T11:00:00.000Z")
      },
      {
        id: "s2",
        taskId,
        startMs: Date.parse("2026-03-10T10:00:00.000Z"),
        endMs: Date.parse("2026-03-10T11:00:00.000Z")
      },
      {
        id: "s3",
        taskId,
        startMs: Date.parse("2026-03-17T10:00:00.000Z"),
        endMs: Date.parse("2026-03-17T11:00:00.000Z")
      }
    ];

    const result = calculateWeeklyAverageMinutes(sessions, taskId, taskCreatedAtMs, nowMs, {
      weekStartsOn: 1
    });

    expect(result.totalTrackedMinutes).toBe(180);
    expect(result.logicalWeekCount).toBe(3);
    expect(result.averageMinutesPerWeek).toBe(60);
  });

  it("returns week count of one for newly created tasks", () => {
    const nowMs = Date.parse("2026-03-19T10:00:00.000Z");
    const result = calculateWeeklyAverageMinutes([], "task-1", nowMs - 1000, nowMs);

    expect(result.totalTrackedMinutes).toBe(0);
    expect(result.logicalWeekCount).toBe(1);
    expect(result.averageMinutesPerWeek).toBe(0);
  });
});
