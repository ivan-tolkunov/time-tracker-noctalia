## TODOs

- [x] M1: Scaffold the Noctalia plugin project with manifest, package metadata, TypeScript test harness, and placeholder QML entrypoints.
- [x] M2: Implement the core domain modules for task/session types, timer engine, workday boundary math, deadline rules, recurring rules, weekly average math, and alert deduplication with domain tests.
- [x] M3: Implement persistence and the Main.qml orchestration layer, including state loading, startup recovery, periodic refresh, and exposed actions/selectors, with persistence/reload tests.
- [x] M4: Implement BarWidget.qml and Panel.qml for the v1 UI flows, with integration tests for bar rendering, panel actions, and shared state wiring.
- [x] M5: Implement Settings.qml and final plugin polish needed for the scoped v1, then run broad verification.

## Final Verification Wave

- [x] F1: Domain logic reviewer approves timer, workday, deadline, recurring, and weekly-average behavior.
- [x] F2: Persistence/runtime reviewer approves recovery, deduplication, and Main.qml orchestration.
- [x] F3: UI reviewer approves BarWidget, Panel, and Settings behavior against the spec.
- [x] F4: Build/test reviewer approves the full verification suite and confirms no scope creep.
