import { makeAlertKey } from "../domain/alert-dedupe.js";
import type { RecurringPeriod, Task } from "../types.js";
import {
  type PersistedPluginState,
  type PluginSettingsStorage,
  PERSISTED_STATE_VERSION,
  type RuntimePreferences
} from "./types.js";

const DAY_MINUTES = 24 * 60;

export const DEFAULT_RUNTIME_PREFERENCES: RuntimePreferences = {
  boundaryMinuteOfDay: 0,
  weekStartsOn: 1,
  refreshIntervalMs: 30_000,
  alertCheckIntervalMs: 60_000
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeRecurringPeriod(value: unknown): RecurringPeriod | null {
  if (value === "daily" || value === "weekly") {
    return value;
  }

  return null;
}

function sanitizeTask(raw: unknown, nowMs: number): Task | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = readNonEmptyString(raw.id);
  const title = readNonEmptyString(raw.title);
  if (id === null || title === null) {
    return null;
  }

  const rawCreatedAtMs = readFiniteNumber(raw.createdAtMs);
  const createdAtMs = rawCreatedAtMs === null || rawCreatedAtMs < 0 ? nowMs : rawCreatedAtMs;

  let completedAtMs: number | undefined;
  const rawCompletedAtMs = readFiniteNumber(raw.completedAtMs);
  if (rawCompletedAtMs !== null && rawCompletedAtMs >= createdAtMs) {
    completedAtMs = rawCompletedAtMs;
  }

  let deadline: Task["deadline"];
  if (isRecord(raw.deadline)) {
    const dueAtMs = readFiniteNumber(raw.deadline.dueAtMs);
    if (dueAtMs !== null && dueAtMs >= 0) {
      deadline = { dueAtMs };
    }
  }

  let recurring: Task["recurring"];
  if (isRecord(raw.recurring)) {
    const period = sanitizeRecurringPeriod(raw.recurring.period);
    const targetMinutes = readFiniteNumber(raw.recurring.targetMinutes);
    if (period !== null && targetMinutes !== null && Number.isInteger(targetMinutes) && targetMinutes > 0) {
      recurring = { period, targetMinutes };
    }
  }

  return {
    id,
    title,
    createdAtMs,
    ...(completedAtMs === undefined ? {} : { completedAtMs }),
    ...(deadline === undefined ? {} : { deadline }),
    ...(recurring === undefined ? {} : { recurring })
  };
}

export function normalizeRuntimePreferences(
  raw: unknown,
  fallback: RuntimePreferences = DEFAULT_RUNTIME_PREFERENCES
): RuntimePreferences {
  if (!isRecord(raw)) {
    return {
      ...fallback
    };
  }

  const boundaryMinuteOfDayCandidate = readFiniteNumber(raw.boundaryMinuteOfDay);
  const boundaryMinuteOfDay =
    boundaryMinuteOfDayCandidate !== null &&
    Number.isInteger(boundaryMinuteOfDayCandidate) &&
    boundaryMinuteOfDayCandidate >= 0 &&
    boundaryMinuteOfDayCandidate < DAY_MINUTES
      ? boundaryMinuteOfDayCandidate
      : fallback.boundaryMinuteOfDay;

  const weekStartsOnCandidate = readFiniteNumber(raw.weekStartsOn);
  const weekStartsOn =
    weekStartsOnCandidate !== null &&
    Number.isInteger(weekStartsOnCandidate) &&
    weekStartsOnCandidate >= 0 &&
    weekStartsOnCandidate <= 6
      ? (weekStartsOnCandidate as 0 | 1 | 2 | 3 | 4 | 5 | 6)
      : fallback.weekStartsOn;

  const refreshIntervalCandidate = readFiniteNumber(raw.refreshIntervalMs);
  const refreshIntervalMs =
    refreshIntervalCandidate !== null && Number.isInteger(refreshIntervalCandidate) && refreshIntervalCandidate >= 1_000
      ? refreshIntervalCandidate
      : fallback.refreshIntervalMs;

  const alertIntervalCandidate = readFiniteNumber(raw.alertCheckIntervalMs);
  const alertCheckIntervalMs =
    alertIntervalCandidate !== null && Number.isInteger(alertIntervalCandidate) && alertIntervalCandidate >= 1_000
      ? alertIntervalCandidate
      : fallback.alertCheckIntervalMs;

  return {
    boundaryMinuteOfDay,
    weekStartsOn,
    refreshIntervalMs,
    alertCheckIntervalMs
  };
}

