import { describe, expect, it } from "vitest";

import { PluginRuntime, type PluginSettingsStorage } from "../../src/runtime/index.js";

class MemorySettingsStorage implements PluginSettingsStorage {
  private readonly values = new Map<string, string>();

  read(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("plugin runtime reload", () => {
  it("recovers an active timer from persisted state and closes it safely", () => {
    const t0 = Date.parse("2026-03-21T09:00:00.000Z");
    const nowMs = Date.parse("2026-03-21T09:45:00.000Z");

    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [{ id: "task-a", title: "Focus", createdAtMs: t0 - 86_400_000 }],
        sessions: [],
        activeTimer: { sessionId: "active-1", taskId: "task-a", startMs: t0 },
        alertRecords: [],
        preferences: {
          boundaryMinuteOfDay: 0,
          weekStartsOn: 1,
          refreshIntervalMs: 30_000,
          alertCheckIntervalMs: 60_000
        }
      },
      {
        createSessionId: () => "generated-id",
        now: () => nowMs
      }
    );

    const active = runtime.getActiveTaskState(nowMs);
    expect(active.task?.id).toBe("task-a");
    expect(active.timer?.sessionId).toBe("active-1");
    expect(active.elapsedMinutes).toBe(45);
    expect(runtime.getTodayTrackedMinutes("task-a", nowMs)).toBe(45);

    runtime.stopActiveTimer(nowMs);

    expect(runtime.getActiveTaskState(nowMs).task).toBeNull();
    expect(runtime.getSessions()).toEqual([
      {
        id: "active-1",
        taskId: "task-a",
        startMs: t0,
        endMs: nowMs
      }
    ]);
  });

  it("round-trips through storage with reload-safe state", () => {
    const storage = new MemorySettingsStorage();
    const storageKey = "plugin-state";

    const t0 = Date.parse("2026-03-22T10:00:00.000Z");
    const t1 = Date.parse("2026-03-22T11:00:00.000Z");

    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          {
            id: "task-a",
            title: "Write report",
            createdAtMs: Date.parse("2026-03-01T09:00:00.000Z"),
            deadline: { dueAtMs: Date.parse("2026-03-21T09:00:00.000Z") },
            recurring: { period: "weekly", targetMinutes: 120 }
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
        createSessionId: () => "generated-session",
        now: () => t1
      }
    );

    expect(runtime.startTask("task-a", t0).started).toBe(true);
    runtime.stopActiveTimer(t1);

    const firstCheck = runtime.runAlertCheck(t1);
    const secondCheck = runtime.runAlertCheck(t1);

    expect(firstCheck.map((event) => event.eventType).sort()).toEqual([
      "deadline-overdue",
      "recurring-missed"
    ]);
    expect(secondCheck).toEqual([]);

    runtime.save(storage, storageKey);

    const reloaded = PluginRuntime.load(storage, storageKey, {
      createSessionId: () => "generated-session",
      now: () => t1
    });
    const reloadedAgain = PluginRuntime.fromPersisted(reloaded.toPersistedState(), {
      createSessionId: () => "generated-session",
      now: () => t1
    });

    expect(reloaded.toPersistedState()).toEqual(reloadedAgain.toPersistedState());
    expect(reloaded.getTodayTrackedMinutes("task-a", t1)).toBe(60);
    expect(reloaded.listTaskViews(t1)[0]?.overdue).toBe(true);
    expect(reloaded.getAlertRecords()).toHaveLength(2);
  });

  it("does not re-emit deadline-overdue alert for the same deadline on later days", () => {
    const firstCheckMs = Date.parse("2026-03-23T09:00:00.000Z");
    const nextDayCheckMs = Date.parse("2026-03-24T09:00:00.000Z");

    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          {
            id: "task-deadline",
            title: "Submit tax form",
            createdAtMs: Date.parse("2026-03-01T09:00:00.000Z"),
            deadline: { dueAtMs: Date.parse("2026-03-20T09:00:00.000Z") }
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
        createSessionId: () => "generated-session",
        createTaskId: () => "generated-task",
        now: () => firstCheckMs
      }
    );

    const first = runtime.runAlertCheck(firstCheckMs);
    const later = runtime.runAlertCheck(nextDayCheckMs);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      taskId: "task-deadline",
      eventType: "deadline-overdue",
      periodKey: `deadline:${Date.parse("2026-03-20T09:00:00.000Z")}`
    });
    expect(later).toEqual([]);
  });

  it("does not evaluate recurring status or emit recurring-missed for completed recurring tasks", () => {
    const nowMs = Date.parse("2026-03-24T09:00:00.000Z");
    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          {
            id: "task-recurring-completed",
            title: "Completed recurring",
            createdAtMs: Date.parse("2026-03-01T09:00:00.000Z"),
            completedAtMs: Date.parse("2026-03-23T09:00:00.000Z"),
            recurring: { period: "daily", targetMinutes: 60 }
          }
        ],
        sessions: [
          {
            id: "session-partial",
            taskId: "task-recurring-completed",
            startMs: Date.parse("2026-03-23T10:00:00.000Z"),
            endMs: Date.parse("2026-03-23T10:30:00.000Z")
          }
        ],
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
        createSessionId: () => "generated-session",
        createTaskId: () => "generated-task",
        now: () => nowMs
      }
    );

    const taskView = runtime.listTaskViews(nowMs)[0];
    const alerts = runtime.runAlertCheck(nowMs);

    expect(taskView?.task.completedAtMs).toBeDefined();
    expect(taskView?.recurring).toBeNull();
    expect(alerts.some((event) => event.eventType === "recurring-missed")).toBe(false);
  });
});
