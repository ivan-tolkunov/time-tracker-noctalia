import QtQuick 2.15

Item {
    id: root

    property var runtimeBridge: null
    property int refreshIntervalMs: 30000
    property int alertCheckIntervalMs: 60000

    function syncIntervalsFromBridge() {
        if (root.runtimeBridge && root.runtimeBridge.getSettingsState) {
            var settingsState = root.runtimeBridge.getSettingsState()
            if (settingsState) {
                root.refreshIntervalMs = settingsState.refreshIntervalMs
                root.alertCheckIntervalMs = settingsState.alertCheckIntervalMs
            }
        }
    }

    function runStartupRecovery() {
        if (root.runtimeBridge && root.runtimeBridge.initializeRuntime) {
            root.runtimeBridge.initializeRuntime(Date.now())
        }

        root.syncIntervalsFromBridge()
    }

    function runPeriodicRefresh() {
        if (root.runtimeBridge && root.runtimeBridge.runPeriodicRefresh) {
            root.runtimeBridge.runPeriodicRefresh(Date.now())
        }

        root.syncIntervalsFromBridge()
    }

    function runAlertCheck() {
        if (root.runtimeBridge && root.runtimeBridge.runAlertCheck) {
            root.runtimeBridge.runAlertCheck(Date.now())
        }

        root.syncIntervalsFromBridge()
    }

    Component.onCompleted: runStartupRecovery()

    Timer {
        id: refreshTimer
        interval: root.refreshIntervalMs
        repeat: true
        running: true
        onTriggered: root.runPeriodicRefresh()
    }

    Timer {
        id: alertTimer
        interval: root.alertCheckIntervalMs
        repeat: true
        running: true
        onTriggered: root.runAlertCheck()
    }
}