export function createDefaultPersistedState(): PersistedPluginState {
  return {
    version: PERSISTED_STATE_VERSION,
    tasks: [],
    sessions: [],
    activeTimer: null,
    alertRecords: [],
    preferences: DEFAULT_RUNTIME_PREFERENCES
  };
}

export function normalizePersistedState(input: unknown, nowMs: number): PersistedPluginState {
  if (!isRecord(input)) {
    return createDefaultPersistedState();
  }

  const tasksRaw = Array.isArray(input.tasks) ? input.tasks : [];
  const tasks: Task[] = [];
  const taskIds = new Set<string>();
  for (const candidate of tasksRaw) {
    const task = sanitizeTask(candidate, nowMs);
    if (task === null || taskIds.has(task.id)) {
      continue;
    }

    taskIds.add(task.id);
    tasks.push(task);
  }

  const sessionsRaw = Array.isArray(input.sessions) ? input.sessions : [];
  const seenSessionIds = new Set<string>();
  const sessions: PersistedPluginState["sessions"] = [];
  for (const candidate of sessionsRaw) {
    if (!isRecord(candidate)) {
      continue;
    }

    const id = readNonEmptyString(candidate.id);
    const taskId = readNonEmptyString(candidate.taskId);
    const startMs = readFiniteNumber(candidate.startMs);
    const endMs = readFiniteNumber(candidate.endMs);

    if (
      id === null ||
      taskId === null ||
      startMs === null ||
      endMs === null ||
      endMs <= startMs ||
      !taskIds.has(taskId) ||
      seenSessionIds.has(id)
    ) {
      continue;
    }

    seenSessionIds.add(id);
    sessions.push({ id, taskId, startMs, endMs });
  }

  sessions.sort((left, right) => left.startMs - right.startMs);

  let activeTimer: PersistedPluginState["activeTimer"] = null;
  if (isRecord(input.activeTimer)) {
    const sessionId = readNonEmptyString(input.activeTimer.sessionId);
    const taskId = readNonEmptyString(input.activeTimer.taskId);
    const startMs = readFiniteNumber(input.activeTimer.startMs);
    if (sessionId !== null && taskId !== null && startMs !== null && taskIds.has(taskId)) {
      activeTimer = {
        sessionId,
        taskId,
        startMs: Math.max(0, Math.min(startMs, nowMs))
      };
    }
  }

  const alertRecordsRaw = Array.isArray(input.alertRecords) ? input.alertRecords : [];
  const seenAlertKeys = new Set<string>();
  const alertRecords: PersistedPluginState["alertRecords"] = [];
  for (const candidate of alertRecordsRaw) {
    if (!isRecord(candidate)) {
      continue;
    }

    const taskId = readNonEmptyString(candidate.taskId);
    const eventType = readNonEmptyString(candidate.eventType);
    const periodKey = readNonEmptyString(candidate.periodKey);
    const emittedAtMs = readFiniteNumber(candidate.emittedAtMs);
    if (taskId === null || eventType === null || periodKey === null || !taskIds.has(taskId)) {
      continue;
    }

    const key = makeAlertKey(taskId, eventType, periodKey);
    if (seenAlertKeys.has(key)) {
      continue;
    }

    seenAlertKeys.add(key);
    alertRecords.push({
      key,
      taskId,
      eventType,
      periodKey,
      emittedAtMs: emittedAtMs === null ? nowMs : emittedAtMs
    });
  }

  return {
    version: PERSISTED_STATE_VERSION,
    tasks,
    sessions,
    activeTimer,
    alertRecords,
    preferences: normalizeRuntimePreferences(input.preferences)
  };
}

export function parsePersistedState(jsonValue: string, nowMs: number): PersistedPluginState {
  try {
    return normalizePersistedState(JSON.parse(jsonValue), nowMs);
  } catch {
    return createDefaultPersistedState();
  }
}

export function serializePersistedState(state: PersistedPluginState): string {
  return JSON.stringify(state);
}

export function loadPersistedState(
  storage: PluginSettingsStorage,
  key: string,
  nowMs: number
): PersistedPluginState {
  const raw = storage.read(key);
  if (typeof raw !== "string") {
    return createDefaultPersistedState();
  }

  return parsePersistedState(raw, nowMs);
}

export function savePersistedState(
  storage: PluginSettingsStorage,
  key: string,
  state: PersistedPluginState
): void {
  storage.write(key, serializePersistedState(state));
}
