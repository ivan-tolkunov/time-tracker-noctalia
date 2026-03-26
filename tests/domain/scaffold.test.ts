import { describe, expect, it } from "vitest";

import {
  createTimerState,
  formatDayKey,
  getDeadlineStatus,
  makeAlertKey
} from "../../src/domain/index.js";

describe("domain exports", () => {
  it("exposes core domain functions from index", () => {
    const localMidday = new Date(2026, 2, 1, 12, 0, 0, 0).getTime();
    expect(createTimerState().active).toBeNull();
    expect(formatDayKey(localMidday)).toBe("2026-03-01");
    expect(getDeadlineStatus({ id: "t1", title: "T", createdAtMs: 1 }, 2)).toBe("none");
    expect(makeAlertKey("task-1", "event", "period")).toBe("task-1::event::period");
  });
});
