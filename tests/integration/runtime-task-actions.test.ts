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
      title: "  Plan sprint  "
    });

    expect(result).toMatchObject({
      created: true,
      reason: null,
      task: {
        id: "task-created",
        title: "Plan sprint",
        createdAtMs: nowMs
      }
    });
    expect(runtime.listTasks()).toHaveLength(1);
  });

  it("updates existing task title", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          {
            id: "task-a",
            title: "Old title",
            createdAtMs: nowMs
          }
        ],
        sessions: [],
        activeTimer: null,
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000
        }
      },
      {
        createTaskId: () => "unused",
        createSessionId: () => "unused",
        now: () => nowMs
      }
    );

    const rename = runtime.updateTask("task-a", {
      title: "  New title  "
    });

    expect(rename.updated).toBe(true);
    expect(rename.reason).toBeNull();
    expect(rename.task).toMatchObject({
      title: "New title"
    });
  });

  it("returns useful validation and no-op errors for create/update", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [{ id: "task-a", title: "Task A", createdAtMs: nowMs }],
        sessions: [],
        activeTimer: null,
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000
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
  });

  it("updates runtime preferences without disturbing tracked tasks", () => {
    const nowMs = Date.parse("2026-03-25T08:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [{ id: "task-a", title: "Task A", createdAtMs: nowMs }],
        sessions: [],
        activeTimer: null,
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000
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
      refreshIntervalMs: 45_000
    });

    expect(updatedPreferences).toEqual({
      boundaryMinuteOfDay: 240,
      weekStartsOn: 0,
      refreshIntervalMs: 45_000
    });
    expect(runtime.getPreferences()).toEqual(updatedPreferences);
    expect(runtime.listTasks()).toEqual([{ id: "task-a", title: "Task A", createdAtMs: nowMs }]);
  });
});
