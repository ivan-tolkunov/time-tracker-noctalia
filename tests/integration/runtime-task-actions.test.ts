import { describe, expect, it } from "vitest";

import { PluginRuntime } from "../../src/runtime/index.js";

describe("plugin runtime task actions", () => {
  it("creates a task with validated normalized fields", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.createEmpty({
      createTaskId: () => "task-created",
      createSessionId: () => "session-1",
      now: () => nowMs
    });

    const result = runtime.createTask({
      title: "  Plan sprint  ",
      deadline: { dueAtMs: Date.parse("2026-03-30T09:00:00.000Z") },
      recurring: { period: "weekly", targetMinutes: 120 }
    });

    expect(result).toMatchObject({
      created: true,
      reason: null,
      task: {
        id: "task-created",
        title: "Plan sprint",
        createdAtMs: nowMs,
        deadline: { dueAtMs: Date.parse("2026-03-30T09:00:00.000Z") },
        recurring: { period: "weekly", targetMinutes: 120 }
      }
    });
    expect(runtime.listTasks()).toHaveLength(1);
  });

  it("updates existing task fields and supports clearing deadline/recurring", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          {
            id: "task-a",
            title: "Old title",
            createdAtMs: nowMs,
            deadline: { dueAtMs: Date.parse("2026-03-28T09:00:00.000Z") },
            recurring: { period: "daily", targetMinutes: 60 }
          }
        ],
        sessions: [],
        activeTimer: null,
        alertRecords: [],
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000,
          alertCheckIntervalMs: 60_000
        }
      },
      {
        createTaskId: () => "unused",
        createSessionId: () => "unused",
        now: () => nowMs
      }
    );

    const rename = runtime.updateTask("task-a", {
      title: "  New title  ",
      deadline: { dueAtMs: Date.parse("2026-03-29T10:00:00.000Z") },
      recurring: { period: "weekly", targetMinutes: 90 }
    });
    const clearRules = runtime.updateTask("task-a", {
      deadline: null,
      recurring: null
    });

    expect(rename.updated).toBe(true);
    expect(rename.reason).toBeNull();
    expect(rename.task).toMatchObject({
      title: "New title",
      deadline: { dueAtMs: Date.parse("2026-03-29T10:00:00.000Z") },
      recurring: { period: "weekly", targetMinutes: 90 }
    });

    expect(clearRules.updated).toBe(true);
    expect(clearRules.reason).toBeNull();
    expect(clearRules.task).toMatchObject({
      id: "task-a",
      title: "New title"
    });
    expect(clearRules.task?.deadline).toBeUndefined();
    expect(clearRules.task?.recurring).toBeUndefined();
  });

  it("returns useful validation and no-op errors for create/update", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [{ id: "task-a", title: "Task A", createdAtMs: nowMs }],
        sessions: [],
        activeTimer: null,
        alertRecords: [],
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000,
          alertCheckIntervalMs: 60_000
        }
      },
      {
        createTaskId: () => "task-a",
        createSessionId: () => "session-1",
        now: () => nowMs
      }
    );

    expect(runtime.createTask({ title: "   " }).reason).toBe("empty-title");
    expect(runtime.createTask({ title: "Task B" }).reason).toBe("id-collision");
    expect(runtime.updateTask("missing", { title: "X" }).reason).toBe("not-found");
    expect(runtime.updateTask("task-a", { title: "Task A" }).reason).toBe("no-changes");
    expect(runtime.updateTask("task-a", { recurring: { period: "daily", targetMinutes: 0 } }).reason).toBe(
      "invalid-recurring"
    );
  });

  it("updates runtime preferences without disturbing tracked tasks", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [{ id: "task-a", title: "Task A", createdAtMs: nowMs }],
        sessions: [],
        activeTimer: null,
        alertRecords: [],
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000,
          alertCheckIntervalMs: 60_000
        }
      },
      {
        createTaskId: () => "unused-task",
        createSessionId: () => "unused-session",
        now: () => nowMs
      }
    );

    const updatedPreferences = runtime.updatePreferences({
      boundaryMinuteOfDay: 240,
      weekStartsOn: 0,
      refreshIntervalMs: 45_000,
      alertCheckIntervalMs: 90_000
    });

    expect(updatedPreferences).toEqual({
      boundaryMinuteOfDay: 240,
      weekStartsOn: 0,
      refreshIntervalMs: 45_000,
      alertCheckIntervalMs: 90_000
    });
    expect(runtime.getPreferences()).toEqual(updatedPreferences);
    expect(runtime.listTasks()).toEqual([{ id: "task-a", title: "Task A", createdAtMs: nowMs }]);
  });
});
