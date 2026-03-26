import type {
  CreateTaskInput,
  CreateTaskResult,
  PluginRuntime,
  RuntimePeriodicRefresh,
  TaskView,
  UpdateTaskInput,
  UpdateTaskResult
} from "./plugin-runtime.js";
import type { RuntimeAlertEvent, RuntimePreferences } from "./types.js";
import type { RecurringPeriod, TaskId } from "../types.js";

export interface BarWidgetState {
  hasActiveTask: boolean;
  activeTaskId: TaskId | null;
  activeTaskTitle: string;
  todayTrackedMinutes: number;
  todayTrackedLabel: string;
}

export interface PanelTaskState {
  id: TaskId;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
  todayTrackedMinutes: number;
  todayTrackedLabel: string;
  weeklyAverageMinutes: number;
  weeklyAverageLabel: string;
  deadlineStatus: TaskView["deadlineStatus"];
  deadlineDueAtMs: number | null;
  recurringPeriod: RecurringPeriod | null;
  recurringTargetMinutes: number | null;
}

export interface PanelState {
  activeTaskId: TaskId | null;
  activeTaskTitle: string;
  activeElapsedMinutes: number;
  activeElapsedLabel: string;
  canStopActiveTimer: boolean;
  tasks: PanelTaskState[];
}

export interface PluginUiSnapshot {
  nowMs: number;
  bar: BarWidgetState;
  panel: PanelState;
}

export interface SettingsState {
  boundaryMinuteOfDay: number;
  boundaryTimeText: string;
  weekStartsOn: RuntimePreferences["weekStartsOn"];
  refreshIntervalMs: number;
  refreshIntervalSeconds: number;
  alertCheckIntervalMs: number;
  alertCheckIntervalSeconds: number;
}

export interface SettingsDraftInput {
  boundaryTimeText: string;
  weekStartsOn: number;
  refreshIntervalSecondsText: string;
  alertCheckIntervalSecondsText: string;
}

export type SettingsMutationFailureReason =
  | "invalid-boundary"
  | "invalid-week-start"
  | "invalid-refresh-interval"
  | "invalid-alert-check-interval";

export interface SettingsMutationResult {
  ok: boolean;
  reason: SettingsMutationFailureReason | null;
  settings: SettingsState;
}

export interface TaskDraftInput {
  title: string;
  deadlineText: string;
  recurringPeriod: string;
  recurringTargetMinutes: number;
}

export type TaskDraftFailureReason =
  | CreateTaskResult["reason"]
  | UpdateTaskResult["reason"]
  | "invalid-deadline";

export interface TaskDraftMutationResult {
  ok: boolean;
  reason: TaskDraftFailureReason | null;
}

