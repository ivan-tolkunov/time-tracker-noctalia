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
    property string formError: ""
    property string editingTaskId: ""
    property string draftTitle: ""
    property string draftDeadlineText: ""
    property string draftRecurringPeriod: ""
    property int draftRecurringTargetMinutes: 0

    implicitWidth: 420
    implicitHeight: 640

    readonly property int spacingUnit: 12
    readonly property color pageColor: "#111318"
    readonly property color cardColor: "#181c22"
    readonly property color borderColor: "#2a313b"
    readonly property color titleColor: "#f4f6fb"
    readonly property color bodyColor: "#d7dce6"
    readonly property color mutedColor: "#9ea8ba"
    readonly property color accentColor: "#5aa9ff"
    readonly property color successColor: "#56c288"
    readonly property color warningColor: "#f3b562"
    readonly property color dangerColor: "#ff7a7a"

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

    function getPanelState() {
        if (root.snapshot && root.snapshot.panel) {
            return root.snapshot.panel
        }

        return {
            "activeTaskId": null,
            "activeTaskTitle": "No active task",
            "activeElapsedMinutes": 0,
            "activeElapsedLabel": "0m",
            "canStopActiveTimer": false,
            "tasks": []
        }
    }

    function getTaskDraft() {
        return {
            "title": root.draftTitle,
            "deadlineText": root.draftDeadlineText,
            "recurringPeriod": root.draftRecurringPeriod,
            "recurringTargetMinutes": root.draftRecurringTargetMinutes
        }
    }

    function applyMutationResult(result) {
        root.formError = result && result.ok ? "" : (result && result.reason ? String(result.reason) : "action-failed")
        if (result && result.ok) {
            var bridge = root.getRuntimeBridge()
            root.clearDraft()
            if (bridge && bridge.getSnapshot) {
                root.syncSnapshot(bridge.getSnapshot())
            }
        }
    }

    function submitCreateOrUpdate() {
        var bridge = root.getRuntimeBridge()
        if (!bridge) {
            root.formError = "missing-ui-bridge"
            return
        }

        var nowMs = Date.now()
        var result = null
        if (root.editingTaskId.length > 0 && bridge.updateTaskFromDraft) {
            result = bridge.updateTaskFromDraft(root.editingTaskId, root.getTaskDraft(), nowMs)
        } else if (root.editingTaskId.length === 0 && bridge.createTaskFromDraft) {
            result = bridge.createTaskFromDraft(root.getTaskDraft(), nowMs)
        }

        root.applyMutationResult(result)
    }

    function startOrSwitchTask(taskId) {
        var bridge = root.getRuntimeBridge()
        if (!bridge) {
            return
        }

        var panelState = root.getPanelState()
        var nowMs = Date.now()
        if (panelState.canStopActiveTimer && panelState.activeTaskId !== taskId && bridge.startTask) {
            bridge.startTask(taskId, nowMs)
        } else if (!panelState.canStopActiveTimer && bridge.startTask) {
            bridge.startTask(taskId, nowMs)
        }

        if (bridge.getSnapshot) {
            root.syncSnapshot(bridge.getSnapshot())
        }
    }

    function stopActiveTask() {
        var bridge = root.getRuntimeBridge()
        if (bridge && bridge.stopActiveTimer) {
            bridge.stopActiveTimer(Date.now())
            if (bridge.getSnapshot) {
                root.syncSnapshot(bridge.getSnapshot())
            }
        }
    }

    function completeExistingTask(taskId) {
        var bridge = root.getRuntimeBridge()
        if (bridge && bridge.completeTask) {
            bridge.completeTask(taskId, Date.now())
            if (bridge.getSnapshot) {
                root.syncSnapshot(bridge.getSnapshot())
            }
        }
    }

    function deleteExistingTask(taskId) {
        var bridge = root.getRuntimeBridge()
        if (bridge && bridge.deleteTask) {
            bridge.deleteTask(taskId, Date.now())
            if (bridge.getSnapshot) {
                root.syncSnapshot(bridge.getSnapshot())
            }
            if (root.editingTaskId === taskId) {
                root.clearDraft()
            }
        }
    }

    function clearDraft() {
        root.editingTaskId = ""
        root.draftTitle = ""
        root.draftDeadlineText = ""
        root.draftRecurringPeriod = ""
        root.draftRecurringTargetMinutes = 0
    }

    function beginEdit(taskData) {
        root.editingTaskId = taskData.id
        root.draftTitle = taskData.title
        root.draftDeadlineText = taskData.deadlineDueAtMs === null ? "" : String(taskData.deadlineDueAtMs)
        root.draftRecurringPeriod = taskData.recurringPeriod === null ? "" : taskData.recurringPeriod
        root.draftRecurringTargetMinutes = taskData.recurringTargetMinutes === null ? 0 : taskData.recurringTargetMinutes
    }

    function submitDraft() {
        root.submitCreateOrUpdate()
    }

    Component.onCompleted: root.refreshFromBridge(Date.now())

    Rectangle {
        anchors.fill: parent
        color: root.pageColor
    }

    Flickable {
        anchors.fill: parent
        anchors.margins: root.spacingUnit
        contentWidth: width
        contentHeight: panelColumn.implicitHeight
        clip: true

        Column {
            id: panelColumn
            width: parent.width
            spacing: root.spacingUnit

            Rectangle {
                width: parent.width
                height: 68
                radius: 10
                color: root.cardColor
                border.width: 1
                border.color: root.borderColor

                Column {
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: 4

                    Text {
                        text: root.getPanelState().activeTaskTitle
                        color: root.titleColor
                        font.pixelSize: 16
                        font.bold: true
                        elide: Text.ElideRight
                    }

                    Row {
                        spacing: 8

                        Text {
                            text: root.getPanelState().canStopActiveTimer ? "Running" : "Stopped"
                            color: root.getPanelState().canStopActiveTimer ? root.successColor : root.mutedColor
                            font.pixelSize: 12
                            font.bold: true
                        }

                        Text {
                            text: root.getPanelState().canStopActiveTimer ? root.getPanelState().activeElapsedLabel : "0m"
                            color: root.bodyColor
                            font.pixelSize: 12
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                radius: 10
                color: root.cardColor
                border.width: 1
                border.color: root.borderColor
                implicitHeight: draftColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: draftColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: 8

                    Text {
                        text: root.editingTaskId.length > 0 ? "Edit task" : "Create task"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    TextInput {
                        id: titleInput
                        width: parent.width
                        color: root.bodyColor
                        selectedTextColor: root.pageColor
                        selectionColor: root.accentColor
                        text: root.draftTitle
                        font.pixelSize: 13
                        onTextChanged: root.draftTitle = text
                    }

                    TextInput {
                        width: parent.width
                        color: root.bodyColor
                        selectedTextColor: root.pageColor
                        selectionColor: root.accentColor
                        text: root.draftDeadlineText
                        font.pixelSize: 13
                        onTextChanged: root.draftDeadlineText = text
                    }

                    Row {
                        width: parent.width
                        spacing: 8

                        TextInput {
                            width: Math.max(120, (parent.width - parent.spacing) / 2)
                            color: root.bodyColor
                            selectedTextColor: root.pageColor
                            selectionColor: root.accentColor
                            text: root.draftRecurringPeriod
                            font.pixelSize: 13
                            onTextChanged: root.draftRecurringPeriod = text
                        }

                        TextInput {
                            width: Math.max(80, (parent.width - parent.spacing) / 2)
                            color: root.bodyColor
                            selectedTextColor: root.pageColor
                            selectionColor: root.accentColor
                            text: root.draftRecurringTargetMinutes === 0 ? "" : String(root.draftRecurringTargetMinutes)
                            font.pixelSize: 13
                            inputMethodHints: Qt.ImhDigitsOnly
                            onTextChanged: root.draftRecurringTargetMinutes = text.length === 0 ? 0 : Number(text)
                        }
                    }

                    Text {
                        visible: root.formError.length > 0
                        text: root.formError
                        color: root.dangerColor
                        font.pixelSize: 12
                    }

                    Row {
                        spacing: 8

                        Rectangle {
                            width: 88
                            height: 30
                            radius: 6
                            color: submitMouseArea.pressed ? "#478bdd" : root.accentColor

                            Text {
                                anchors.centerIn: parent
                                text: root.editingTaskId.length > 0 ? "Save" : "Create"
                                color: root.pageColor
                                font.pixelSize: 12
                                font.bold: true
                            }

                            MouseArea {
                                id: submitMouseArea
                                anchors.fill: parent
                                onClicked: root.submitDraft()
                            }
                        }

                        Rectangle {
                            visible: root.editingTaskId.length > 0
                            width: visible ? 88 : 0
                            height: 30
                            radius: 6
                            color: cancelMouseArea.pressed ? "#252b34" : "#20252d"

                            Text {
                                anchors.centerIn: parent
                                text: "Cancel"
                                color: root.bodyColor
                                font.pixelSize: 12
                            }

                            MouseArea {
                                id: cancelMouseArea
                                anchors.fill: parent
                                onClicked: root.clearDraft()
                            }
                        }

                        Rectangle {
                            visible: root.getPanelState().canStopActiveTimer
                            width: visible ? 88 : 0
                            height: 30
                            radius: 6
                            color: stopMouseArea.pressed ? "#a85353" : root.dangerColor

                            Text {
                                anchors.centerIn: parent
                                text: "Stop"
                                color: root.pageColor
                                font.pixelSize: 12
                                font.bold: true
                            }

                            MouseArea {
                                id: stopMouseArea
                                anchors.fill: parent
                                onClicked: root.stopActiveTask()
                            }
                        }
                    }
                }
            }

            Column {
                width: parent.width
                spacing: 8

                Repeater {
                    model: root.getPanelState().tasks

                    delegate: Rectangle {
                        required property var modelData

                        readonly property var taskData: modelData

                        width: panelColumn.width
                        radius: 10
                        color: root.cardColor
                        border.width: 1
                        border.color: taskData.isActive ? root.accentColor : root.borderColor
                        implicitHeight: taskColumn.implicitHeight + (root.spacingUnit * 2)

                        Column {
                            id: taskColumn
                            anchors.fill: parent
                            anchors.margins: root.spacingUnit
                            spacing: 8

                            Row {
                                width: parent.width
                                spacing: 8

                                Text {
                                    width: parent.width - 88
                                    text: taskData.title
                                    color: root.titleColor
                                    font.pixelSize: 14
                                    font.bold: true
                                    elide: Text.ElideRight
                                }

                                Text {
                                    text: taskData.isCompleted ? "Done" : (taskData.isActive ? "Active" : "Ready")
                                    color: taskData.isCompleted ? root.mutedColor : (taskData.isActive ? root.successColor : root.bodyColor)
                                    font.pixelSize: 12
                                    font.bold: true
                                }
                            }

                            Row {
                                spacing: 12

                                Text {
                                    text: "Today " + taskData.todayTrackedLabel
                                    color: root.bodyColor
                                    font.pixelSize: 12
                                }

                                Text {
                                    text: "Weekly avg " + taskData.weeklyAverageLabel
                                    color: root.bodyColor
                                    font.pixelSize: 12
                                }
                            }

                            Text {
                                text: taskData.deadlineDueAtMs === null ? "Deadline none" : ("Deadline " + String(taskData.deadlineDueAtMs))
                                color: taskData.deadlineStatus === "overdue" ? root.warningColor : root.mutedColor
                                font.pixelSize: 12
                            }

                            Text {
                                text: taskData.recurringPeriod === null ? "Recurring none" : ("Recurring " + taskData.recurringPeriod + " / " + String(taskData.recurringTargetMinutes || 0) + "m")
                                color: root.mutedColor
                                font.pixelSize: 12
                            }

                            Row {
                                spacing: 8

                                Rectangle {
                                    width: 72
                                    height: 28
                                    radius: 6
                                    color: actionMouseArea.pressed ? "#478bdd" : root.accentColor

                                Text {
                                    anchors.centerIn: parent
                                    text: taskData.isActive ? "Active" : (root.getPanelState().canStopActiveTimer ? "Switch" : "Start")
                                    color: root.pageColor
                                    font.pixelSize: 12
                                    font.bold: true
                                    }

                                    MouseArea {
                                        id: actionMouseArea
                                        anchors.fill: parent
                                        enabled: !taskData.isCompleted && !taskData.isActive
                                        onClicked: root.startOrSwitchTask(taskData.id)
                                    }
                                }

                                Rectangle {
                                    width: 72
                                    height: 28
                                    radius: 6
                                    color: editMouseArea.pressed ? "#252b34" : "#20252d"

                                    Text {
                                        anchors.centerIn: parent
                                        text: "Edit"
                                        color: root.bodyColor
                                        font.pixelSize: 12
                                    }

                                    MouseArea {
                                        id: editMouseArea
                                        anchors.fill: parent
                                        onClicked: root.beginEdit(taskData)
                                    }
                                }

                                Rectangle {
                                    width: 90
                                    height: 28
                                    radius: 6
                                    color: completeMouseArea.pressed ? "#47886f" : root.successColor

                                    Text {
                                        anchors.centerIn: parent
                                        text: "Complete"
                                        color: root.pageColor
                                        font.pixelSize: 12
                                    }

                                    MouseArea {
                                        id: completeMouseArea
                                        anchors.fill: parent
                                        enabled: !taskData.isCompleted
                                        onClicked: root.completeExistingTask(taskData.id)
                                    }
                                }

                                Rectangle {
                                    width: 72
                                    height: 28
                                    radius: 6
                                    color: deleteMouseArea.pressed ? "#a85353" : root.dangerColor

                                    Text {
                                        anchors.centerIn: parent
                                        text: "Delete"
                                        color: root.pageColor
                                        font.pixelSize: 12
                                    }

                                    MouseArea {
                                        id: deleteMouseArea
                                        anchors.fill: parent
                                        onClicked: root.deleteExistingTask(taskData.id)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
