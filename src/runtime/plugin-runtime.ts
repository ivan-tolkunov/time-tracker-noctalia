import {
  calculateWeeklyAverageMinutes,
  evaluateMostRecentlyClosedRecurringPeriod,
  evaluateRecurringProgress,
  getDeadlineStatus,
  getTodayTrackedMinutesForTask,
  getAllClosedSessions,
  recordAlertIfNew,
  startTimer,
  stopTimer
} from "../domain/index.js";
import type {
  ActiveTimer,
  AlertRecord,
  RecurringPeriod,
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
  RuntimeAlertEvent,
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
  | "invalid-deadline"
  | "invalid-recurring"
  | "id-collision";

export type UpdateTaskFailureReason =
  | "not-found"
  | "empty-title"
  | "invalid-deadline"
  | "invalid-recurring"
  | "no-changes";

export interface CreateTaskInput {
  title: string;
  createdAtMs?: number;
  deadline?: NonNullable<Task["deadline"]> | null;
  recurring?: NonNullable<Task["recurring"]> | null;
}

export interface UpdateTaskInput {
  title?: string;
  deadline?: NonNullable<Task["deadline"]> | null;
  recurring?: NonNullable<Task["recurring"]> | null;
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

export interface TaskRecurringStatus {
  period: RecurringPeriod;
  periodKey: string;
  targetMinutes: number;
  trackedMinutes: number;
  remainingMinutes: number;
  met: boolean;
  mostRecentlyClosedPeriodMissed: boolean;
  mostRecentlyClosedPeriodKey: string | null;
}

export interface TaskView {
  task: Task;
  isActive: boolean;
  todayTrackedMinutes: number;
  weeklyAverageMinutes: number;
  overdue: boolean;
  deadlineStatus: ReturnType<typeof getDeadlineStatus>;
  recurring: TaskRecurringStatus | null;
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
    alertRecords: [...persisted.alertRecords],
    preferences: { ...persisted.preferences }
  };
}

function toPersistedState(state: RuntimeState): PersistedPluginState {
  return {
    version: 1,
    tasks: [...state.tasks],
    sessions: [...state.timerState.sessions],
    activeTimer: state.timerState.active,
    alertRecords: [...state.alertRecords],
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

function normalizeDeadline(
  deadline: NonNullable<Task["deadline"]> | null | undefined
): NonNullable<Task["deadline"]> | null {
  if (deadline === undefined) {
    return null;
  }

  if (deadline === null || !isFiniteMs(deadline.dueAtMs)) {
    return null;
  }

  return { dueAtMs: deadline.dueAtMs };
}

function normalizeRecurring(
  recurring: NonNullable<Task["recurring"]> | null | undefined
): NonNullable<Task["recurring"]> | null {
  if (recurring === undefined) {
    return null;
  }

  if (recurring === null) {
    return null;
  }

  if (!Number.isInteger(recurring.targetMinutes) || recurring.targetMinutes <= 0) {
    return null;
  }

  return {
    period: recurring.period,
    targetMinutes: recurring.targetMinutes
  };
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
    return this.listTasks().map((task) => {
      const recurringProgress = this.getRecurringProgress(task.id, nowMs);
      const closedRecurring = this.getMostRecentlyClosedRecurringStatus(task.id, nowMs);

      return {
        task,
        isActive: this.state.timerState.active?.taskId === task.id,
        todayTrackedMinutes: this.getTodayTrackedMinutes(task.id, nowMs),
        weeklyAverageMinutes: this.getWeeklyAverageMinutes(task.id, nowMs),
        overdue: this.getDeadlineStatus(task.id, nowMs) === "overdue",
        deadlineStatus: this.getDeadlineStatus(task.id, nowMs),
        recurring:
          recurringProgress === null
            ? null
            : {
                period: recurringProgress.period,
                periodKey: recurringProgress.periodKey,
                targetMinutes: recurringProgress.targetMinutes,
                trackedMinutes: recurringProgress.trackedMinutes,
                remainingMinutes: recurringProgress.remainingMinutes,
                met: recurringProgress.met,
                mostRecentlyClosedPeriodMissed: closedRecurring?.missed ?? false,
                mostRecentlyClosedPeriodKey: closedRecurring?.periodKey ?? null
              }
      };
    });
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

  getDeadlineStatus(taskId: TaskId, nowMs = this.options.now()): ReturnType<typeof getDeadlineStatus> {
    const task = this.getTaskById(taskId);
    if (task === null) {
      return "none";
    }

    return getDeadlineStatus(task, nowMs);
  }

  getRecurringProgress(taskId: TaskId, nowMs = this.options.now()) {
    const task = this.getTaskById(taskId);
    if (task === null) {
      return null;
    }

    return evaluateRecurringProgress(
      task,
      getAllClosedSessions(this.state.timerState, nowMs),
      nowMs,
      this.state.preferences
    );
  }

  getMostRecentlyClosedRecurringStatus(taskId: TaskId, nowMs = this.options.now()) {
    const task = this.getTaskById(taskId);
    if (task === null) {
      return null;
    }

    return evaluateMostRecentlyClosedRecurringPeriod(
      task,
      getAllClosedSessions(this.state.timerState, nowMs),
      nowMs,
      this.state.preferences
    );
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

    const deadline = normalizeDeadline(input.deadline);
    if (input.deadline !== undefined && input.deadline !== null && deadline === null) {
      return { created: false, task: null, reason: "invalid-deadline" };
    }

    const recurring = normalizeRecurring(input.recurring);
    if (input.recurring !== undefined && input.recurring !== null && recurring === null) {
      return { created: false, task: null, reason: "invalid-recurring" };
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
      createdAtMs,
      ...(deadline === null ? {} : { deadline }),
      ...(recurring === null ? {} : { recurring })
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

    if (input.deadline !== undefined) {
      if (input.deadline === null) {
        if (nextTask.deadline !== undefined) {
          const { deadline: _removedDeadline, ...withoutDeadline } = nextTask;
          nextTask = withoutDeadline;
          changed = true;
        }
      } else {
        const nextDeadline = normalizeDeadline(input.deadline);
        if (nextDeadline === null) {
          return { updated: false, task: null, reason: "invalid-deadline" };
        }
        if (nextTask.deadline?.dueAtMs !== nextDeadline.dueAtMs) {
          nextTask = {
            ...nextTask,
            deadline: nextDeadline
          };
          changed = true;
        }
      }
    }

    if (input.recurring !== undefined) {
      if (input.recurring === null) {
        if (nextTask.recurring !== undefined) {
          const { recurring: _removedRecurring, ...withoutRecurring } = nextTask;
          nextTask = withoutRecurring;
          changed = true;
        }
      } else {
        const nextRecurring = normalizeRecurring(input.recurring);
        if (nextRecurring === null) {
          return { updated: false, task: null, reason: "invalid-recurring" };
        }
        if (
          nextTask.recurring?.period !== nextRecurring.period ||
          nextTask.recurring?.targetMinutes !== nextRecurring.targetMinutes
        ) {
          nextTask = {
            ...nextTask,
            recurring: nextRecurring
          };
          changed = true;
        }
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
      },
      alertRecords: this.state.alertRecords.filter((record) => record.taskId !== taskId)
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

  runAlertCheck(nowMs = this.options.now()): RuntimeAlertEvent[] {
    const events: RuntimeAlertEvent[] = [];
    let nextRecords: AlertRecord[] = this.state.alertRecords;
    const closedSessions = getAllClosedSessions(this.state.timerState, nowMs);

    for (const task of this.state.tasks) {
      if (getDeadlineStatus(task, nowMs) === "overdue") {
        const periodKey = task.deadline === undefined ? "no-deadline" : `deadline:${task.deadline.dueAtMs}`;
        const update = recordAlertIfNew(nextRecords, task.id, "deadline-overdue", periodKey, nowMs);
        nextRecords = update.records;
        if (update.emitted) {
          events.push({
            key: update.key,
            taskId: task.id,
            eventType: "deadline-overdue",
            periodKey,
            emittedAtMs: nowMs
          });
        }
      }

      if (task.completedAtMs !== undefined) {
        continue;
      }

      const closedRecurring = evaluateMostRecentlyClosedRecurringPeriod(
        task,
        closedSessions,
        nowMs,
        this.state.preferences
      );
      if (closedRecurring?.missed === true) {
        const update = recordAlertIfNew(
          nextRecords,
          task.id,
          "recurring-missed",
          closedRecurring.periodKey,
          nowMs
        );
        nextRecords = update.records;
        if (update.emitted) {
          events.push({
            key: update.key,
            taskId: task.id,
            eventType: "recurring-missed",
            periodKey: closedRecurring.periodKey,
            emittedAtMs: nowMs
          });
        }
      }
    }

    if (nextRecords !== this.state.alertRecords) {
      this.state = {
        ...this.state,
        alertRecords: nextRecords
      };
    }

    return events;
  }

  getSessions(): Session[] {
    return [...this.state.timerState.sessions];
  }

  getAlertRecords(): AlertRecord[] {
    return [...this.state.alertRecords];
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
