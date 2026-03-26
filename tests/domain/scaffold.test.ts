import { describe, expect, it } from "vitest";

import {
  calculateWeeklyAverageMinutes,
  createTimerState,
  formatDayKey
} from "../../src/domain/index.js";

describe("domain exports", () => {
  it("exposes core domain functions from index", () => {
    const localMidday = new Date(2026, 2, 1, 12, 0, 0, 0).getTime();
    expect(createTimerState().active).toBeNull();
    expect(formatDayKey(localMidday)).toBe("2026-03-01");
    expect(calculateWeeklyAverageMinutes([], "task-1", localMidday, localMidday).averageMinutesPerWeek).toBe(0);
  });
});
