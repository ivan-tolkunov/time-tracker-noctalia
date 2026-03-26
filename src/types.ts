export type TaskId = string;
export type SessionId = string;

export interface Task {
  id: TaskId;
  title: string;
  createdAtMs: number;
  completedAtMs?: number;
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
