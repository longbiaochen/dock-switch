const childProcess = require("child_process");
const {
    getDisplayForRect,
    moveMouseToBoundsCenter,
    moveMouseToDisplayCenter
} = require("./window-control");
const {
    getDisplayForTarget,
    resolveDisplayCenterPoint
} = require("./display-targets");

const CODEX_APP_NAME = "Codex";
const DEFAULT_CREATE_TIMEOUT_MS = 1600;
const CREATE_POLL_MS = 60;

const TARGET_ALIASES = Object.freeze({
    left: "side_left",
    side: "side_left",
    side_left: "side_left",
    up: "external",
    top: "external",
    external: "external",
    right: "side_right",
    side_right: "side_right",
    down: "internal",
    bottom: "internal",
    internal: "internal"
});

const TARGET_PLACEMENTS = Object.freeze({
    side_left: "side_left_fill",
    external: "external_fill",
    side_right: "side_right_fill",
    internal: "internal_fill"
});

function normalizeCodexDisplayTarget(target) {
    const key = String(target || "").trim().toLowerCase().replace(/-/g, "_");
    return TARGET_ALIASES[key] || "";
}

function placementForDisplayTarget(target) {
    const normalized = normalizeCodexDisplayTarget(target);
    return TARGET_PLACEMENTS[normalized] || "";
}

function isUsableWindow(win) {
    return !!(win &&
        Number.isFinite(win.pid) &&
        Number.isFinite(win.windowIndex) &&
        [win.x, win.y, win.w, win.h].every(Number.isFinite) &&
        win.w > 0 &&
        win.h > 0);
}

function sameDisplay(a, b) {
    if (!a || !b) return false;
    if (Number.isFinite(a.id) && Number.isFinite(b.id)) {
        return a.id === b.id;
    }
    return String(a.label || "") === String(b.label || "");
}

function windowArea(win) {
    return Math.max(0, Number(win.w) || 0) * Math.max(0, Number(win.h) || 0);
}

function windowSortScore(win) {
    let score = windowArea(win);
    if (win.focused) score += 100000000;
    if (win.main) score += 50000000;
    return score;
}

function chooseCodexWindowForDisplay(windows, targetDisplay, displays) {
    if (!targetDisplay || !Array.isArray(displays)) return null;
    return (Array.isArray(windows) ? windows : [])
        .filter(isUsableWindow)
        .filter(win => sameDisplay(getDisplayForRect(displays, win), targetDisplay))
        .slice()
        .sort((a, b) => windowSortScore(b) - windowSortScore(a))[0] || null;
}

function getCodexWindows(dockQuery, appName) {
    if (!dockQuery || typeof dockQuery.getApplicationWindows !== "function") {
        return [];
    }
    try {
        const windows = dockQuery.getApplicationWindows({ name: appName });
        return Array.isArray(windows) ? windows : [];
    } catch (e) {
        return [];
    }
}

function focusCodexWindow(dockQuery, win) {
    if (!dockQuery ||
        !isUsableWindow(win) ||
        typeof dockQuery.focusApplicationWindowByPid !== "function") {
        return false;
    }
    try {
        return !!dockQuery.focusApplicationWindowByPid({
            pid: Math.round(win.pid),
            windowIndex: Math.round(win.windowIndex)
        });
    } catch (e) {
        return false;
    }
}

function windowIdentity(win) {
    if (!isUsableWindow(win)) return "";
    return `${Math.round(win.pid)}:${Math.round(win.windowIndex)}`;
}

function displayWorkArea(display) {
    return display && (display.workArea || display.bounds);
}

