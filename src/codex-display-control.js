const {
    getDisplayForRect,
    moveMouseToDisplayCenter
} = require("./window-control");
const {
    getDisplayForTarget,
    resolveDisplayCenterPoint
} = require("./display-targets");

const CODEX_APP_NAME = "Codex";

const TARGET_ALIASES = Object.freeze({
    left: "side_left",
    minus: "side_left",
    side: "side_left",
    side_left: "side_left",
    up: "external",
    top: "external",
    voice: "external",
    external: "external",
    right: "side_right",
    green: "side_right",
    side_right: "side_right",
    down: "internal",
    bottom: "internal",
    plus: "internal",
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

    const windows = getCodexWindows(deps.dockQuery, appName);
    const targetWindow = chooseCodexWindowForDisplay(windows, targetDisplay, displays);
    const focused = targetWindow ? focusCodexWindow(deps.dockQuery, targetWindow) : false;
    const mouseMoved = moveMouseToDisplayCenter(deps.dockQuery, targetDisplay);
    const feedbackPoint = mouseMoved ? resolveDisplayCenterPoint(targetDisplay) : null;
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
        reusedExistingTargetWindow: !!targetWindow,
        moved: false,
        focused,
        mouseMoved,
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
