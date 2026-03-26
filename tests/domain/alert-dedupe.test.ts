import { describe, expect, it } from "vitest";

import {
  hasAlertBeenEmitted,
  makeAlertKey,
  recordAlertIfNew
} from "../../src/domain/alert-dedupe.js";
import type { AlertRecord } from "../../src/types.js";

describe("alert deduplication", () => {
  it("deduplicates by task + event + period", () => {
    const records: AlertRecord[] = [];

    const first = recordAlertIfNew(records, "task-a", "deadline-overdue", "2026-03-10", 1000);
    expect(first.emitted).toBe(true);
    expect(first.records).toHaveLength(1);

    const second = recordAlertIfNew(
      first.records,
      "task-a",
      "deadline-overdue",
      "2026-03-10",
      2000
    );

    expect(second.emitted).toBe(false);
    expect(second.records).toHaveLength(1);
    expect(
      hasAlertBeenEmitted(second.records, "task-a", "deadline-overdue", "2026-03-10")
    ).toBe(true);
  });

  it("allows alerts for different periods or event types", () => {
    const first = recordAlertIfNew([], "task-a", "deadline-overdue", "2026-03-10", 1000);
    const second = recordAlertIfNew(
      first.records,
      "task-a",
      "deadline-overdue",
      "2026-03-11",
      2000
    );
    const third = recordAlertIfNew(second.records, "task-a", "recurring-missed", "2026-03-11", 3000);

    expect(second.emitted).toBe(true);
    expect(third.emitted).toBe(true);
    expect(third.records).toHaveLength(3);
    expect(makeAlertKey("task-a", "recurring-missed", "2026-03-11")).toBe(
      "task-a::recurring-missed::2026-03-11"
    );
  });
});
