import type { ActiveTimer, Session, Task } from "../types.js";
import type { WorkdayOptions } from "../domain/workday.js";

export const PERSISTED_STATE_VERSION = 1;

export interface RuntimePreferences extends WorkdayOptions {
  boundaryMinuteOfDay: number;
  weekStartsOn: NonNullable<WorkdayOptions["weekStartsOn"]>;
  refreshIntervalMs: number;
}

export interface PersistedPluginState {
  version: typeof PERSISTED_STATE_VERSION;
  tasks: Task[];
  sessions: Session[];
  activeTimer: ActiveTimer | null;
  preferences: RuntimePreferences;
}

export interface RuntimeState {
  tasks: Task[];
  timerState: {
    active: ActiveTimer | null;
    sessions: Session[];
  };
  preferences: RuntimePreferences;
}

export interface PluginSettingsStorage {
  read(key: string): string | null | undefined;
  write(key: string, value: string): void;
}
