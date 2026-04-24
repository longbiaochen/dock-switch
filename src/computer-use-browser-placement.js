const { getDisplayArea } = require("./display-targets");
const { getDisplayForRect } = require("./window-control");

const DEFAULT_ANCHOR_APP = "Codex";
const DEFAULT_BROWSER_APP = "Google Chrome for Testing";

function isUsableWindow(win) {
    return !!(win &&
        Number.isFinite(win.pid) &&
        Number.isFinite(win.windowIndex) &&
        [win.x, win.y, win.w, win.h].every(Number.isFinite) &&
        win.w > 0 &&
        win.h > 0);
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

function chooseWindow(windows) {
    return (Array.isArray(windows) ? windows : [])
        .filter(isUsableWindow)
        .slice()
        .sort((a, b) => windowSortScore(b) - windowSortScore(a))[0] || null;
}

function rightHalfBoundsForDisplay(display) {
    const area = getDisplayArea(display);
    if (!area) return null;
    const halfW = Math.floor(area.width / 2);
    return {
        x: area.x + halfW,
        y: area.y,
        w: area.width - halfW,
        h: area.height
    };
}

function getApplicationWindows(dockQuery, appName) {
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

function moveSelectedWindow(dockQuery, appName, win, bounds) {
    const payload = {
        pid: Math.round(win.pid),
        windowIndex: Math.round(win.windowIndex),
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        w: Math.round(bounds.w),
        h: Math.round(bounds.h)
    };

    if (typeof dockQuery.moveApplicationWindowByPidAndIndex === "function") {
        return {
            ok: !!dockQuery.moveApplicationWindowByPidAndIndex(payload),
            method: "pid-window-index",
            payload
        };
    }

    if (typeof dockQuery.moveApplicationWindow === "function") {
        const appPayload = {
            name: appName,
            x: payload.x,
            y: payload.y,
            w: payload.w,
            h: payload.h
        };
        return {
            ok: !!dockQuery.moveApplicationWindow(appPayload),
            method: "app-name",
            payload: appPayload
        };
    }

    return { ok: false, method: "", payload };
}

async function placeComputerUseBrowser(command, deps) {
    const anchorApp = String((command && command.anchorApp) || DEFAULT_ANCHOR_APP).trim();
    const browserApp = String((command && command.browserApp) || DEFAULT_BROWSER_APP).trim();
    if (!anchorApp) {
        return { ok: false, error: "anchorApp is required" };
    }
    if (!browserApp) {
        return { ok: false, error: "browserApp is required" };
    }
    if (!deps || !deps.dockQuery || !deps.electronScreen) {
        return { ok: false, error: "dock-switch runtime is not ready" };
    }
    if (typeof deps.ensurePermissions === "function" && !deps.ensurePermissions()) {
        return { ok: false, error: "Accessibility permission is required" };
    }

    const displays = deps.electronScreen.getAllDisplays();
    if (!Array.isArray(displays) || displays.length === 0) {
        return { ok: false, error: "No displays found" };
    }

    const anchorWindow = chooseWindow(getApplicationWindows(deps.dockQuery, anchorApp));
    if (!anchorWindow) {
        return { ok: false, error: `No usable ${anchorApp} window found` };
    }

    const anchorDisplay = getDisplayForRect(displays, anchorWindow);
    if (!anchorDisplay) {
        return { ok: false, error: `No display found for ${anchorApp} window` };
    }

    const targetBounds = rightHalfBoundsForDisplay(anchorDisplay);
    if (!targetBounds || targetBounds.w <= 0 || targetBounds.h <= 0) {
        return { ok: false, error: "Failed to resolve target display right half" };
    }

    const browserWindow = chooseWindow(getApplicationWindows(deps.dockQuery, browserApp));
    if (!browserWindow) {
        return { ok: false, error: `No usable ${browserApp} window found` };
    }

    const move = moveSelectedWindow(deps.dockQuery, browserApp, browserWindow, targetBounds);
    if (!move.ok) {
        return { ok: false, error: `Failed to move ${browserApp} window` };
    }

    return {
        ok: true,
        anchorApp,
        browserApp,
        anchorWindow: {
            pid: Math.round(anchorWindow.pid),
            windowIndex: Math.round(anchorWindow.windowIndex)
        },
        browserWindow: {
            pid: Math.round(browserWindow.pid),
            windowIndex: Math.round(browserWindow.windowIndex)
        },
        display: {
            id: anchorDisplay.id,
            label: anchorDisplay.label || "",
            bounds: anchorDisplay.bounds || null,
            workArea: anchorDisplay.workArea || null
        },
        bounds: {
            x: Math.round(targetBounds.x),
            y: Math.round(targetBounds.y),
            w: Math.round(targetBounds.w),
            h: Math.round(targetBounds.h)
        },
        moveMethod: move.method
    };
}

module.exports = {
    DEFAULT_ANCHOR_APP,
    DEFAULT_BROWSER_APP,
    chooseWindow,
    placeComputerUseBrowser,
    rightHalfBoundsForDisplay
};
