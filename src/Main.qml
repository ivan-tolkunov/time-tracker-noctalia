import QtQuick 2.15

Item {
    id: root

    property var pluginApi: null
    readonly property var persistedPluginSettings: root.pluginApi ? root.pluginApi.pluginSettings : null
    property var runtimeBridge: null
    property var qmlTrackerState: ({
        "tasks": [],
        "sessions": [],
        "activeTimer": null
    })
    property var qmlSnapshot: ({
        "nowMs": 0,
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
    property int refreshIntervalMs: 30000

    function getPluginMainInstance() {
        if (typeof pluginApi !== "undefined" && pluginApi && pluginApi.mainInstance) {
            return pluginApi.mainInstance
        }

        return null
    }

    function ensureSharedRuntimeBridge() {
        var mainInstance = root.getPluginMainInstance()
        if (root.runtimeBridge && mainInstance && !mainInstance.runtimeBridge) {
            mainInstance.runtimeBridge = root.runtimeBridge
            return root.runtimeBridge
        }

        if (!root.runtimeBridge && mainInstance && mainInstance.runtimeBridge) {
            root.runtimeBridge = mainInstance.runtimeBridge
        }

        return root.runtimeBridge
    }

    function getDefaultSettingsDraft() {
        if (root.pluginApi && root.pluginApi.manifest && root.pluginApi.manifest.metadata && root.pluginApi.manifest.metadata.defaultSettings) {
            return root.pluginApi.manifest.metadata.defaultSettings
        }

        return {
            "boundaryTimeText": "00:00",
            "weekStartsOn": 1,
            "refreshIntervalSecondsText": "30"
        }
    }

    function createDefaultTrackerState() {
        return {
            "tasks": [],
            "sessions": [],
            "activeTimer": null
        }
    }

    function cloneValue(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value))
        } catch (error) {
            return fallback
        }
    }

    function createSessionId(seedMs) {
        return "session-" + String(seedMs) + "-" + String(Math.floor(Math.random() * 1000000))
    }

    function ensurePluginSettingsObject() {
        if (!root.pluginApi) {
            return null
        }

        if (!root.pluginApi.pluginSettings) {
            root.pluginApi.pluginSettings = {}
        }

        return root.pluginApi.pluginSettings
    }

    function getExistingPluginSettingsObject() {
        if (!root.pluginApi || !root.pluginApi.pluginSettings) {
            return null
        }

        return root.pluginApi.pluginSettings
    }

    function savePluginSettingsObject() {
        if (root.pluginApi && root.pluginApi.saveSettings) {
            root.pluginApi.saveSettings()
        }
    }

    function readTrackerStateFromPluginSettings() {
        var pluginSettings = root.getExistingPluginSettingsObject()
        if (!pluginSettings) {
            return null
        }

        if (!pluginSettings.trackerState || typeof pluginSettings.trackerState !== "object") {
            return root.createDefaultTrackerState()
        }

        var trackerState = pluginSettings.trackerState
        var tasks = Array.isArray(trackerState.tasks) ? root.cloneValue(trackerState.tasks, []) : []
        var sessions = []
        var rawSessions = Array.isArray(trackerState.sessions) ? trackerState.sessions : []
        for (var sessionIndex = 0; sessionIndex < rawSessions.length; sessionIndex += 1) {
            var rawSession = rawSessions[sessionIndex]
            if (!rawSession || rawSession.taskId === undefined || rawSession.startMs === undefined || rawSession.endMs === undefined) {
                continue
            }

            sessions.push({
                "id": rawSession.id !== undefined && rawSession.id !== null ? rawSession.id : root.createSessionId(rawSession.startMs),
                "taskId": rawSession.taskId,
                "startMs": rawSession.startMs,
                "endMs": rawSession.endMs
            })
        }

        var activeTimer = null
        if (trackerState.activeTimer && trackerState.activeTimer.taskId !== undefined && trackerState.activeTimer.startMs !== undefined) {
            activeTimer = {
                "sessionId": trackerState.activeTimer.sessionId !== undefined && trackerState.activeTimer.sessionId !== null
                    ? trackerState.activeTimer.sessionId
                    : root.createSessionId(trackerState.activeTimer.startMs),
                "taskId": trackerState.activeTimer.taskId,
                "startMs": trackerState.activeTimer.startMs
            }
        }

        return {
            "tasks": tasks,
            "sessions": sessions,
            "activeTimer": activeTimer
        }
    }

    function persistTrackerState(nextState) {
        root.qmlTrackerState = root.cloneValue(nextState, root.createDefaultTrackerState())

        var pluginSettings = root.ensurePluginSettingsObject()
        if (pluginSettings) {
            pluginSettings.trackerState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
            root.savePluginSettingsObject()
        }

        return root.qmlTrackerState
    }

    function buildPersistedStateForBridge() {
        var settingsState = root.buildSettingsStateWithoutBridge()
        return {
            "version": 1,
            "tasks": root.cloneValue(root.qmlTrackerState.tasks || [], []),
            "sessions": root.cloneValue(root.qmlTrackerState.sessions || [], []),
            "activeTimer": root.cloneValue(root.qmlTrackerState.activeTimer, null),
            "preferences": {
                "boundaryMinuteOfDay": settingsState.boundaryMinuteOfDay,
                "weekStartsOn": settingsState.weekStartsOn,
                "refreshIntervalMs": settingsState.refreshIntervalMs
            }
        }
    }

    function reloadBridgeFromPersistedState(nowMs) {
        var bridge = root.ensureSharedRuntimeBridge()
        if (!bridge || !bridge.reloadPersistedState) {
            return null
        }

        return bridge.reloadPersistedState(root.buildPersistedStateForBridge(), nowMs)
    }

    function hydrateTrackerStateFromPluginSettings() {
        var persistedState = root.readTrackerStateFromPluginSettings()
        if (persistedState === null) {
            return false
        }

        root.qmlTrackerState = persistedState
        root.qmlSnapshot = root.buildSnapshot(Date.now())
        return true
    }

    function formatMinutes(minutes) {
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return "0m"
        }

        var wholeMinutes = Math.max(0, Math.floor(minutes))
        var hours = Math.floor(wholeMinutes / 60)
        var remainingMinutes = wholeMinutes % 60

        if (hours === 0) {
            return String(remainingMinutes) + "m"
        }

        if (remainingMinutes === 0) {
            return String(hours) + "h"
        }

        return String(hours) + "h " + String(remainingMinutes) + "m"
    }

    function parseBoundaryTimeText(boundaryTimeText) {
        var match = /^(\d{1,2}):(\d{2})$/.exec(String(boundaryTimeText).trim())
        if (match === null) {
            return null
        }

        var hours = Number(match[1])
        var minutes = Number(match[2])
        if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null
        }

        return (hours * 60) + minutes
    }

    function buildSettingsStateWithoutBridge() {
        var draft = root.buildSettingsDraftFromPluginApi()
        var boundaryMinuteOfDay = root.parseBoundaryTimeText(draft.boundaryTimeText)
        if (boundaryMinuteOfDay === null) {
            boundaryMinuteOfDay = 0
        }

        var refreshIntervalSeconds = Number(draft.refreshIntervalSecondsText)
        if (!Number.isInteger(refreshIntervalSeconds) || refreshIntervalSeconds < 1) {
            refreshIntervalSeconds = 30
        }

        var weekStartsOn = Number(draft.weekStartsOn)
        if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
            weekStartsOn = 1
        }

        return {
            "boundaryMinuteOfDay": boundaryMinuteOfDay,
            "boundaryTimeText": draft.boundaryTimeText,
            "weekStartsOn": weekStartsOn,
            "refreshIntervalMs": refreshIntervalSeconds * 1000,
            "refreshIntervalSeconds": refreshIntervalSeconds
        }
    }

    function getSettingsState() {
        var bridge = root.ensureSharedRuntimeBridge()
        if (bridge && bridge.getSettingsState) {
            return bridge.getSettingsState()
        }

        return root.buildSettingsStateWithoutBridge()
    }

    function getLogicalDayStart(nowMs, boundaryMinuteOfDay) {
        var current = new Date(nowMs)
        var start = new Date(current.getTime())
        start.setHours(0, 0, 0, 0)
        start.setMinutes(boundaryMinuteOfDay)

        if (nowMs < start.getTime()) {
            start.setDate(start.getDate() - 1)
        }

        return start.getTime()
    }

    function getLogicalWeekStart(nowMs, boundaryMinuteOfDay, weekStartsOn) {
        var dayStartMs = root.getLogicalDayStart(nowMs, boundaryMinuteOfDay)
        var dayStart = new Date(dayStartMs)
        var dayOfWeek = dayStart.getDay()
        var diff = (dayOfWeek - weekStartsOn + 7) % 7
        dayStart.setDate(dayStart.getDate() - diff)
        return dayStart.getTime()
    }

    function getAllSessionsThroughNow(nowMs) {
        var sessions = root.cloneValue(root.qmlTrackerState.sessions || [], [])
        var activeTimer = root.qmlTrackerState.activeTimer
        if (activeTimer) {
            sessions.push({
                "id": activeTimer.sessionId,
                "taskId": activeTimer.taskId,
                "startMs": activeTimer.startMs,
                "endMs": nowMs
            })
        }

        return sessions
    }

    function getLogicalWeekCount(taskCreatedAtMs, nowMs, boundaryMinuteOfDay, weekStartsOn) {
        var startWeekMs = root.getLogicalWeekStart(taskCreatedAtMs, boundaryMinuteOfDay, weekStartsOn)
        var nowWeekMs = root.getLogicalWeekStart(nowMs, boundaryMinuteOfDay, weekStartsOn)
        var diffMs = nowWeekMs - startWeekMs
        return Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)
    }

    function getWeeklyAverageMinutesForTask(taskId, taskCreatedAtMs, nowMs, boundaryMinuteOfDay, weekStartsOn) {
        var totalMs = 0
        var sessions = root.getAllSessionsThroughNow(nowMs)
        for (var sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
            var session = sessions[sessionIndex]
            if (!session || session.taskId !== taskId) {
                continue
            }

            var clampedStartMs = Math.max(taskCreatedAtMs, session.startMs)
            var clampedEndMs = Math.min(nowMs, session.endMs)
            if (clampedEndMs > clampedStartMs) {
                totalMs += clampedEndMs - clampedStartMs
            }
        }

        var logicalWeekCount = root.getLogicalWeekCount(taskCreatedAtMs, nowMs, boundaryMinuteOfDay, weekStartsOn)
        return Math.max(0, Math.floor((totalMs / 60000) / logicalWeekCount))
    }

    function getTrackedMinutesForTaskBetween(taskId, startMs, endMs) {
        var totalMs = 0
        var sessions = root.qmlTrackerState.sessions || []
        for (var sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
            var session = sessions[sessionIndex]
            if (!session || session.taskId !== taskId) {
                continue
            }

            var overlapStartMs = Math.max(startMs, session.startMs)
            var overlapEndMs = Math.min(endMs, session.endMs)
            if (overlapEndMs > overlapStartMs) {
                totalMs += overlapEndMs - overlapStartMs
            }
        }

        var activeTimer = root.qmlTrackerState.activeTimer
        if (activeTimer && activeTimer.taskId === taskId) {
            var activeOverlapStartMs = Math.max(startMs, activeTimer.startMs)
            var activeOverlapEndMs = endMs
            if (activeOverlapEndMs > activeOverlapStartMs) {
                totalMs += activeOverlapEndMs - activeOverlapStartMs
            }
        }

        return Math.max(0, Math.floor(totalMs / 60000))
    }

    function getTaskById(taskId) {
        var tasks = root.qmlTrackerState.tasks || []
        for (var taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
            var task = tasks[taskIndex]
            if (task && task.id === taskId) {
                return task
            }
        }

        return null
    }

    function buildSnapshot(nowMs) {
        var settingsState = root.buildSettingsStateWithoutBridge()
        var activeTimer = root.qmlTrackerState.activeTimer
        var activeTask = activeTimer ? root.getTaskById(activeTimer.taskId) : null
        var dayStartMs = root.getLogicalDayStart(nowMs, settingsState.boundaryMinuteOfDay)
        var weekStartMs = root.getLogicalWeekStart(nowMs, settingsState.boundaryMinuteOfDay, settingsState.weekStartsOn)
        var tasks = root.qmlTrackerState.tasks || []
        var taskStates = []

        for (var taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
            var task = tasks[taskIndex]
            if (!task) {
                continue
            }

            var todayTrackedMinutes = root.getTrackedMinutesForTaskBetween(task.id, dayStartMs, nowMs)
            var weeklyTrackedMinutes = root.getWeeklyAverageMinutesForTask(
                task.id,
                task.createdAtMs,
                nowMs,
                settingsState.boundaryMinuteOfDay,
                settingsState.weekStartsOn
            )
            taskStates.push({
                "id": task.id,
                "title": task.title,
                "isActive": activeTimer !== null && activeTimer.taskId === task.id,
                "isCompleted": task.completedAtMs !== undefined && task.completedAtMs !== null,
                "todayTrackedMinutes": todayTrackedMinutes,
                "todayTrackedLabel": root.formatMinutes(todayTrackedMinutes),
                "weeklyAverageMinutes": weeklyTrackedMinutes,
                "weeklyAverageLabel": root.formatMinutes(weeklyTrackedMinutes)
            })
        }

        var activeElapsedMinutes = activeTimer ? Math.max(0, Math.floor((nowMs - activeTimer.startMs) / 60000)) : 0
        var activeTodayTrackedMinutes = activeTask ? root.getTrackedMinutesForTaskBetween(activeTask.id, dayStartMs, nowMs) : 0

        return {
            "nowMs": nowMs,
            "bar": {
                "hasActiveTask": activeTask !== null,
                "activeTaskId": activeTask ? activeTask.id : null,
                "activeTaskTitle": activeTask ? activeTask.title : "No active task",
                "activeElapsedMinutes": activeElapsedMinutes,
                "activeElapsedLabel": root.formatMinutes(activeElapsedMinutes),
                "todayTrackedMinutes": activeTodayTrackedMinutes,
                "todayTrackedLabel": root.formatMinutes(activeTodayTrackedMinutes) + " today"
            },
            "panel": {
                "activeTaskId": activeTask ? activeTask.id : null,
                "activeTaskTitle": activeTask ? activeTask.title : "No active task",
                "activeElapsedMinutes": activeElapsedMinutes,
                "activeElapsedLabel": root.formatMinutes(activeElapsedMinutes),
                "canStopActiveTimer": activeTimer !== null,
                "tasks": taskStates
            }
        }
    }

    function refreshQmlSnapshot(nowMs) {
        root.qmlSnapshot = root.buildSnapshot(nowMs)
        return root.qmlSnapshot
    }

    function getSnapshot() {
        return root.qmlSnapshot
    }

    function parseTaskDraft(draft) {
        var title = String(draft.title).trim()
        if (title.length === 0) {
            return { "ok": false, "reason": "empty-title" }
        }

        return {
            "ok": true,
            "reason": null,
            "task": {
                "title": title
            }
        }
    }

    function createTaskFromDraft(draft, nowMs) {
        var parsed = root.parseTaskDraft(draft)
        if (!parsed.ok) {
            return { "ok": false, "reason": parsed.reason }
        }

        var nextState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
        nextState.tasks.push({
            "id": "task-" + String(nowMs) + "-" + Math.floor(Math.random() * 1000000),
            "title": parsed.task.title,
            "createdAtMs": nowMs
        })

        root.persistTrackerState(nextState)
        root.refreshQmlSnapshot(nowMs)
        return { "ok": true, "reason": null }
    }

    function updateTaskFromDraft(taskId, draft, nowMs) {
        var parsed = root.parseTaskDraft(draft)
        if (!parsed.ok) {
            return { "ok": false, "reason": parsed.reason }
        }

        var nextState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
        var found = false
        for (var taskIndex = 0; taskIndex < nextState.tasks.length; taskIndex += 1) {
            var candidate = nextState.tasks[taskIndex]
            if (candidate && candidate.id === taskId) {
                nextState.tasks[taskIndex] = {
                    "id": candidate.id,
                    "title": parsed.task.title,
                    "createdAtMs": candidate.createdAtMs,
                    "completedAtMs": candidate.completedAtMs
                }
                found = true
                break
            }
        }

        if (!found) {
            return { "ok": false, "reason": "not-found" }
        }

        root.persistTrackerState(nextState)
        root.refreshQmlSnapshot(nowMs)
        return { "ok": true, "reason": null }
    }

    function startTask(taskId, nowMs) {
        var task = root.getTaskById(taskId)
        if (!task || (task.completedAtMs !== undefined && task.completedAtMs !== null)) {
            return { "started": false, "switchedFromTaskId": null }
        }

        var nextState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
        var switchedFromTaskId = null
        if (nextState.activeTimer && nextState.activeTimer.taskId !== taskId) {
            switchedFromTaskId = nextState.activeTimer.taskId
            nextState.sessions.push({
                "id": nextState.activeTimer.sessionId,
                "taskId": nextState.activeTimer.taskId,
                "startMs": nextState.activeTimer.startMs,
                "endMs": nowMs
            })
        }

        nextState.activeTimer = {
            "sessionId": root.createSessionId(nowMs),
            "taskId": taskId,
            "startMs": nowMs
        }
        root.persistTrackerState(nextState)
        root.refreshQmlSnapshot(nowMs)
        return { "started": true, "switchedFromTaskId": switchedFromTaskId }
    }

    function stopActiveTimer(nowMs) {
        if (!root.qmlTrackerState.activeTimer) {
            return false
        }

        var nextState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
        nextState.sessions.push({
            "id": nextState.activeTimer.sessionId,
            "taskId": nextState.activeTimer.taskId,
            "startMs": nextState.activeTimer.startMs,
            "endMs": nowMs
        })
        nextState.activeTimer = null
        root.persistTrackerState(nextState)
        root.refreshQmlSnapshot(nowMs)
        return true
    }

    function completeTask(taskId, nowMs) {
        var nextState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
        if (nextState.activeTimer && nextState.activeTimer.taskId === taskId) {
            nextState.sessions.push({
                "id": nextState.activeTimer.sessionId,
                "taskId": nextState.activeTimer.taskId,
                "startMs": nextState.activeTimer.startMs,
                "endMs": nowMs
            })
            nextState.activeTimer = null
        }

        var found = false
        for (var taskIndex = 0; taskIndex < nextState.tasks.length; taskIndex += 1) {
            if (nextState.tasks[taskIndex] && nextState.tasks[taskIndex].id === taskId) {
                nextState.tasks[taskIndex].completedAtMs = nowMs
                found = true
                break
            }
        }

        if (!found) {
            return false
        }

        root.persistTrackerState(nextState)
        root.refreshQmlSnapshot(nowMs)
        return true
    }

    function deleteTask(taskId, nowMs) {
        var nextState = root.cloneValue(root.qmlTrackerState, root.createDefaultTrackerState())
        if (nextState.activeTimer && nextState.activeTimer.taskId === taskId) {
            nextState.activeTimer = null
        }

        var nextTasks = []
        for (var taskIndex = 0; taskIndex < nextState.tasks.length; taskIndex += 1) {
            var task = nextState.tasks[taskIndex]
            if (task && task.id !== taskId) {
                nextTasks.push(task)
            }
        }

        if (nextTasks.length === nextState.tasks.length) {
            return false
        }

        nextState.tasks = nextTasks
        nextState.sessions = nextState.sessions.filter(function(session) {
            return session.taskId !== taskId
        })
        root.persistTrackerState(nextState)
        root.refreshQmlSnapshot(nowMs)
        return true
    }

    function updateSettingsFromDraft(draft, nowMs) {
        var boundaryMinuteOfDay = root.parseBoundaryTimeText(draft.boundaryTimeText)
        if (boundaryMinuteOfDay === null) {
            return { "ok": false, "reason": "invalid-boundary", "settings": root.buildSettingsStateWithoutBridge() }
        }

        var weekStartsOn = Number(draft.weekStartsOn)
        if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
            return { "ok": false, "reason": "invalid-week-start", "settings": root.buildSettingsStateWithoutBridge() }
        }

        var refreshIntervalSeconds = Number(String(draft.refreshIntervalSecondsText).trim())
        if (!Number.isInteger(refreshIntervalSeconds) || refreshIntervalSeconds < 1) {
            return { "ok": false, "reason": "invalid-refresh-interval", "settings": root.buildSettingsStateWithoutBridge() }
        }

        root.refreshIntervalMs = refreshIntervalSeconds * 1000
        root.refreshQmlSnapshot(nowMs)

        return {
            "ok": true,
            "reason": null,
            "settings": {
                "boundaryMinuteOfDay": boundaryMinuteOfDay,
                "boundaryTimeText": String(draft.boundaryTimeText),
                "weekStartsOn": weekStartsOn,
                "refreshIntervalMs": root.refreshIntervalMs,
                "refreshIntervalSeconds": refreshIntervalSeconds
            }
        }
    }

    function buildSettingsDraftFromPluginApi() {
        var defaults = root.getDefaultSettingsDraft()
        var pluginSettings = root.pluginApi && root.pluginApi.pluginSettings ? root.pluginApi.pluginSettings : ({})

        return {
            "boundaryTimeText": pluginSettings.boundaryTimeText !== undefined ? String(pluginSettings.boundaryTimeText) : String(defaults.boundaryTimeText),
            "weekStartsOn": Number.isInteger(pluginSettings.weekStartsOn) ? pluginSettings.weekStartsOn : defaults.weekStartsOn,
            "refreshIntervalSecondsText": pluginSettings.refreshIntervalSecondsText !== undefined ? String(pluginSettings.refreshIntervalSecondsText) : String(defaults.refreshIntervalSecondsText)
        }
    }

    function applyPluginSettingsToRuntime() {
        var bridge = root.ensureSharedRuntimeBridge()
        if (!bridge || !bridge.updateSettingsFromDraft) {
            var settingsState = root.buildSettingsStateWithoutBridge()
            root.refreshIntervalMs = settingsState.refreshIntervalMs
            root.refreshQmlSnapshot(Date.now())
            return {
                "ok": true,
                "reason": null,
                "settings": settingsState
            }
        }

        return bridge.updateSettingsFromDraft(root.buildSettingsDraftFromPluginApi(), Date.now())
    }

    function syncIntervalsFromBridge() {
        var settingsState = root.getSettingsState()
        if (settingsState) {
            root.refreshIntervalMs = settingsState.refreshIntervalMs
        }
    }

    function runStartupRecovery() {
        if (!root.hydrateTrackerStateFromPluginSettings()) {
            root.qmlTrackerState = root.createDefaultTrackerState()
            root.qmlSnapshot = root.buildSnapshot(Date.now())
        }

        var bridge = root.ensureSharedRuntimeBridge()
        if (bridge && bridge.reloadPersistedState) {
            root.reloadBridgeFromPersistedState(Date.now())
        }

        if (bridge && bridge.updateSettingsFromDraft) {
            root.applyPluginSettingsToRuntime()
        } else {
            root.applyPluginSettingsToRuntime()
        }

        if (bridge && bridge.initializeRuntime) {
            bridge.initializeRuntime(Date.now())
        } else {
            root.refreshQmlSnapshot(Date.now())
        }

        root.syncIntervalsFromBridge()
    }

    function runPeriodicRefresh() {
        var bridge = root.ensureSharedRuntimeBridge()
        if (bridge && bridge.runPeriodicRefresh) {
            bridge.runPeriodicRefresh(Date.now())
        } else {
            root.refreshQmlSnapshot(Date.now())
        }

        root.syncIntervalsFromBridge()
    }

    onRuntimeBridgeChanged: {
        var bridge = root.ensureSharedRuntimeBridge()
        if (bridge && bridge.reloadPersistedState) {
            root.reloadBridgeFromPersistedState(Date.now())
        }

        root.applyPluginSettingsToRuntime()
        if (bridge && bridge.initializeRuntime) {
            bridge.initializeRuntime(Date.now())
        }
        root.syncIntervalsFromBridge()
    }

    onPersistedPluginSettingsChanged: {
        var didHydrate = root.hydrateTrackerStateFromPluginSettings()
        var bridge = root.ensureSharedRuntimeBridge()
        if (didHydrate && bridge && bridge.reloadPersistedState) {
            root.reloadBridgeFromPersistedState(Date.now())
        }

        if (didHydrate && bridge && bridge.initializeRuntime) {
            bridge.initializeRuntime(Date.now())
        }

        root.applyPluginSettingsToRuntime()
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
}
