import {
  calculateWeeklyAverageMinutes,
  getAllClosedSessions,
  getTodayTrackedMinutesForTask,
  startTimer,
  stopTimer
} from "../domain/index.js";
import type {
  ActiveTimer,
  Session,
  SessionId,
  Task,
  TaskId
} from "../types.js";
import {
  createDefaultPersistedState,
  loadPersistedState,
  normalizeRuntimePreferences,
  normalizePersistedState,
  savePersistedState
} from "./persistence.js";
import type {
  PersistedPluginState,
  PluginSettingsStorage,
  RuntimePreferences,
  RuntimeState
} from "./types.js";

export interface PluginRuntimeOptions {
  createSessionId: () => SessionId;
  createTaskId: () => TaskId;
  now: () => number;
}

export type CreateTaskFailureReason =
  | "empty-title"
  | "invalid-created-at"
  | "id-collision";

export type UpdateTaskFailureReason =
  | "not-found"
  | "empty-title"
  | "no-changes";

export interface CreateTaskInput {
  title: string;
  createdAtMs?: number;
}

export interface UpdateTaskInput {
  title?: string;
}

export interface CreateTaskResult {
  created: boolean;
  task: Task | null;
  reason: CreateTaskFailureReason | null;
}

export interface UpdateTaskResult {
  updated: boolean;
  task: Task | null;
  reason: UpdateTaskFailureReason | null;
}

export interface TaskView {
  task: Task;
  isActive: boolean;
  todayTrackedMinutes: number;
  weeklyAverageMinutes: number;
}

export interface ActiveTaskState {
  task: Task | null;
  timer: ActiveTimer | null;
  elapsedMinutes: number;
}

export interface RuntimePeriodicRefresh {
  nowMs: number;
  activeTaskState: ActiveTaskState;
  tasks: TaskView[];
}

function toRuntimeState(persisted: PersistedPluginState): RuntimeState {
  return {
    tasks: [...persisted.tasks],
    timerState: {
      active: persisted.activeTimer,
      sessions: [...persisted.sessions]
    },
    preferences: { ...persisted.preferences }
  };
}

function toPersistedState(state: RuntimeState): PersistedPluginState {
  return {
    version: 1,
    tasks: [...state.tasks],
    sessions: [...state.timerState.sessions],
    activeTimer: state.timerState.active,
    preferences: { ...state.preferences }
  };
}

