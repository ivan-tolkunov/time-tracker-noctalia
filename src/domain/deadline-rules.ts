import type { DeadlineStatus, Task } from "../types.js";

export function isTaskOverdue(task: Task, nowMs: number): boolean {
  if (task.deadline === undefined) {
    return false;
  }

  if (task.completedAtMs !== undefined) {
    return false;
  }

  return nowMs > task.deadline.dueAtMs;
}

export function getDeadlineStatus(task: Task, nowMs: number): DeadlineStatus {
  if (task.deadline === undefined) {
    return "none";
  }

  if (task.completedAtMs !== undefined) {
    return "completed";
  }

  return isTaskOverdue(task, nowMs) ? "overdue" : "pending";
}
