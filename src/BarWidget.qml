import QtQuick 2.15

Item {
    id: root

    property var uiBridge: null
    property var runtimeBridge: null
    property var snapshot: ({
        "bar": {
            "hasActiveTask": false,
            "activeTaskId": null,
            "activeTaskTitle": "No active task",
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

    signal panelOpenRequested()

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
        if (root.runtimeBridge) {
            return root.runtimeBridge
        }

        if (root.uiBridge) {
            return root.uiBridge
        }

        if (mainInstance && mainInstance.runtimeBridge) {
            return mainInstance.runtimeBridge
        }

        return null
    }

    function refreshFromBridge(nowMs) {
        var bridge = root.getRuntimeBridge()
        if (bridge && bridge.runPeriodicRefresh) {
            root.syncSnapshot(bridge.runPeriodicRefresh(nowMs))
            return root.snapshot
        }

        if (bridge && bridge.getSnapshot) {
            root.syncSnapshot(bridge.getSnapshot())
        }

        return root.snapshot
    }

    function requestOpenPanel(nowMs) {
        var bridge = root.getRuntimeBridge()
        if (bridge && bridge.requestPanelOpen) {
            bridge.requestPanelOpen(nowMs)
        }

        root.panelOpenRequested()
    }

    Component.onCompleted: root.refreshFromBridge(Date.now())

    implicitWidth: 240
    implicitHeight: Math.max(summaryColumn.implicitHeight, openPanelButton.height) + (padding * 2)

    readonly property int padding: 10
    readonly property color backgroundColor: "#16181d"
    readonly property color borderColor: "#2f343d"
    readonly property color titleColor: "#f4f6fb"
    readonly property color mutedColor: "#a8b0bf"
    readonly property color accentColor: "#5aa9ff"

    Rectangle {
        id: barBackground
        anchors.fill: parent
        radius: 8
        color: root.backgroundColor
        border.width: 1
        border.color: root.borderColor
    }

    Row {
        id: barRow
        anchors.fill: parent
        anchors.margins: root.padding
        spacing: 12

        Column {
            id: summaryColumn
            width: Math.max(0, root.width - openPanelButton.width - barRow.spacing - (root.padding * 2))
            spacing: 2

            Text {
                width: parent.width
                text: root.snapshot && root.snapshot.bar ? root.snapshot.bar.activeTaskTitle : "No active task"
                color: root.titleColor
                font.pixelSize: 14
                font.bold: true
                elide: Text.ElideRight
            }

            Text {
                width: parent.width
                text: root.snapshot && root.snapshot.bar && root.snapshot.bar.hasActiveTask
                    ? root.snapshot.bar.todayTrackedLabel
                    : "No timer running"
                color: root.mutedColor
                font.pixelSize: 12
                elide: Text.ElideRight
            }
        }

        Rectangle {
            id: openPanelButton
            width: 64
            height: 30
            radius: 6
            color: openPanelMouseArea.pressed ? "#478bdd" : root.accentColor

            Text {
                anchors.centerIn: parent
                text: "Panel"
                color: "#0d1117"
                font.pixelSize: 12
                font.bold: true
            }

            MouseArea {
                id: openPanelMouseArea
                anchors.fill: parent
                onClicked: root.requestOpenPanel(Date.now())
            }
        }
    }
}