function createDefaultOptions(): PluginRuntimeOptions {
  return {
    createSessionId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createTaskId: () => `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    now: () => Date.now()
  };
}

function isFiniteMs(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizeTitle(title: string): string | null {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : null;
}

export class PluginRuntime {
  private state: RuntimeState;
  private readonly options: PluginRuntimeOptions;

  constructor(state: RuntimeState, options?: Partial<PluginRuntimeOptions>) {
    this.state = state;
    this.options = {
      ...createDefaultOptions(),
      ...options
    };
  }

  static createEmpty(options?: Partial<PluginRuntimeOptions>): PluginRuntime {
    return PluginRuntime.fromPersisted(createDefaultPersistedState(), options);
  }

  static fromPersisted(
    persistedState: PersistedPluginState,
    options?: Partial<PluginRuntimeOptions>
  ): PluginRuntime {
    return new PluginRuntime(toRuntimeState(persistedState), options);
  }

  static load(
    storage: PluginSettingsStorage,
    key: string,
    options?: Partial<PluginRuntimeOptions>
  ): PluginRuntime {
    const nowMs = options?.now?.() ?? Date.now();
    const persistedState = loadPersistedState(storage, key, nowMs);
    return PluginRuntime.fromPersisted(persistedState, options);
  }

  save(storage: PluginSettingsStorage, key: string): void {
    savePersistedState(storage, key, this.toPersistedState());
  }

  reload(persistedState: unknown): void {
    const nowMs = this.options.now();
    this.state = toRuntimeState(normalizePersistedState(persistedState, nowMs));
  }

  toPersistedState(): PersistedPluginState {
    return toPersistedState(this.state);
  }

  listTasks(): Task[] {
    return [...this.state.tasks].sort((left, right) => left.createdAtMs - right.createdAtMs);
  }

  listTaskViews(nowMs = this.options.now()): TaskView[] {
    return this.listTasks().map((task) => ({
      task,
      isActive: this.state.timerState.active?.taskId === task.id,
      todayTrackedMinutes: this.getTodayTrackedMinutes(task.id, nowMs),
      weeklyAverageMinutes: this.getWeeklyAverageMinutes(task.id, nowMs)
    }));
  }

  getActiveTaskState(nowMs = this.options.now()): ActiveTaskState {
    const timer = this.state.timerState.active;
    if (timer === null) {
      return { task: null, timer: null, elapsedMinutes: 0 };
    }

    const task = this.getTaskById(timer.taskId);
    if (task === null) {
      return { task: null, timer: null, elapsedMinutes: 0 };
    }

    return {
      task,
      timer,
      elapsedMinutes: Math.max(0, Math.floor((nowMs - timer.startMs) / 60_000))
    };
  }

  getTodayTrackedMinutes(taskId: TaskId, nowMs = this.options.now()): number {
    if (this.getTaskById(taskId) === null) {
      return 0;
    }

    return getTodayTrackedMinutesForTask(this.state.timerState, taskId, nowMs, this.state.preferences);
  }

  getWeeklyAverageMinutes(taskId: TaskId, nowMs = this.options.now()): number {
    const task = this.getTaskById(taskId);
    if (task === null) {
      return 0;
    }

    const sessions = getAllClosedSessions(this.state.timerState, nowMs);
    return calculateWeeklyAverageMinutes(
      sessions,
      taskId,
      task.createdAtMs,
      nowMs,
      this.state.preferences
    ).averageMinutesPerWeek;
  }

  createTask(input: CreateTaskInput, nowMs = this.options.now()): CreateTaskResult {
    const title = normalizeTitle(input.title);
    if (title === null) {
      return { created: false, task: null, reason: "empty-title" };
    }

    const createdAtMs = input.createdAtMs ?? nowMs;
    if (!isFiniteMs(createdAtMs)) {
      return { created: false, task: null, reason: "invalid-created-at" };
    }

    let taskId: TaskId | null = null;
    for (let attempts = 0; attempts < 5; attempts += 1) {
      const candidate = this.options.createTaskId();
      if (this.getTaskById(candidate) === null) {
        taskId = candidate;
        break;
      }
    }

    if (taskId === null) {
      return { created: false, task: null, reason: "id-collision" };
    }

    const task: Task = {
      id: taskId,
      title,
      createdAtMs
    };

    this.state = {
      ...this.state,
      tasks: [...this.state.tasks, task]
    };

    return { created: true, task, reason: null };
  }

  updateTask(taskId: TaskId, input: UpdateTaskInput): UpdateTaskResult {
    const existing = this.getTaskById(taskId);
    if (existing === null) {
      return { updated: false, task: null, reason: "not-found" };
    }

    let nextTask: Task = existing;
    let changed = false;

    if (input.title !== undefined) {
      const nextTitle = normalizeTitle(input.title);
      if (nextTitle === null) {
        return { updated: false, task: null, reason: "empty-title" };
      }
      if (nextTitle !== nextTask.title) {
        nextTask = {
          ...nextTask,
          title: nextTitle
        };
        changed = true;
      }
    }

    if (!changed) {
      return { updated: false, task: existing, reason: "no-changes" };
    }

    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((task) => (task.id === taskId ? nextTask : task))
    };

    return { updated: true, task: nextTask, reason: null };
  }

  startTask(taskId: TaskId, nowMs = this.options.now()): { started: boolean; switchedFromTaskId: TaskId | null } {
    const task = this.getTaskById(taskId);
    if (task === null || task.completedAtMs !== undefined) {
      return { started: false, switchedFromTaskId: null };
    }

    const result = startTimer(this.state.timerState, task.id, nowMs, {
      createSessionId: this.options.createSessionId
    });
    this.state = {
      ...this.state,
      timerState: result.state
    };
    return {
      started: true,
      switchedFromTaskId: result.switchedFromTaskId
    };
  }

  stopActiveTimer(nowMs = this.options.now()): boolean {
    if (this.state.timerState.active === null) {
      return false;
    }

    this.state = {
      ...this.state,
      timerState: stopTimer(this.state.timerState, nowMs)
    };
    return true;
  }

  completeTask(taskId: TaskId, nowMs = this.options.now()): boolean {
    const task = this.getTaskById(taskId);
    if (task === null) {
      return false;
    }

    if (this.state.timerState.active?.taskId === taskId) {
      this.state = {
        ...this.state,
        timerState: stopTimer(this.state.timerState, nowMs)
      };
    }

    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((candidate) =>
        candidate.id === taskId
          ? {
              ...candidate,
              completedAtMs: candidate.completedAtMs ?? nowMs
            }
          : candidate
      )
    };
    return true;
  }

  deleteTaskSafe(taskId: TaskId, nowMs = this.options.now()): boolean {
    if (this.getTaskById(taskId) === null) {
      return false;
    }

    let nextTimerState = this.state.timerState;
    if (this.state.timerState.active?.taskId === taskId) {
      nextTimerState = stopTimer(nextTimerState, nowMs);
    }

    const nextSessions = nextTimerState.sessions.filter((session) => session.taskId !== taskId);
    const nextActive = nextTimerState.active?.taskId === taskId ? null : nextTimerState.active;

    this.state = {
      ...this.state,
      tasks: this.state.tasks.filter((task) => task.id !== taskId),
      timerState: {
        active: nextActive,
        sessions: nextSessions
      }
    };
    return true;
  }

  runPeriodicRefresh(nowMs = this.options.now()): RuntimePeriodicRefresh {
    return {
      nowMs,
      activeTaskState: this.getActiveTaskState(nowMs),
      tasks: this.listTaskViews(nowMs)
    };
  }

  getSessions(): Session[] {
    return [...this.state.timerState.sessions];
  }

  getPreferences(): RuntimePreferences {
    return {
      ...this.state.preferences
    };
  }

  updatePreferences(nextPreferences: Partial<RuntimePreferences>): RuntimePreferences {
    this.state = {
      ...this.state,
      preferences: normalizeRuntimePreferences(
        {
          ...this.state.preferences,
          ...nextPreferences
        },
        this.state.preferences
      )
    };

    return this.getPreferences();
  }

  private getTaskById(taskId: TaskId): Task | null {
    return this.state.tasks.find((task) => task.id === taskId) ?? null;
  }
}