export interface PanelOpenRequest {
  requested: boolean;
  requestedAtMs: number;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function formatBoundaryTime(boundaryMinuteOfDay: number): string {
  const hours = Math.floor(boundaryMinuteOfDay / 60);
  const minutes = boundaryMinuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseBoundaryTimeText(boundaryTimeText: string): number | null {
  const normalized = boundaryTimeText.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (match === null) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

function parseIntervalSecondsText(intervalText: string): number | null {
  const normalized = intervalText.trim();
  if (normalized.length === 0) {
    return null;
  }

  const seconds = Number(normalized);
  if (!Number.isInteger(seconds) || seconds < 1) {
    return null;
  }

  return seconds * 1_000;
}

function isWeekStartsOn(value: number): value is RuntimePreferences["weekStartsOn"] {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function parseDeadlineText(deadlineText: string): number | null {
  const normalized = deadlineText.trim();
  if (normalized.length === 0) {
    return null;
  }

  const dueAtMs = Number(normalized);
  if (!Number.isFinite(dueAtMs) || dueAtMs < 0) {
    return null;
  }

  return dueAtMs;
}

function normalizeRecurringDraft(
  recurringPeriod: string,
  recurringTargetMinutes: number,
  mode: "create" | "update"
): NonNullable<CreateTaskInput["recurring"]> | null | undefined {
  const normalizedPeriod = recurringPeriod.trim();
  const hasPeriod = normalizedPeriod.length > 0;
  const hasTarget = recurringTargetMinutes > 0;

  if (!hasPeriod && !hasTarget) {
    return mode === "create" ? undefined : null;
  }

  if ((normalizedPeriod !== "daily" && normalizedPeriod !== "weekly") || !Number.isInteger(recurringTargetMinutes)) {
    return null;
  }

  return {
    period: normalizedPeriod,
    targetMinutes: recurringTargetMinutes
  };
}

export function buildBarWidgetState(runtime: PluginRuntime, nowMs: number): BarWidgetState {
  const activeTaskState = runtime.getActiveTaskState(nowMs);
  const activeTask = activeTaskState.task;
  const todayTrackedMinutes = activeTask === null ? 0 : runtime.getTodayTrackedMinutes(activeTask.id, nowMs);

  return {
    hasActiveTask: activeTask !== null,
    activeTaskId: activeTask?.id ?? null,
    activeTaskTitle: activeTask?.title ?? "No active task",
    todayTrackedMinutes,
    todayTrackedLabel: `${formatMinutes(todayTrackedMinutes)} today`
  };
}

export function buildPanelState(runtime: PluginRuntime, nowMs: number): PanelState {
  const activeTaskState = runtime.getActiveTaskState(nowMs);

  return {
    activeTaskId: activeTaskState.task?.id ?? null,
    activeTaskTitle: activeTaskState.task?.title ?? "No active task",
    activeElapsedMinutes: activeTaskState.elapsedMinutes,
    activeElapsedLabel: formatMinutes(activeTaskState.elapsedMinutes),
    canStopActiveTimer: activeTaskState.timer !== null,
    tasks: runtime.listTaskViews(nowMs).map((taskView) => ({
      id: taskView.task.id,
      title: taskView.task.title,
      isActive: taskView.isActive,
      isCompleted: taskView.task.completedAtMs !== undefined,
      todayTrackedMinutes: taskView.todayTrackedMinutes,
      todayTrackedLabel: formatMinutes(taskView.todayTrackedMinutes),
      weeklyAverageMinutes: taskView.weeklyAverageMinutes,
      weeklyAverageLabel: formatMinutes(taskView.weeklyAverageMinutes),
      deadlineStatus: taskView.deadlineStatus,
      deadlineDueAtMs: taskView.task.deadline?.dueAtMs ?? null,
      recurringPeriod: taskView.task.recurring?.period ?? null,
      recurringTargetMinutes: taskView.task.recurring?.targetMinutes ?? null
    }))
  };
}

export function buildSettingsState(runtime: PluginRuntime): SettingsState {
  const preferences = runtime.getPreferences();

  return {
    boundaryMinuteOfDay: preferences.boundaryMinuteOfDay,
    boundaryTimeText: formatBoundaryTime(preferences.boundaryMinuteOfDay),
    weekStartsOn: preferences.weekStartsOn,
    refreshIntervalMs: preferences.refreshIntervalMs,
    refreshIntervalSeconds: Math.floor(preferences.refreshIntervalMs / 1_000),
    alertCheckIntervalMs: preferences.alertCheckIntervalMs,
    alertCheckIntervalSeconds: Math.floor(preferences.alertCheckIntervalMs / 1_000)
  };
}

export class PluginUiBridge {
  private lastSnapshot: PluginUiSnapshot;
  private lastPeriodicRefresh: RuntimePeriodicRefresh | null = null;
  private lastAlertEvents: RuntimeAlertEvent[] = [];
  private lastPanelOpenRequest: PanelOpenRequest | null = null;

  constructor(private readonly runtime: PluginRuntime, nowMs = Date.now()) {
    this.lastSnapshot = this.buildSnapshot(nowMs);
  }

  initializeRuntime(nowMs: number): PluginUiSnapshot {
    return this.refreshSnapshot(nowMs);
  }

  runPeriodicRefresh(nowMs: number): PluginUiSnapshot {
    this.lastPeriodicRefresh = this.runtime.runPeriodicRefresh(nowMs);
    return this.refreshSnapshot(nowMs);
  }

  runAlertCheck(nowMs: number): RuntimeAlertEvent[] {
    this.lastAlertEvents = this.runtime.runAlertCheck(nowMs);
    return [...this.lastAlertEvents];
  }

  getSnapshot(): PluginUiSnapshot {
    return this.lastSnapshot;
  }

  getSettingsState(): SettingsState {
    return buildSettingsState(this.runtime);
  }

  getLastPeriodicRefresh(): RuntimePeriodicRefresh | null {
    return this.lastPeriodicRefresh;
  }

  getLastAlertEvents(): RuntimeAlertEvent[] {
    return [...this.lastAlertEvents];
  }

  getLastPanelOpenRequest(): PanelOpenRequest | null {
    return this.lastPanelOpenRequest;
  }

  requestPanelOpen(nowMs: number): PanelOpenRequest {
    this.lastPanelOpenRequest = {
      requested: true,
      requestedAtMs: nowMs
    };
    return this.lastPanelOpenRequest;
  }

  createTask(input: CreateTaskInput, nowMs: number): CreateTaskResult {
    const result = this.runtime.createTask(input, nowMs);
    this.refreshSnapshot(nowMs);
    return result;
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput, nowMs: number): UpdateTaskResult {
    const result = this.runtime.updateTask(taskId, input);
    this.refreshSnapshot(nowMs);
    return result;
  }

  startTask(taskId: TaskId, nowMs: number): { started: boolean; switchedFromTaskId: TaskId | null } {
    const result = this.runtime.startTask(taskId, nowMs);
    this.refreshSnapshot(nowMs);
    return result;
  }

  stopActiveTimer(nowMs: number): boolean {
    const stopped = this.runtime.stopActiveTimer(nowMs);
    this.refreshSnapshot(nowMs);
    return stopped;
  }

  completeTask(taskId: TaskId, nowMs: number): boolean {
    const completed = this.runtime.completeTask(taskId, nowMs);
    this.refreshSnapshot(nowMs);
    return completed;
  }

  deleteTask(taskId: TaskId, nowMs: number): boolean {
    const deleted = this.runtime.deleteTaskSafe(taskId, nowMs);
    this.refreshSnapshot(nowMs);
    return deleted;
  }

  updateSettingsFromDraft(draft: SettingsDraftInput, nowMs: number): SettingsMutationResult {
    const boundaryMinuteOfDay = parseBoundaryTimeText(draft.boundaryTimeText);
    if (boundaryMinuteOfDay === null) {
      return {
        ok: false,
        reason: "invalid-boundary",
        settings: this.getSettingsState()
      };
    }

    if (!isWeekStartsOn(draft.weekStartsOn)) {
      return {
        ok: false,
        reason: "invalid-week-start",
        settings: this.getSettingsState()
      };
    }

    const refreshIntervalMs = parseIntervalSecondsText(draft.refreshIntervalSecondsText);
    if (refreshIntervalMs === null) {
      return {
        ok: false,
        reason: "invalid-refresh-interval",
        settings: this.getSettingsState()
      };
    }

    const alertCheckIntervalMs = parseIntervalSecondsText(draft.alertCheckIntervalSecondsText);
    if (alertCheckIntervalMs === null) {
      return {
        ok: false,
        reason: "invalid-alert-check-interval",
        settings: this.getSettingsState()
      };
    }

    this.runtime.updatePreferences({
      boundaryMinuteOfDay,
      weekStartsOn: draft.weekStartsOn,
      refreshIntervalMs,
      alertCheckIntervalMs
    });
    this.refreshSnapshot(nowMs);

    return {
      ok: true,
      reason: null,
      settings: this.getSettingsState()
    };
  }

  createTaskFromDraft(draft: TaskDraftInput, nowMs: number): TaskDraftMutationResult {
    const deadline = parseDeadlineText(draft.deadlineText);
    if (draft.deadlineText.trim().length > 0 && deadline === null) {
      return { ok: false, reason: "invalid-deadline" };
    }

    const recurring = normalizeRecurringDraft(
      draft.recurringPeriod,
      draft.recurringTargetMinutes,
      "create"
    );
    if (draft.recurringPeriod.trim().length > 0 && recurring === null) {
      return { ok: false, reason: "invalid-recurring" };
    }

    const result = this.createTask(
      {
        title: draft.title,
        ...(deadline === null ? {} : { deadline: { dueAtMs: deadline } }),
        ...(recurring === undefined ? {} : { recurring })
      },
      nowMs
    );

    return {
      ok: result.created,
      reason: result.reason
    };
  }

  updateTaskFromDraft(taskId: TaskId, draft: TaskDraftInput, nowMs: number): TaskDraftMutationResult {
    const deadline = parseDeadlineText(draft.deadlineText);
    if (draft.deadlineText.trim().length > 0 && deadline === null) {
      return { ok: false, reason: "invalid-deadline" };
    }

    const recurring = normalizeRecurringDraft(
      draft.recurringPeriod,
      draft.recurringTargetMinutes,
      "update"
    );
    if (draft.recurringPeriod.trim().length > 0 && recurring === null) {
      return { ok: false, reason: "invalid-recurring" };
    }

    const result = this.updateTask(
      taskId,
      {
        title: draft.title,
        deadline: deadline === null ? null : { dueAtMs: deadline },
        recurring
      },
      nowMs
    );

    return {
      ok: result.updated,
      reason: result.reason
    };
  }

  private refreshSnapshot(nowMs: number): PluginUiSnapshot {
    this.lastSnapshot = this.buildSnapshot(nowMs);
    return this.lastSnapshot;
  }

  private buildSnapshot(nowMs: number): PluginUiSnapshot {
    return {
      nowMs,
      bar: buildBarWidgetState(this.runtime, nowMs),
      panel: buildPanelState(this.runtime, nowMs)
    };
  }
}
