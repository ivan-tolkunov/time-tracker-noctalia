import type { AlertRecord, TaskId } from "../types.js";

export function makeAlertKey(taskId: TaskId, eventType: string, periodKey: string): string {
  return `${taskId}::${eventType}::${periodKey}`;
}

export function hasAlertBeenEmitted(
  records: AlertRecord[],
  taskId: TaskId,
  eventType: string,
  periodKey: string
): boolean {
  const key = makeAlertKey(taskId, eventType, periodKey);
  return records.some((record) => record.key === key);
}

export function recordAlertIfNew(
  records: AlertRecord[],
  taskId: TaskId,
  eventType: string,
  periodKey: string,
  emittedAtMs: number
): { records: AlertRecord[]; emitted: boolean; key: string } {
  const key = makeAlertKey(taskId, eventType, periodKey);
  if (records.some((record) => record.key === key)) {
    return { records, emitted: false, key };
  }

  return {
    records: [
      ...records,
      {
        key,
        taskId,
        eventType,
        periodKey,
        emittedAtMs
      }
    ],
    emitted: true,
    key
  };
}
