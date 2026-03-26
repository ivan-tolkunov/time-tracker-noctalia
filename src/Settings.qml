import QtQuick 2.15

Item {
    id: root

    property var uiBridge: null
    property var runtimeBridge: null
    property string formError: ""
    property string statusMessage: ""
    property string boundaryTimeText: "00:00"
    property int weekStartsOn: 1
    property string refreshIntervalSecondsText: "30"
    property string alertCheckIntervalSecondsText: "60"

    implicitWidth: 420
    implicitHeight: 520

    readonly property int spacingUnit: 12
    readonly property color pageColor: "#111318"
    readonly property color cardColor: "#181c22"
    readonly property color borderColor: "#2a313b"
    readonly property color titleColor: "#f4f6fb"
    readonly property color bodyColor: "#d7dce6"
    readonly property color mutedColor: "#9ea8ba"
    readonly property color accentColor: "#5aa9ff"
    readonly property color successColor: "#56c288"
    readonly property color dangerColor: "#ff7a7a"

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

    function syncFromBridge() {
        var bridge = root.getRuntimeBridge()
        if (!bridge || !bridge.getSettingsState) {
            return null
        }

        var settingsState = bridge.getSettingsState()
        if (!settingsState) {
            return null
        }

        root.boundaryTimeText = settingsState.boundaryTimeText
        root.weekStartsOn = settingsState.weekStartsOn
        root.refreshIntervalSecondsText = String(settingsState.refreshIntervalSeconds)
        root.alertCheckIntervalSecondsText = String(settingsState.alertCheckIntervalSeconds)
        return settingsState
    }

    function submitSettings() {
        var bridge = root.getRuntimeBridge()
        if (!bridge || !bridge.updateSettingsFromDraft) {
            root.formError = "missing-settings-bridge"
            root.statusMessage = ""
            return
        }

        var result = bridge.updateSettingsFromDraft(
            {
                "boundaryTimeText": root.boundaryTimeText,
                "weekStartsOn": root.weekStartsOn,
                "refreshIntervalSecondsText": root.refreshIntervalSecondsText,
                "alertCheckIntervalSecondsText": root.alertCheckIntervalSecondsText
            },
            Date.now()
        )

        if (!result || !result.ok) {
            root.formError = result && result.reason ? String(result.reason) : "settings-update-failed"
            root.statusMessage = ""
            return
        }

        root.formError = ""
        root.statusMessage = "Settings saved"
        root.syncFromBridge()
    }

    function reloadCurrentSettings() {
        root.formError = ""
        root.statusMessage = ""
        root.syncFromBridge()
    }

    Component.onCompleted: root.reloadCurrentSettings()

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
                radius: 10
                color: root.cardColor
                border.width: 1
                border.color: root.borderColor
                implicitHeight: heroColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: heroColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: 6

                    Text {
                        text: "Settings"
                        color: root.titleColor
                        font.pixelSize: 18
                        font.bold: true
                    }

                    Text {
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: "Tune the v1 tracker cadence and logical day boundaries. Values save through the existing runtime preferences model."
                        color: root.bodyColor
                        font.pixelSize: 12
                    }
                }
            }

            Rectangle {
                width: parent.width
                radius: 10
                color: root.cardColor
                border.width: 1
                border.color: root.borderColor
                implicitHeight: boundaryColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: boundaryColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: 8

                    Text {
                        text: "Workday boundary"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Text {
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: "Enter local wall-clock time as HH:MM. Example: 04:00 starts each logical day at 4 AM."
                        color: root.mutedColor
                        font.pixelSize: 12
                    }

                    Rectangle {
                        width: parent.width
                        height: 40
                        radius: 8
                        color: "#20252d"
                        border.width: 1
                        border.color: root.borderColor

                        TextInput {
                            anchors.fill: parent
                            anchors.margins: 10
                            color: root.bodyColor
                            selectedTextColor: root.pageColor
                            selectionColor: root.accentColor
                            text: root.boundaryTimeText
                            font.pixelSize: 13
                            onTextChanged: root.boundaryTimeText = text
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
                implicitHeight: weekStartColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: weekStartColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: 8

                    Text {
                        text: "Week starts on"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Flow {
                        width: parent.width
                        spacing: 8

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
                                height: 30
                                radius: 6
                                color: root.weekStartsOn === modelData.value ? root.accentColor : "#20252d"
                                border.width: 1
                                border.color: root.weekStartsOn === modelData.value ? root.accentColor : root.borderColor

                                Text {
                                    anchors.centerIn: parent
                                    text: modelData.label
                                    color: root.weekStartsOn === modelData.value ? root.pageColor : root.bodyColor
                                    font.pixelSize: 12
                                    font.bold: root.weekStartsOn === modelData.value
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: root.weekStartsOn = modelData.value
                                }
                            }
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
                implicitHeight: intervalColumn.implicitHeight + (root.spacingUnit * 2)

                Column {
                    id: intervalColumn
                    anchors.fill: parent
                    anchors.margins: root.spacingUnit
                    spacing: 8

                    Text {
                        text: "Runtime intervals"
                        color: root.titleColor
                        font.pixelSize: 15
                        font.bold: true
                    }

                    Row {
                        width: parent.width
                        spacing: 8

                        Column {
                            width: Math.max(120, (parent.width - parent.spacing) / 2)
                            spacing: 6

                            Text {
                                text: "Refresh seconds"
                                color: root.mutedColor
                                font.pixelSize: 12
                            }

                            Rectangle {
                                width: parent.width
                                height: 40
                                radius: 8
                                color: "#20252d"
                                border.width: 1
                                border.color: root.borderColor

                                TextInput {
                                    anchors.fill: parent
                                    anchors.margins: 10
                                    color: root.bodyColor
                                    selectedTextColor: root.pageColor
                                    selectionColor: root.accentColor
                                    text: root.refreshIntervalSecondsText
                                    font.pixelSize: 13
                                    inputMethodHints: Qt.ImhDigitsOnly
                                    onTextChanged: root.refreshIntervalSecondsText = text
                                }
                            }
                        }

                        Column {
                            width: Math.max(120, (parent.width - parent.spacing) / 2)
                            spacing: 6

                            Text {
                                text: "Alert seconds"
                                color: root.mutedColor
                                font.pixelSize: 12
                            }

                            Rectangle {
                                width: parent.width
                                height: 40
                                radius: 8
                                color: "#20252d"
                                border.width: 1
                                border.color: root.borderColor

                                TextInput {
                                    anchors.fill: parent
                                    anchors.margins: 10
                                    color: root.bodyColor
                                    selectedTextColor: root.pageColor
                                    selectionColor: root.accentColor
                                    text: root.alertCheckIntervalSecondsText
                                    font.pixelSize: 13
                                    inputMethodHints: Qt.ImhDigitsOnly
                                    onTextChanged: root.alertCheckIntervalSecondsText = text
                                }
                            }
                        }
                    }

                    Text {
                        width: parent.width
                        wrapMode: Text.WordWrap
                        text: "Intervals are stored in milliseconds internally, but edited here in seconds to match the current v1 defaults."
                        color: root.mutedColor
                        font.pixelSize: 12
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

            Row {
                spacing: 8

                Rectangle {
                    width: 96
                    height: 32
                    radius: 6
                    color: saveMouseArea.pressed ? "#478bdd" : root.accentColor

                    Text {
                        anchors.centerIn: parent
                        text: "Save"
                        color: root.pageColor
                        font.pixelSize: 12
                        font.bold: true
                    }

                    MouseArea {
                        id: saveMouseArea
                        anchors.fill: parent
                        onClicked: root.submitSettings()
                    }
                }

                Rectangle {
                    width: 120
                    height: 32
                    radius: 6
                    color: reloadMouseArea.pressed ? "#252b34" : "#20252d"

                    Text {
                        anchors.centerIn: parent
                        text: "Reload current"
                        color: root.bodyColor
                        font.pixelSize: 12
                    }

                    MouseArea {
                        id: reloadMouseArea
                        anchors.fill: parent
                        onClicked: root.reloadCurrentSettings()
                    }
                }
            }
        }
    }
}