function moveCodexWindowToDisplay(dockQuery, win, display) {
    const area = displayWorkArea(display);
    if (!dockQuery ||
        !isUsableWindow(win) ||
        !area ||
        typeof dockQuery.moveApplicationWindowByPidAndIndex !== "function") {
        return false;
    }
    try {
        return !!dockQuery.moveApplicationWindowByPidAndIndex({
            pid: Math.round(win.pid),
            windowIndex: Math.round(win.windowIndex),
            x: Math.round(area.x),
            y: Math.round(area.y),
            w: Math.round(area.width),
            h: Math.round(area.height)
        });
    } catch (e) {
        return false;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultOpenApplication(appName, targetDisplay) {
    const area = displayWorkArea(targetDisplay);
    if (area) {
        const bounds = [
            Math.round(area.x),
            Math.round(area.y),
            Math.round(area.x + area.width),
            Math.round(area.y + area.height)
        ].join(", ");
        return new Promise(resolve => {
            childProcess.execFile("osascript", [
                "-e",
                `tell application "${String(appName).replace(/"/g, '\\"')}" to make new window with properties {bounds:{${bounds}}}`
            ], () => resolve());
        });
    }
    return new Promise(resolve => {
        childProcess.execFile("open", ["-na", appName], () => resolve());
    });
}

function findNewCodexWindow(previousIdentities, windows) {
    return (Array.isArray(windows) ? windows : [])
        .filter(isUsableWindow)
        .filter(win => !previousIdentities.has(windowIdentity(win)))
        .slice()
        .sort((a, b) => windowSortScore(b) - windowSortScore(a))[0] || null;
}

async function createCodexWindowForDisplay(appName, targetDisplay, displays, deps, existingWindows, command) {
    const previousIdentities = new Set((Array.isArray(existingWindows) ? existingWindows : [])
        .filter(isUsableWindow)
        .map(windowIdentity));
    const openApplication = typeof deps.openApplication === "function"
        ? deps.openApplication
        : defaultOpenApplication;
    await openApplication(appName, targetDisplay);

    const timeoutMs = Math.max(0, Number(command && command.timeoutMs) || DEFAULT_CREATE_TIMEOUT_MS);
    const deadline = Date.now() + timeoutMs;
    let latestWindows = [];
    do {
        latestWindows = getCodexWindows(deps.dockQuery, appName);
        const targetWindow = chooseCodexWindowForDisplay(latestWindows, targetDisplay, displays);
        if (targetWindow && !previousIdentities.has(windowIdentity(targetWindow))) {
            return { window: targetWindow, moved: false };
        }

        const newWindow = findNewCodexWindow(previousIdentities, latestWindows);
        if (newWindow) {
            const alreadyOnTarget = sameDisplay(getDisplayForRect(displays, newWindow), targetDisplay);
            const moved = alreadyOnTarget ? false : moveCodexWindowToDisplay(deps.dockQuery, newWindow, targetDisplay);
            return { window: newWindow, moved };
        }
        await delay(CREATE_POLL_MS);
    } while (Date.now() < deadline);

    const targetWindow = chooseCodexWindowForDisplay(latestWindows, targetDisplay, displays);
    return { window: targetWindow, moved: false };
}

function clickMouseAtPoint(dockQuery, point) {
    if (!dockQuery ||
        !point ||
        typeof dockQuery.clickMouse !== "function" ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)) {
        return false;
    }
    try {
        return !!dockQuery.clickMouse({
            x: Math.round(point.x),
            y: Math.round(point.y)
        });
    } catch (e) {
        return false;
    }
}

function getTargetDisplaySnapshot(display) {
    if (!display) return null;
    return {
        id: display.id,
        label: display.label || "",
        bounds: display.bounds || null,
        workArea: display.workArea || null
    };
}

async function selectCodexDisplay(command, deps) {
    const target = normalizeCodexDisplayTarget(command && command.target);
    if (!target) {
        return { ok: false, error: "target must be side_left, external, side_right, or internal" };
    }
    if (!deps || !deps.dockQuery || !deps.electronScreen) {
        return { ok: false, error: "dock-switch runtime is not ready" };
    }
    if (typeof deps.ensurePermissions === "function" && !deps.ensurePermissions()) {
        return { ok: false, error: "Accessibility permission is required" };
    }

    const appName = String((command && command.appName) || CODEX_APP_NAME);
    const displays = deps.electronScreen.getAllDisplays();
    const primary = deps.electronScreen.getPrimaryDisplay();
    const targetDisplay = getDisplayForTarget(target, displays, primary);
    if (!targetDisplay) {
        return { ok: false, target, error: `No display found for ${target}` };
    }

    const mouseMoved = moveMouseToDisplayCenter(deps.dockQuery, targetDisplay);
    const feedbackPoint = mouseMoved
        ? resolveDisplayCenterPoint(targetDisplay)
        : null;
    const mouseClicked = mouseMoved && clickMouseAtPoint(deps.dockQuery, feedbackPoint);

    const windows = getCodexWindows(deps.dockQuery, appName);
    let targetWindow = chooseCodexWindowForDisplay(windows, targetDisplay, displays);
    const reusedExistingTargetWindow = !!targetWindow;
    let createdNewWindow = false;
    let moved = false;
    if (!targetWindow) {
        const created = await createCodexWindowForDisplay(appName, targetDisplay, displays, deps, windows, command);
        targetWindow = created.window;
        moved = !!created.moved;
        createdNewWindow = !!targetWindow;
    }
    const focused = targetWindow ? focusCodexWindow(deps.dockQuery, targetWindow) : false;

    if (feedbackPoint && typeof deps.showMouseFeedback === "function") {
        deps.showMouseFeedback(feedbackPoint);
    }

    return {
        ok: true,
        target,
        placement: placementForDisplayTarget(target),
        appName,
        source: String((command && command.source) || ""),
        display: getTargetDisplaySnapshot(targetDisplay),
        selectedWindow: targetWindow ? {
            pid: Math.round(targetWindow.pid),
            windowIndex: Math.round(targetWindow.windowIndex)
        } : null,
        reusedExistingTargetWindow,
        createdNewWindow,
        moved,
        focused,
        mouseMoved,
        mouseClicked,
        feedbackPoint
    };
}

module.exports = {
    CODEX_APP_NAME,
    normalizeCodexDisplayTarget,
    placementForDisplayTarget,
    chooseCodexWindowForDisplay,
    selectCodexDisplay
};
