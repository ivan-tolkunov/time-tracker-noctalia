import { describe, expect, it } from "vitest";

import { PluginRuntime, PluginUiBridge } from "../../src/runtime/index.js";

const defaultPreferences = {
  boundaryMinuteOfDay: 0,
  weekStartsOn: 1,
  refreshIntervalMs: 30_000,
  alertCheckIntervalMs: 60_000
} as const;

describe("plugin UI bridge", () => {
  it("builds a minimal bar summary for the active task only", () => {
    const activeStartMs = Date.parse("2026-03-25T09:30:00.000Z");
    const nowMs = Date.parse("2026-03-25T10:00:00.000Z");

    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          { id: "task-active", title: "Write spec", createdAtMs: Date.parse("2026-03-24T09:00:00.000Z") },
          { id: "task-other", title: "Admin", createdAtMs: Date.parse("2026-03-24T10:00:00.000Z") }
        ],
        sessions: [
          {
            id: "session-other",
            taskId: "task-other",
            startMs: Date.parse("2026-03-25T08:00:00.000Z"),
            endMs: Date.parse("2026-03-25T09:00:00.000Z")
          }
        ],
        activeTimer: {
          sessionId: "active-session",
          taskId: "task-active",
          startMs: activeStartMs
        },
        alertRecords: [],
        preferences: defaultPreferences
      },
      {
        createSessionId: () => "unused-session",
        createTaskId: () => "unused-task",
        now: () => nowMs
      }
    );

    const bridge = new PluginUiBridge(runtime, nowMs);
    const snapshot = bridge.initializeRuntime(nowMs);

    expect(snapshot.bar).toEqual({
      hasActiveTask: true,
      activeTaskId: "task-active",
      activeTaskTitle: "Write spec",
      todayTrackedMinutes: 30,
      todayTrackedLabel: "30m today"
    });
    expect(snapshot.panel).toMatchObject({
      activeTaskId: "task-active",
      activeTaskTitle: "Write spec",
      activeElapsedMinutes: 30,
      activeElapsedLabel: "30m",
      canStopActiveTimer: true
    });
  });

  it("drives panel create, edit, start, switch, stop, complete, and delete flows", () => {
    const t0 = Date.parse("2026-03-25T08:00:00.000Z");
    const t1 = Date.parse("2026-03-25T09:00:00.000Z");
    const t2 = Date.parse("2026-03-25T09:30:00.000Z");

    let nextTaskId = 0;
    let nextSessionId = 0;
    const runtime = PluginRuntime.createEmpty({
      createTaskId: () => `task-${++nextTaskId}`,
      createSessionId: () => `session-${++nextSessionId}`,
      now: () => t0
    });
    const bridge = new PluginUiBridge(runtime, t0);

    const firstCreate = bridge.createTaskFromDraft(
      {
        title: "Draft proposal",
        deadlineText: String(Date.parse("2026-03-28T12:00:00.000Z")),
        recurringPeriod: "weekly",
        recurringTargetMinutes: 90
      },
      t0
    );
    const secondCreate = bridge.createTaskFromDraft(
      {
        title: "Review notes",
        deadlineText: "",
        recurringPeriod: "",
        recurringTargetMinutes: 0
      },
      t0
    );

    expect(firstCreate).toEqual({ ok: true, reason: null });
    expect(secondCreate).toEqual({ ok: true, reason: null });

    const invalidDraft = bridge.createTaskFromDraft(
      {
        title: "Broken deadline",
        deadlineText: "not-a-number",
        recurringPeriod: "",
        recurringTargetMinutes: 0
      },
      t0
    );
    expect(invalidDraft).toEqual({ ok: false, reason: "invalid-deadline" });

    const updated = bridge.updateTaskFromDraft(
      "task-1",
      {
        title: "Draft launch proposal",
        deadlineText: String(Date.parse("2026-03-29T12:00:00.000Z")),
        recurringPeriod: "daily",
        recurringTargetMinutes: 45
      },
      t0
    );
    expect(updated).toMatchObject({
      ok: true,
      reason: null,
    });

    expect(bridge.startTask("task-1", t0)).toEqual({ started: true, switchedFromTaskId: null });
    expect(bridge.startTask("task-2", t1)).toEqual({ started: true, switchedFromTaskId: "task-1" });
    expect(bridge.stopActiveTimer(t2)).toBe(true);
    expect(bridge.completeTask("task-2", t2)).toBe(true);
    expect(bridge.deleteTask("task-1", t2)).toBe(true);

    const snapshot = bridge.getSnapshot();

    expect(snapshot.panel.activeTaskId).toBeNull();
    expect(snapshot.panel.canStopActiveTimer).toBe(false);
    expect(snapshot.panel.tasks).toEqual([
      {
        id: "task-2",
        title: "Review notes",
        isActive: false,
        isCompleted: true,
        todayTrackedMinutes: 30,
        todayTrackedLabel: "30m",
        weeklyAverageMinutes: 30,
        weeklyAverageLabel: "30m",
        deadlineStatus: "none",
        deadlineDueAtMs: null,
        recurringPeriod: null,
        recurringTargetMinutes: null
      }
    ]);
    expect(snapshot.bar).toEqual({
      hasActiveTask: false,
      activeTaskId: null,
      activeTaskTitle: "No active task",
      todayTrackedMinutes: 0,
      todayTrackedLabel: "0m today"
    });
  });

  it("keeps bar and panel snapshots synchronized across refreshes and alert checks", () => {
    const startMs = Date.parse("2026-03-23T09:00:00.000Z");
    const firstRefreshMs = Date.parse("2026-03-23T09:45:00.000Z");
    const secondRefreshMs = Date.parse("2026-03-23T10:15:00.000Z");

    const runtime = PluginRuntime.fromPersisted(
      {
        version: 1,
        tasks: [
          {
            id: "task-focus",
            title: "Focus block",
            createdAtMs: Date.parse("2026-03-20T09:00:00.000Z"),
            deadline: { dueAtMs: Date.parse("2026-03-22T09:00:00.000Z") },
            recurring: { period: "weekly", targetMinutes: 180 }
          }
        ],
        sessions: [],
        activeTimer: {
          sessionId: "session-focus",
          taskId: "task-focus",
          startMs
        },
        alertRecords: [],
        preferences: defaultPreferences
      },
      {
        createSessionId: () => "generated-session",
        createTaskId: () => "generated-task",
        now: () => firstRefreshMs
      }
    );

    const bridge = new PluginUiBridge(runtime, firstRefreshMs);
    const firstSnapshot = bridge.initializeRuntime(firstRefreshMs);
    const secondSnapshot = bridge.runPeriodicRefresh(secondRefreshMs);
    const alerts = bridge.runAlertCheck(secondRefreshMs);
    const panelOpenRequest = bridge.requestPanelOpen(secondRefreshMs);

    expect(firstSnapshot.bar.activeTaskId).toBe(firstSnapshot.panel.activeTaskId);
    expect(secondSnapshot.bar.activeTaskId).toBe(secondSnapshot.panel.activeTaskId);
    expect(secondSnapshot.bar.todayTrackedMinutes).toBe(75);
    expect(secondSnapshot.panel.activeElapsedMinutes).toBe(75);
    expect(bridge.getLastPeriodicRefresh()).toMatchObject({ nowMs: secondRefreshMs });
    expect(panelOpenRequest).toEqual({ requested: true, requestedAtMs: secondRefreshMs });
    expect(bridge.getLastPanelOpenRequest()).toEqual(panelOpenRequest);
    expect(alerts.map((event) => event.eventType).sort()).toEqual(["deadline-overdue", "recurring-missed"]);
    expect(bridge.getLastAlertEvents()).toEqual(alerts);
  });

  it("exposes settings state and updates runtime preferences from settings drafts", () => {
    const nowMs = Date.parse("2026-03-26T08:00:00.000Z");
    const runtime = PluginRuntime.createEmpty({
      createTaskId: () => "unused-task",
      createSessionId: () => "unused-session",
      now: () => nowMs
    });
    const bridge = new PluginUiBridge(runtime, nowMs);

    expect(bridge.getSettingsState()).toEqual({
      boundaryMinuteOfDay: 0,
      boundaryTimeText: "00:00",
      weekStartsOn: 1,
      refreshIntervalMs: 30_000,
      refreshIntervalSeconds: 30,
      alertCheckIntervalMs: 60_000,
      alertCheckIntervalSeconds: 60
    });

    const updated = bridge.updateSettingsFromDraft(
      {
        boundaryTimeText: "04:30",
        weekStartsOn: 0,
        refreshIntervalSecondsText: "45",
        alertCheckIntervalSecondsText: "90"
      },
      nowMs
    );

    expect(updated).toEqual({
      ok: true,
      reason: null,
      settings: {
        boundaryMinuteOfDay: 270,
        boundaryTimeText: "04:30",
        weekStartsOn: 0,
        refreshIntervalMs: 45_000,
        refreshIntervalSeconds: 45,
        alertCheckIntervalMs: 90_000,
        alertCheckIntervalSeconds: 90
      }
    });
    expect(runtime.getPreferences()).toEqual({
      boundaryMinuteOfDay: 270,
      weekStartsOn: 0,
      refreshIntervalMs: 45_000,
      alertCheckIntervalMs: 90_000
    });
  });

  it("rejects invalid settings drafts without mutating runtime preferences", () => {
    const nowMs = Date.parse("2026-03-26T08:00:00.000Z");
    const runtime = PluginRuntime.createEmpty({
      createTaskId: () => "unused-task",
      createSessionId: () => "unused-session",
      now: () => nowMs
    });
    const bridge = new PluginUiBridge(runtime, nowMs);

    expect(
      bridge.updateSettingsFromDraft(
        {
          boundaryTimeText: "25:00",
          weekStartsOn: 1,
          refreshIntervalSecondsText: "30",
          alertCheckIntervalSecondsText: "60"
        },
        nowMs
      )
    ).toEqual({
      ok: false,
      reason: "invalid-boundary",
      settings: {
        boundaryMinuteOfDay: 0,
        boundaryTimeText: "00:00",
        weekStartsOn: 1,
        refreshIntervalMs: 30_000,
        refreshIntervalSeconds: 30,
        alertCheckIntervalMs: 60_000,
        alertCheckIntervalSeconds: 60
      }
    });

    expect(
      bridge.updateSettingsFromDraft(
        {
          boundaryTimeText: "04:00",
          weekStartsOn: 1,
          refreshIntervalSecondsText: "0",
          alertCheckIntervalSecondsText: "60"
        },
        nowMs
      ).reason
    ).toBe("invalid-refresh-interval");
    expect(runtime.getPreferences()).toEqual(defaultPreferences);
  });
});
