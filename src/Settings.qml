import QtQuick 2.15
import qs.Commons

Item {
    id: root

    property var pluginApi: null
    property var uiBridge: null
    property var runtimeBridge: null
    property string formError: ""
    property string statusMessage: ""
    property string boundaryTimeText: "00:00"
    property int weekStartsOn: 1
    property string refreshIntervalSecondsText: "30"
    property bool suppressAutoSave: true

    implicitWidth: 420
    implicitHeight: 520

    readonly property int compactSpacing: Style.marginM
    readonly property int controlGap: Style.marginM
    readonly property int spacingUnit: Style.marginL
    readonly property int controlRadius: Style.radiusM
    readonly property int surfaceRadius: Style.radiusL
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

    readonly property var fallbackSettings: ({
        "boundaryTimeText": "00:00",
        "weekStartsOn": 1,
        "refreshIntervalSecondsText": "30"
    })

    function getPluginMainInstance() {
        if (typeof pluginApi !== "undefined" && pluginApi && pluginApi.mainInstance) {
            return pluginApi.mainInstance
        }

        return null
    }

    function getRuntimeBridge() {
        var mainInstance = root.getPluginMainInstance()

        if (mainInstance && mainInstance.updateSettingsFromDraft) {
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

        if (root.uiBridge && root.uiBridge.updateSettingsFromDraft) {
            return root.uiBridge
        }

        return null
    }

    function getDefaultSettings() {
        if (root.pluginApi && root.pluginApi.manifest && root.pluginApi.manifest.metadata && root.pluginApi.manifest.metadata.defaultSettings) {
            return root.pluginApi.manifest.metadata.defaultSettings
        }

        return root.fallbackSettings
    }

    function readSettingsDraft() {
        var defaults = root.getDefaultSettings()
        var pluginSettings = root.pluginApi && root.pluginApi.pluginSettings ? root.pluginApi.pluginSettings : ({})

        return {
            "boundaryTimeText": pluginSettings.boundaryTimeText !== undefined ? String(pluginSettings.boundaryTimeText) : String(defaults.boundaryTimeText),
            "weekStartsOn": Number.isInteger(pluginSettings.weekStartsOn) ? pluginSettings.weekStartsOn : defaults.weekStartsOn,
            "refreshIntervalSecondsText": pluginSettings.refreshIntervalSecondsText !== undefined ? String(pluginSettings.refreshIntervalSecondsText) : String(defaults.refreshIntervalSecondsText)
        }
    }

    function applySettingsDraft(draft) {
        root.boundaryTimeText = String(draft.boundaryTimeText)
        root.weekStartsOn = draft.weekStartsOn
        root.refreshIntervalSecondsText = String(draft.refreshIntervalSecondsText)
    }

    function getCurrentDraft() {
        return {
            "boundaryTimeText": root.boundaryTimeText,
            "weekStartsOn": root.weekStartsOn,
            "refreshIntervalSecondsText": root.refreshIntervalSecondsText
        }
    }

    function validateDraft(draft) {
        var match = /^(\d{1,2}):(\d{2})$/.exec(draft.boundaryTimeText.trim())
        if (match === null) {
            return { "ok": false, "reason": "invalid-boundary" }
        }

        var hours = Number(match[1])
        var minutes = Number(match[2])
        if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return { "ok": false, "reason": "invalid-boundary" }
        }

        if (!Number.isInteger(draft.weekStartsOn) || draft.weekStartsOn < 0 || draft.weekStartsOn > 6) {
            return { "ok": false, "reason": "invalid-week-start" }
        }

        var refreshSeconds = Number(draft.refreshIntervalSecondsText.trim())
        if (!Number.isInteger(refreshSeconds) || refreshSeconds < 1) {
            return { "ok": false, "reason": "invalid-refresh-interval" }
        }

        return { "ok": true, "reason": null }
    }

    function persistPluginSettings(draft) {
        if (!root.pluginApi) {
            return false
        }

        var existingSettings = root.pluginApi.pluginSettings ? root.pluginApi.pluginSettings : ({})
        var nextSettings = ({})
        for (var key in existingSettings) {
            nextSettings[key] = existingSettings[key]
        }

        nextSettings.boundaryTimeText = String(draft.boundaryTimeText)
        nextSettings.weekStartsOn = draft.weekStartsOn
        nextSettings.refreshIntervalSecondsText = String(draft.refreshIntervalSecondsText)
        root.pluginApi.pluginSettings = nextSettings

        if (root.pluginApi.saveSettings) {
            root.pluginApi.saveSettings()
        }

        return true
    }

    function syncRuntimeBridgeFromDraft(draft) {
        var bridge = root.getRuntimeBridge()
        if (!bridge || !bridge.updateSettingsFromDraft) {
            return { "ok": true, "reason": null, "settings": null }
        }

        return bridge.updateSettingsFromDraft(draft, Date.now())
    }

    function saveSettings() {
        var draft = root.getCurrentDraft()
        var validationResult = root.validateDraft(draft)
        if (!validationResult.ok) {
            root.formError = validationResult.reason
            root.statusMessage = ""
            return
        }

        if (!root.persistPluginSettings(draft)) {
            root.formError = "missing-plugin-api"
            root.statusMessage = ""
            return
        }

        var runtimeResult = root.syncRuntimeBridgeFromDraft(draft)
        if (runtimeResult && !runtimeResult.ok) {
            root.formError = ""
            root.statusMessage = "Settings saved; live runtime sync pending"
            root.applySettingsDraft(root.readSettingsDraft())
            return
        }

        root.formError = ""
        root.statusMessage = "Settings saved"
        root.applySettingsDraft(root.readSettingsDraft())
    }

    function reloadCurrentSettings() {
        root.formError = ""
        root.statusMessage = ""
        root.suppressAutoSave = true
        root.applySettingsDraft(root.readSettingsDraft())
        root.suppressAutoSave = false
    }

    function scheduleAutoSave() {
        if (root.suppressAutoSave) {
            return
        }

        autoSaveTimer.restart()
    }

    Component.onCompleted: root.reloadCurrentSettings()

    Timer {
        id: autoSaveTimer
        interval: 600
        repeat: false
        onTriggered: root.saveSettings()
    }

    Rectangle {
        anchors.fill: parent
        color: root.pageColor
    }

    Flickable {
        anchors.fill: parent
        anchors.margins: root.spacingUnit
        contentWidth: width
        contentHeight: settingsColumn.implicitHeight
        clip: true

        Column {
            id: settingsColumn
            width: parent.width
            spacing: root.spacingUnit

            Rectangle {
                width: parent.width
                radius: root.surfaceRadius
                color: root.cardColor
                border.width: Style.capsuleBorderWidth
                border.color: root.borderColor
                implicitHeight: heroColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: heroColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: root.compactSpacing

                    Text {
                        text: "Settings"
                        color: root.titleColor
                        font.pixelSize: 18
                        font.bold: true
                    }

                    Text {
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: "Tune the tracker cadence and logical day boundaries."
                        color: root.bodyColor
                        font.pixelSize: 12
                    }
                }
            }

            Rectangle {
                width: parent.width
                radius: root.surfaceRadius
                color: root.cardColor
                border.width: Style.capsuleBorderWidth
                border.color: root.borderColor
                implicitHeight: boundaryColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: boundaryColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: root.controlGap

                    Text {
                        text: "Workday boundary"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Text {
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: "Enter local wall-clock time as HH:MM."
                        color: root.mutedColor
                        font.pixelSize: 12
                    }

                    Rectangle {
                        width: parent.width
                        height: Style.barHeight
                        radius: root.controlRadius
                        color: root.inputFillColor
                        border.width: Style.capsuleBorderWidth
                        border.color: root.borderColor

                        TextInput {
                            anchors.fill: parent
                            anchors.margins: root.compactSpacing
                            color: root.bodyColor
                            selectedTextColor: root.accentTextColor
                            selectionColor: root.accentColor
                            text: root.boundaryTimeText
                            font.pixelSize: 13
                            onTextChanged: {
                                root.boundaryTimeText = text
                                root.scheduleAutoSave()
                            }
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                radius: root.surfaceRadius
                color: root.cardColor
                border.width: Style.capsuleBorderWidth
                border.color: root.borderColor
                implicitHeight: weekStartColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: weekStartColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: root.controlGap

                    Text {
                        text: "Week starts on"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Flow {
                        width: parent.width
                        spacing: root.controlGap

                        Repeater {
                            model: [
                                { "label": "Sun", "value": 0 },
                                { "label": "Mon", "value": 1 },
                                { "label": "Tue", "value": 2 },
                                { "label": "Wed", "value": 3 },
                                { "label": "Thu", "value": 4 },
                                { "label": "Fri", "value": 5 },
                                { "label": "Sat", "value": 6 }
                            ]

                            delegate: Rectangle {
                                required property var modelData

                                width: 48
                                height: Style.baseWidgetSize
                                radius: root.controlRadius
                                color: root.weekStartsOn === modelData.value ? root.accentColor : root.inputFillColor
                                border.width: Style.capsuleBorderWidth
                                border.color: root.weekStartsOn === modelData.value ? root.accentColor : root.borderColor

                                Text {
                                    anchors.centerIn: parent
                                    text: modelData.label
                                    color: root.weekStartsOn === modelData.value ? root.accentTextColor : root.bodyColor
                                    font.pixelSize: 12
                                    font.bold: root.weekStartsOn === modelData.value
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: {
                                        root.weekStartsOn = modelData.value
                                        root.scheduleAutoSave()
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                radius: root.surfaceRadius
                color: root.cardColor
                border.width: Style.capsuleBorderWidth
                border.color: root.borderColor
                implicitHeight: intervalColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: intervalColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: root.controlGap

                    Text {
                        text: "Refresh interval"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Rectangle {
                        width: parent.width
                        height: Style.barHeight
                        radius: root.controlRadius
                        color: root.inputFillColor
                        border.width: Style.capsuleBorderWidth
                        border.color: root.borderColor

                        TextInput {
                            anchors.fill: parent
                            anchors.margins: root.compactSpacing
                            color: root.bodyColor
                            selectedTextColor: root.accentTextColor
                            selectionColor: root.accentColor
                            text: root.refreshIntervalSecondsText
                            font.pixelSize: 13
                            inputMethodHints: Qt.ImhDigitsOnly
                            onTextChanged: {
                                root.refreshIntervalSecondsText = text
                                root.scheduleAutoSave()
                            }
                        }
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

            Text {
                visible: root.statusMessage.length > 0
                text: root.statusMessage
                color: root.successColor
                font.pixelSize: 12
                font.bold: true
            }

        }
    }
}
