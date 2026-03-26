import { describe, expect, it } from "vitest";

import {
  DEFAULT_RUNTIME_PREFERENCES,
  createDefaultPersistedState,
  normalizeRuntimePreferences,
  normalizePersistedState,
  parsePersistedState
} from "../../src/runtime/persistence.js";

describe("runtime persistence", () => {
  it("normalizes malformed persisted state into safe typed shape", () => {
    const nowMs = Date.parse("2026-03-20T12:00:00.000Z");

    const normalized = normalizePersistedState(
      {
        tasks: [
          {
            id: "task-a",
            title: "  Deep work  ",
            createdAtMs: Date.parse("2026-03-10T08:00:00.000Z")
          },
          {
            id: "task-a",
            title: "duplicate id",
            createdAtMs: 1
          },
          {
            id: "bad-task",
            title: "",
            createdAtMs: "oops"
          }
        ],
        sessions: [
          {
            id: "s-good",
            taskId: "task-a",
            startMs: Date.parse("2026-03-10T08:00:00.000Z"),
            endMs: Date.parse("2026-03-10T09:00:00.000Z")
          },
          {
            id: "s-invalid",
            taskId: "task-a",
            startMs: 100,
            endMs: 100
          },
          {
            id: "s-unknown-task",
            taskId: "task-missing",
            startMs: 1,
            endMs: 2
          }
        ],
        activeTimer: {
          sessionId: "active-1",
          taskId: "task-missing",
          startMs: Date.parse("2026-03-20T10:00:00.000Z")
        },
        preferences: {
          boundaryMinuteOfDay: -10,
          weekStartsOn: 10,
          refreshIntervalMs: 999,
          legacyUnknownIntervalMs: "bad"
        }
      },
      nowMs
    );

    expect(normalized.version).toBe(1);
    expect(normalized.tasks).toEqual([
      {
        id: "task-a",
        title: "Deep work",
        createdAtMs: Date.parse("2026-03-10T08:00:00.000Z")
      }
    ]);
    expect(normalized.sessions).toEqual([
      {
        id: "s-good",
        taskId: "task-a",
        startMs: Date.parse("2026-03-10T08:00:00.000Z"),
        endMs: Date.parse("2026-03-10T09:00:00.000Z")
      }
    ]);
    expect(normalized.activeTimer).toBeNull();
    expect(normalized.preferences).toEqual(DEFAULT_RUNTIME_PREFERENCES);
  });

  it("falls back to default state for invalid JSON", () => {
    const parsed = parsePersistedState("{ not-valid", Date.parse("2026-03-20T12:00:00.000Z"));
    expect(parsed).toEqual(createDefaultPersistedState());
  });

  it("normalizes runtime preferences against a provided fallback profile", () => {
    expect(
      normalizeRuntimePreferences(
        {
          boundaryMinuteOfDay: 270,
          weekStartsOn: 9,
          refreshIntervalMs: 999,
          legacyUnknownIntervalMs: 15_000
        },
        {
          boundaryMinuteOfDay: 240,
          weekStartsOn: 2,
          refreshIntervalMs: 45_000
        }
      )
    ).toEqual({
      boundaryMinuteOfDay: 270,
      weekStartsOn: 2,
      refreshIntervalMs: 45_000
    });
  });

  it("clamps persisted active timer startMs to a safe non-negative range", () => {
    const nowMs = Date.parse("2026-03-20T12:00:00.000Z");
    const normalized = normalizePersistedState(
      {
        tasks: [{ id: "task-a", title: "Task A", createdAtMs: Date.parse("2026-03-19T08:00:00.000Z") }],
        sessions: [],
        activeTimer: {
          sessionId: "active-1",
          taskId: "task-a",
          startMs: -123_456
        },
        preferences: DEFAULT_RUNTIME_PREFERENCES
      },
      nowMs
    );

    expect(normalized.activeTimer).toEqual({
      sessionId: "active-1",
      taskId: "task-a",
      startMs: 0
    });
  });
});
