export type TaskId = string;
export type SessionId = string;

export type RecurringPeriod = "daily" | "weekly";

export interface DeadlineRule {
  dueAtMs: number;
}

export interface RecurringRule {
  period: RecurringPeriod;
  targetMinutes: number;
}

export interface Task {
  id: TaskId;
  title: string;
  createdAtMs: number;
  completedAtMs?: number;
  deadline?: DeadlineRule;
  recurring?: RecurringRule;
}

export interface Session {
  id: SessionId;
  taskId: TaskId;
  startMs: number;
  endMs: number;
}

export interface ActiveTimer {
  sessionId: SessionId;
  taskId: TaskId;
  startMs: number;
}

export interface TimerState {
  active: ActiveTimer | null;
  sessions: Session[];
}

export type DeadlineStatus = "none" | "pending" | "overdue" | "completed";

export interface AlertRecord {
  key: string;
  taskId: TaskId;
  eventType: string;
  periodKey: string;
  emittedAtMs: number;
}
