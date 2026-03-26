import QtQuick 2.15
import qs.Commons

Item {
    id: root

    property var pluginApi: null
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
    property string panelSearchQuery: ""

    readonly property var geometryPlaceholder: panelContainer
    readonly property bool allowAttach: true
    property real contentPreferredWidth: 420
    property real contentPreferredHeight: 640

    implicitWidth: contentPreferredWidth
    implicitHeight: contentPreferredHeight
    anchors.fill: parent

    readonly property int microSpacing: Math.max(2, Math.round(Style.marginM / 2))
    readonly property int compactSpacing: Style.marginM
    readonly property int controlGap: Style.marginM
    readonly property int spacingUnit: Style.marginL
    readonly property int fieldHeight: Style.barHeight
    readonly property int controlRadius: Math.max(Style.radiusL, Math.round(root.fieldHeight / 2))
    readonly property int surfaceRadius: Style.radiusL + 4
    readonly property color pageColor: Color.mSurface
    readonly property color cardColor: Color.mSurfaceVariant
    readonly property color inputFillColor: Color.mSurface
    readonly property color borderColor: Style.capsuleBorderColor
    readonly property color titleColor: Color.mOnSurface
    readonly property color bodyColor: Color.mOnSurface
    readonly property color mutedColor: Color.mOnSurfaceVariant
    readonly property color accentColor: Color.mPrimary
    readonly property color accentPressedColor: Color.mHover
    readonly property color accentTextColor: Color.mOnSurface
    readonly property color successColor: Color.mPrimary
    readonly property color dangerColor: Color.mHover
    readonly property color neutralButtonColor: Color.mSurface
    readonly property color neutralButtonPressedColor: Color.mSurfaceVariant
    readonly property color dividerColor: Qt.alpha(root.borderColor, 0.75)
    readonly property bool canSubmitDraft: String(root.draftTitle).trim().length > 0

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

        if (mainInstance && mainInstance.getSnapshot && mainInstance.createTaskFromDraft) {
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

        if (root.uiBridge && root.uiBridge.getSnapshot && root.uiBridge.createTaskFromDraft) {
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
            "title": root.draftTitle
        }
    }

    function getFilteredTasks() {
        var panelState = root.getPanelState()
        var tasks = panelState.tasks || []
        var query = String(root.panelSearchQuery).trim().toLowerCase()
        if (query.length === 0) {
            return tasks
        }

        return tasks.filter(function(task) {
            if (!task || task.title === undefined || task.title === null) {
                return false
            }
            return String(task.title).toLowerCase().indexOf(query) !== -1
        })
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
    }

    function beginEdit(taskData) {
        root.editingTaskId = taskData.id
        root.draftTitle = taskData.title
    }

    function submitDraft() {
        root.submitCreateOrUpdate()
    }

    onVisibleChanged: {
        if (visible) {
            root.refreshFromBridge(Date.now())
        }
    }

    onRuntimeBridgeChanged: root.refreshFromBridge(Date.now())
    onUiBridgeChanged: root.refreshFromBridge(Date.now())

    Component.onCompleted: root.refreshFromBridge(Date.now())

    Rectangle {
        id: panelContainer
        anchors.fill: parent
        color: root.pageColor
        radius: root.surfaceRadius
        clip: true
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
                implicitHeight: activeSummaryColumn.implicitHeight + (root.spacingUnit * 2)
                radius: root.surfaceRadius
                color: root.cardColor
                border.width: Style.capsuleBorderWidth
                border.color: root.borderColor

                Column {
                    id: activeSummaryColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: root.compactSpacing

                    Text {
                        text: "Active task"
                        color: root.mutedColor
                        font.pixelSize: 12
                    }

                    Row {
                        width: parent.width
                        spacing: root.controlGap

                        Text {
                            width: parent.width - activeStateBadge.width - parent.spacing
                            text: root.getPanelState().activeTaskTitle
                            color: root.titleColor
                            font.pixelSize: 16
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        Rectangle {
                            id: activeStateBadge
                            width: Math.max(84, activeStateText.implicitWidth + (root.compactSpacing * 2))
                            height: Style.baseWidgetSize
                            radius: root.controlRadius
                            color: root.getPanelState().canStopActiveTimer
                                ? (activeStopMouseArea.pressed ? root.neutralButtonPressedColor : root.neutralButtonColor)
                                : root.inputFillColor
                            border.width: Style.capsuleBorderWidth
                            border.color: root.getPanelState().canStopActiveTimer ? root.dangerColor : root.borderColor

                            Text {
                                id: activeStateText
                                anchors.centerIn: parent
                                text: root.getPanelState().canStopActiveTimer ? "Stop" : "Stopped"
                                color: root.getPanelState().canStopActiveTimer ? root.dangerColor : root.mutedColor
                                font.pixelSize: 12
                                font.bold: true
                            }

                            MouseArea {
                                id: activeStopMouseArea
                                anchors.fill: parent
                                enabled: root.getPanelState().canStopActiveTimer
                                hoverEnabled: true
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.stopActiveTask()
                            }
                        }
                    }

                    Text {
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: root.getPanelState().canStopActiveTimer
                            ? ("Elapsed " + root.getPanelState().activeElapsedLabel)
                            : "Start a task below to begin tracking time in this session."
                        color: root.getPanelState().canStopActiveTimer ? root.bodyColor : root.mutedColor
                        font.pixelSize: 12
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                radius: 1
                color: root.dividerColor
                opacity: 0.45
            }

            Rectangle {
                width: parent.width
                radius: root.surfaceRadius
                color: root.cardColor
                border.width: Style.capsuleBorderWidth
                border.color: root.borderColor
                implicitHeight: draftColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: draftColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: root.controlGap

                    Text {
                        text: root.editingTaskId.length > 0 ? "Edit task" : "Create task"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Column {
                        width: parent.width
                        spacing: root.compactSpacing

                        Text {
                            text: "Task title"
                            color: root.titleColor
                            font.pixelSize: 12
                            font.bold: true
                        }

                        Rectangle {
                            width: parent.width
                            height: root.fieldHeight
                            radius: root.controlRadius
                            color: root.inputFillColor
                            border.width: Style.capsuleBorderWidth
                            border.color: titleInput.activeFocus ? root.accentColor : root.borderColor

                            TextInput {
                                id: titleInput
                                anchors.fill: parent
                                anchors.margins: root.compactSpacing
                                color: root.bodyColor
                                selectedTextColor: root.accentTextColor
                                selectionColor: root.accentColor
                                text: root.draftTitle
                                font.pixelSize: 13
                                onTextChanged: root.draftTitle = text
                            }

                            Text {
                                anchors.left: parent.left
                                anchors.leftMargin: root.compactSpacing
                                anchors.verticalCenter: parent.verticalCenter
                                visible: titleInput.text.length === 0
                                text: "Write a task title"
                                color: root.mutedColor
                                font.pixelSize: 13
                            }
                        }
                    }

                    Text {
                        visible: root.formError.length > 0
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: root.formError
                        color: root.dangerColor
                        font.pixelSize: 12
                    }

                    Flow {
                        width: parent.width
                        spacing: root.controlGap

                        Rectangle {
                            width: 104
                            height: Style.baseWidgetSize
                            radius: root.controlRadius
                            color: root.canSubmitDraft
                                ? (submitMouseArea.pressed
                                    ? root.accentPressedColor
                                    : (submitMouseArea.containsMouse ? Qt.lighter(root.accentColor, 1.08) : root.accentColor))
                                : root.neutralButtonPressedColor
                            border.width: Style.capsuleBorderWidth
                            border.color: root.canSubmitDraft ? root.accentColor : root.borderColor

                            Text {
                                anchors.centerIn: parent
                                text: root.editingTaskId.length > 0 ? "Save" : "Create"
                                color: root.canSubmitDraft ? root.accentTextColor : root.mutedColor
                                font.pixelSize: 12
                                font.bold: true
                            }

                            MouseArea {
                                id: submitMouseArea
                                anchors.fill: parent
                                enabled: root.canSubmitDraft
                                hoverEnabled: true
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.submitDraft()
                            }
                        }

                        Rectangle {
                            visible: root.editingTaskId.length > 0
                            width: visible ? 96 : 0
                            height: Style.baseWidgetSize
                            radius: root.controlRadius
                            color: cancelMouseArea.pressed ? root.neutralButtonPressedColor : root.neutralButtonColor
                            border.width: Style.capsuleBorderWidth
                            border.color: root.borderColor

                            Text {
                                anchors.centerIn: parent
                                text: "Cancel"
                                color: root.bodyColor
                                font.pixelSize: 12
                            }

                            MouseArea {
                                id: cancelMouseArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.clearDraft()
                            }
                        }

                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                radius: 1
                color: root.dividerColor
                opacity: 0.45
            }

            Column {
                id: tasksSection
                width: parent.width
                spacing: root.controlGap

                Text {
                    text: "Tasks"
                    color: root.titleColor
                    font.pixelSize: 15
                    font.bold: true
                }

                Rectangle {
                    width: parent.width
                    height: root.fieldHeight
                    radius: root.controlRadius
                    color: root.inputFillColor
                    border.width: Style.capsuleBorderWidth
                    border.color: searchInput.activeFocus ? root.accentColor : root.borderColor

                    TextInput {
                        id: searchInput
                        anchors.fill: parent
                        anchors.margins: root.compactSpacing
                        color: root.bodyColor
                        selectedTextColor: root.accentTextColor
                        selectionColor: root.accentColor
                        text: root.panelSearchQuery
                        font.pixelSize: 13
                        onTextChanged: root.panelSearchQuery = text
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.leftMargin: root.compactSpacing
                        anchors.verticalCenter: parent.verticalCenter
                        visible: searchInput.text.length === 0
                        text: "Search tasks by title"
                        color: root.mutedColor
                        font.pixelSize: 13
                    }
                }

                Text {
                    visible: root.getPanelState().tasks.length === 0
                    width: parent.width
                    wrapMode: Text.WordWrap
                    text: "No tasks yet. Create one above to start tracking time."
                    color: root.mutedColor
                    font.pixelSize: 12
                }

                Text {
                    visible: root.getPanelState().tasks.length > 0 && taskRepeater.count === 0
                    width: parent.width
                    wrapMode: Text.WordWrap
                    text: "No tasks match your search."
                    color: root.mutedColor
                    font.pixelSize: 12
                }

                Repeater {
                    id: taskRepeater
                    model: root.getFilteredTasks()

                    delegate: Rectangle {
                        required property var modelData

                        readonly property var taskData: modelData

                        width: panelColumn.width
                        radius: root.surfaceRadius
                        color: root.cardColor
                        border.width: Style.capsuleBorderWidth
                        border.color: taskData.isActive ? root.accentColor : root.borderColor
                        implicitHeight: taskColumn.implicitHeight + (root.spacingUnit * 2)

                        Column {
                            id: taskColumn
                            anchors.fill: parent
                            anchors.margins: root.spacingUnit
                            spacing: root.controlGap

                            Row {
                                width: parent.width
                                spacing: root.controlGap

                                Text {
                                    width: parent.width - taskStateBadge.width - parent.spacing
                                    text: taskData.title
                                    color: root.titleColor
                                    font.pixelSize: 14
                                    font.bold: true
                                    elide: Text.ElideRight
                                }

                                Rectangle {
                                    id: taskStateBadge
                                    width: taskStateText.implicitWidth + (root.compactSpacing * 2)
                                    height: Style.baseWidgetSize
                                    radius: root.controlRadius
                                    color: root.inputFillColor
                                    border.width: Style.capsuleBorderWidth
                                    border.color: taskData.isActive ? root.successColor : (taskData.isCompleted ? root.borderColor : root.accentColor)

                                    Text {
                                        id: taskStateText
                                        anchors.centerIn: parent
                                        text: taskData.isCompleted ? "Done" : (taskData.isActive ? "Activated" : "Ready")
                                        color: taskData.isCompleted ? root.mutedColor : (taskData.isActive ? root.successColor : root.bodyColor)
                                        font.pixelSize: 12
                                        font.bold: true
                                    }
                                }
                            }

                            Flow {
                                id: taskMetaFlow
                                width: parent.width
                                spacing: root.controlGap

                                Rectangle {
                                    width: Math.max(120, (taskMetaFlow.width - taskMetaFlow.spacing) / 2)
                                    radius: root.controlRadius
                                    color: root.inputFillColor
                                    border.width: Style.capsuleBorderWidth
                                    border.color: root.borderColor
                                    implicitHeight: todayMetaColumn.implicitHeight + (root.compactSpacing * 2)

                                    Column {
                                        id: todayMetaColumn
                                        anchors.fill: parent
                                        anchors.margins: root.compactSpacing
                                        spacing: root.microSpacing

                                        Text {
                                            text: "Today"
                                            color: root.mutedColor
                                            font.pixelSize: 12
                                        }

                                        Text {
                                            text: taskData.todayTrackedLabel
                                            color: root.bodyColor
                                            font.pixelSize: 13
                                            font.bold: true
                                        }
                                    }
                                }

                                Rectangle {
                                    width: Math.max(120, (taskMetaFlow.width - taskMetaFlow.spacing) / 2)
                                    radius: root.controlRadius
                                    color: root.inputFillColor
                                    border.width: Style.capsuleBorderWidth
                                    border.color: root.borderColor
                                    implicitHeight: weeklyMetaColumn.implicitHeight + (root.compactSpacing * 2)

                                    Column {
                                        id: weeklyMetaColumn
                                        anchors.fill: parent
                                        anchors.margins: root.compactSpacing
                                        spacing: root.microSpacing

                                        Text {
                                            text: "Weekly avg"
                                            color: root.mutedColor
                                            font.pixelSize: 12
                                        }

                                        Text {
                                            text: taskData.weeklyAverageLabel
                                            color: root.bodyColor
                                            font.pixelSize: 13
                                            font.bold: true
                                        }
                                    }
                                }
                            }

                            Rectangle {
                                width: parent.width
                                height: 1
                                radius: 1
                                color: root.dividerColor
                                opacity: 0.35
                            }

                            Flow {
                                width: parent.width
                                spacing: root.controlGap

                                Rectangle {
                                    width: 80
                                    height: Style.baseWidgetSize
                                    radius: root.controlRadius
                                    color: actionMouseArea.enabled
                                        ? (actionMouseArea.pressed ? root.accentPressedColor : root.accentColor)
                                        : root.neutralButtonColor
                                    border.width: Style.capsuleBorderWidth
                                    border.color: actionMouseArea.enabled ? root.accentColor : root.borderColor

                                    Text {
                                        anchors.centerIn: parent
                                        text: taskData.isActive ? "Activated" : (root.getPanelState().canStopActiveTimer ? "Switch" : "Start")
                                        color: actionMouseArea.enabled ? root.accentTextColor : root.mutedColor
                                        font.pixelSize: 12
                                        font.bold: true
                                    }

                                    MouseArea {
                                        id: actionMouseArea
                                        anchors.fill: parent
                                        enabled: !taskData.isCompleted && !taskData.isActive
                                        hoverEnabled: true
                                        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                        onClicked: root.startOrSwitchTask(taskData.id)
                                    }
                                }

                                Rectangle {
                                    width: 80
                                    height: Style.baseWidgetSize
                                    radius: root.controlRadius
                                    color: editMouseArea.pressed
                                        ? root.neutralButtonPressedColor
                                        : (editMouseArea.containsMouse ? root.inputFillColor : root.neutralButtonColor)
                                    border.width: Style.capsuleBorderWidth
                                    border.color: root.borderColor

                                    Text {
                                        anchors.centerIn: parent
                                        text: "Edit"
                                        color: root.bodyColor
                                        font.pixelSize: 12
                                    }

                                    MouseArea {
                                        id: editMouseArea
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.beginEdit(taskData)
                                    }
                                }

                                Rectangle {
                                    width: 80
                                    height: Style.baseWidgetSize
                                    radius: root.controlRadius
                                    color: deleteMouseArea.pressed
                                        ? root.neutralButtonPressedColor
                                        : (deleteMouseArea.containsMouse ? root.inputFillColor : root.neutralButtonColor)
                                    border.width: Style.capsuleBorderWidth
                                    border.color: root.dangerColor

                                    Text {
                                        anchors.centerIn: parent
                                        text: "Delete"
                                        color: root.dangerColor
                                        font.pixelSize: 12
                                    }

                                    MouseArea {
                                        id: deleteMouseArea
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
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
