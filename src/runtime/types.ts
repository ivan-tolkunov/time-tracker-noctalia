import type { ActiveTimer, AlertRecord, Session, Task } from "../types.js";
import type { WorkdayOptions } from "../domain/workday.js";

export const PERSISTED_STATE_VERSION = 1;

export interface RuntimePreferences extends WorkdayOptions {
  boundaryMinuteOfDay: number;
  weekStartsOn: NonNullable<WorkdayOptions["weekStartsOn"]>;
  refreshIntervalMs: number;
  alertCheckIntervalMs: number;
}

export interface PersistedPluginState {
  version: typeof PERSISTED_STATE_VERSION;
  tasks: Task[];
  sessions: Session[];
  activeTimer: ActiveTimer | null;
  alertRecords: AlertRecord[];
  preferences: RuntimePreferences;
}

export interface RuntimeState {
  tasks: Task[];
  timerState: {
    active: ActiveTimer | null;
    sessions: Session[];
  };
  alertRecords: AlertRecord[];
  preferences: RuntimePreferences;
}

export interface PluginSettingsStorage {
  read(key: string): string | null | undefined;
  write(key: string, value: string): void;
}

export interface RuntimeAlertEvent {
  key: string;
  taskId: string;
  eventType: "deadline-overdue" | "recurring-missed";
  periodKey: string;
  emittedAtMs: number;
}
