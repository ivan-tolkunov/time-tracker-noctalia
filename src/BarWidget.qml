import QtQuick 2.15
import QtQuick.Effects
import qs.Commons

Item {
    id: root

    property var pluginApi: null
    property var screen: null
    property string widgetId: ""
    property string section: ""
    property var uiBridge: null
    property var runtimeBridge: null
    property var snapshot: ({
        "bar": {
            "hasActiveTask": false,
            "activeTaskId": null,
            "activeTaskTitle": "No active task",
            "activeElapsedMinutes": 0,
            "activeElapsedLabel": "0m",
            "todayTrackedMinutes": 0,
            "todayTrackedLabel": "0m today"
        },
        "panel": {
            "activeTaskId": null,
            "activeTaskTitle": "No active task",
            "activeElapsedMinutes": 0,
            "activeElapsedLabel": "0m",
            "canStopActiveTimer": false,
            "tasks": []
        }
    })

    function syncSnapshot(nextSnapshot) {
        if (nextSnapshot) {
            root.snapshot = nextSnapshot
        }
    }

    function getPluginMainInstance() {
        if (typeof pluginApi !== "undefined" && pluginApi && pluginApi.mainInstance) {
            return pluginApi.mainInstance
        }

        return null
    }

    function getRuntimeBridge() {
        var mainInstance = root.getPluginMainInstance()

        if (mainInstance && mainInstance.getSnapshot && mainInstance.runPeriodicRefresh) {
            return mainInstance
        }

        if (mainInstance && mainInstance.runtimeBridge) {
            return mainInstance.runtimeBridge
        }

        if (mainInstance && mainInstance.ensureSharedRuntimeBridge) {
            var ensuredBridge = mainInstance.ensureSharedRuntimeBridge()
            if (ensuredBridge) {
                return ensuredBridge
            }
        }

        if (root.runtimeBridge) {
            return root.runtimeBridge
        }

        if (root.uiBridge && root.uiBridge.getSnapshot && root.uiBridge.runPeriodicRefresh) {
            return root.uiBridge
        }

        return null
    }

    function refreshFromBridge(nowMs) {
        var bridge = root.getRuntimeBridge()
        if (bridge && bridge.runPeriodicRefresh) {
            bridge.runPeriodicRefresh(nowMs)
            if (bridge.getSnapshot) {
                root.syncSnapshot(bridge.getSnapshot())
                return root.snapshot
            }
        }

        if (bridge && bridge.getSnapshot) {
            root.syncSnapshot(bridge.getSnapshot())
        }

        return root.snapshot
    }

    function openPanel() {
        if (root.pluginApi && root.screen && root.pluginApi.openPanel) {
            root.pluginApi.openPanel(root.screen, root)
        }
    }

    function getFallbackActiveTaskFromSettings(nowMs) {
        if (!root.pluginApi || !root.pluginApi.pluginSettings || !root.pluginApi.pluginSettings.trackerState) {
            return null
        }

        var trackerState = root.pluginApi.pluginSettings.trackerState
        var activeTimer = trackerState.activeTimer
        if (!activeTimer || !activeTimer.taskId || !Number.isFinite(activeTimer.startMs)) {
            return null
        }

        var tasks = Array.isArray(trackerState.tasks) ? trackerState.tasks : []
        var title = "Active task"
        for (var index = 0; index < tasks.length; index += 1) {
            var task = tasks[index]
            if (task && task.id === activeTimer.taskId && task.title) {
                title = String(task.title)
                break
            }
        }

        var elapsedMinutes = Math.max(0, Math.floor((nowMs - activeTimer.startMs) / 60000))
        var elapsedLabel = elapsedMinutes < 60
            ? (String(elapsedMinutes) + "m")
            : (String(Math.floor(elapsedMinutes / 60)) + "h " + String(elapsedMinutes % 60) + "m")

        return {
            "title": title,
            "elapsedLabel": elapsedLabel
        }
    }

    onRuntimeBridgeChanged: root.refreshFromBridge(Date.now())
    onUiBridgeChanged: root.refreshFromBridge(Date.now())

    Component.onCompleted: root.refreshFromBridge(Date.now())

    implicitWidth: root.contentWidth
    implicitHeight: root.contentHeight

    readonly property string screenName: root.screen && root.screen.name ? root.screen.name : ""
    readonly property string barPosition: Settings.getBarPositionForScreen(root.screenName)
    readonly property bool barIsVertical: root.barPosition === "left" || root.barPosition === "right"
    readonly property int capsuleHeight: root.screenName.length > 0 ? Style.getCapsuleHeightForScreen(root.screenName) : Style.capsuleHeight
    readonly property int barFontSize: root.screenName.length > 0 ? Style.getBarFontSizeForScreen(root.screenName) : Style.barFontSize
    readonly property int capsulePadding: Style.marginM
    readonly property int clockIconSize: Math.max(12, root.barFontSize + 1)
    readonly property int minimumCapsuleWidth: root.snapshot && root.snapshot.bar && root.snapshot.bar.hasActiveTask
        ? Math.max(Style.baseWidgetSize * 3, root.capsuleHeight * 3)
        : root.capsuleHeight
    readonly property int maximumCapsuleWidth: Math.max(Style.baseWidgetSize * 9, root.capsuleHeight * 9)
    readonly property int capsuleWidth: Math.max(
        root.minimumCapsuleWidth,
        Math.min(root.maximumCapsuleWidth, Math.ceil(Math.max(summaryText.implicitWidth, root.clockIconSize) + (root.capsulePadding * 2)))
    )
    readonly property int contentWidth: root.barIsVertical ? root.capsuleHeight : root.capsuleWidth
    readonly property int contentHeight: root.capsuleHeight
    readonly property color dangerColor: Color.mHover

    Rectangle {
        id: barBackground
        x: Style.pixelAlignCenter(parent.width, width)
        y: Style.pixelAlignCenter(parent.height, height)
        width: root.contentWidth
        height: root.contentHeight
        radius: Style.radiusL
        color: widgetMouseArea.containsMouse ? Color.mHover : Style.capsuleColor
        border.width: Style.capsuleBorderWidth
        border.color: Style.capsuleBorderColor
    }

    Image {
        id: clockIcon
        anchors.centerIn: barBackground
        source: Qt.resolvedUrl("assets/clock.svg")
        width: root.clockIconSize
        height: root.clockIconSize
        fillMode: Image.PreserveAspectFit
        smooth: true
        sourceSize: Qt.size(width, height)
        visible: summaryText.text.length === 0
        layer.enabled: true
        layer.effect: MultiEffect {
            colorization: 1.0
            colorizationColor: summaryText.color
        }
    }

    Text {
        id: summaryText
        anchors.centerIn: barBackground
        width: Math.max(1, barBackground.width - (root.capsulePadding * 2))
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        text: {
            var title = root.snapshot && root.snapshot.bar
                ? root.snapshot.bar.activeTaskTitle
                : ""
            var hasActive = root.snapshot && root.snapshot.bar && root.snapshot.bar.hasActiveTask

            if (hasActive) {
                var elapsedLabel = root.snapshot.bar.activeElapsedLabel
                    ? root.snapshot.bar.activeElapsedLabel
                    : root.snapshot.bar.todayTrackedLabel
                return title + " · " + elapsedLabel
            }

            var fallback = root.getFallbackActiveTaskFromSettings(Date.now())
            if (fallback) {
                return fallback.title + " · " + fallback.elapsedLabel
            }

            return ""
        }
        color: widgetMouseArea.containsMouse ? Color.mOnHover : root.dangerColor
        font.pixelSize: root.barFontSize + 3
        font.bold: false
        elide: Text.ElideRight
        visible: text.length > 0
    }

    MouseArea {
        id: widgetMouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.openPanel()
    }

    Timer {
        id: barRefreshTimer
        interval: 1000
        repeat: true
        running: true
        onTriggered: root.refreshFromBridge(Date.now())
    }
}
