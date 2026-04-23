const {
    getDisplayArea,
    getDisplayForTarget,
    getExternalDisplay,
    getInternalDisplay
} = require("./display-targets");

function getAvailableDisplays(dockQuery, electronScreen) {
    // AX window bounds align with Electron's screen coordinates on macOS.
    // Native NSScreen snapshots are useful for debugging, but not for target
    // bounds resolution because their Y origin does not match AX window bounds.
    return electronScreen.getAllDisplays();
}

function getPrimaryDisplay(dockQuery, electronScreen, displays) {
    return electronScreen.getPrimaryDisplay();
}

function getDisplayForRect(displays, rect) {
    if (!Array.isArray(displays) || displays.length === 0 || !rect) return null;
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;

    for (var i = 0; i < displays.length; i++) {
        var d = displays[i];
        if (!d || !d.bounds) continue;
        var b = d.bounds;
        if (cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height) {
            return d;
        }
    }

    var best = null;
    var bestDist = Number.POSITIVE_INFINITY;
    for (var j = 0; j < displays.length; j++) {
        var s = displays[j];
        if (!s || !s.bounds) continue;
        var sb = s.bounds;
        var dx = 0;
        if (cx < sb.x) dx = sb.x - cx;
        else if (cx > sb.x + sb.width) dx = cx - (sb.x + sb.width);
        var dy = 0;
        if (cy < sb.y) dy = sb.y - cy;
        else if (cy > sb.y + sb.height) dy = cy - (sb.y + sb.height);
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            best = s;
        }
    }
    return best;
}

function boundsForDisplay(display) {
    var area = getDisplayArea(display);
    if (!area) return null;
    return { x: area.x, y: area.y, w: area.width, h: area.height };
}

function resolveBoundsForAction(action, displays, primaryDisplay, currentDisplay) {
    var currentArea = getDisplayArea(currentDisplay);

    if (action === "current_left") {
        if (!currentArea) return null;
        var leftW = Math.floor(currentArea.width / 2);
        return { x: currentArea.x, y: currentArea.y, w: leftW, h: currentArea.height };
    }

    if (action === "current_right") {
        if (!currentArea) return null;
        var rightW = Math.floor(currentArea.width / 2);
        return {
            x: currentArea.x + rightW,
            y: currentArea.y,
            w: currentArea.width - rightW,
            h: currentArea.height
        };
    }

    if (action === "fill") {
        var b = currentDisplay && currentDisplay.bounds;
        if (b) {
            return { x: b.x, y: b.y, w: b.width, h: b.height };
        }
        if (!currentArea) return null;
        return { x: currentArea.x, y: currentArea.y, w: currentArea.width, h: currentArea.height };
    }

    var actionTargets = {
        up: "external",
        down: "internal",
        left: "side_left",
        right: "side_right"
    };
    var targetName = actionTargets[action];
    if (targetName) {
        return boundsForDisplay(getDisplayForTarget(targetName, displays, primaryDisplay));
    }

    return null;
}

function resolveBoundsForPlacement(placement, displays, primaryDisplay) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    function leftHalfBounds(display) {
        var area = getDisplayArea(display);
        if (!area) return null;
        var halfW = Math.floor(area.width / 2);
        return {
            x: area.x,
            y: area.y,
            w: halfW,
            h: area.height
        };
    }

    function rightHalfBounds(display) {
        var area = getDisplayArea(display);
        if (!area) return null;
        var halfW = Math.floor(area.width / 2);
        return {
            x: area.x + halfW,
            y: area.y,
            w: area.width - halfW,
            h: area.height
        };
    }

    if (placement === "external_left_half") {
        var externalLeft = getExternalDisplay(displays, primaryDisplay, null);
        if (externalLeft) {
            return leftHalfBounds(externalLeft);
        }

        var internalLeft = getInternalDisplay(displays, primaryDisplay) || primaryDisplay || displays[0];
        return leftHalfBounds(internalLeft);
    }

    if (placement === "external_right_half") {
        var external = getExternalDisplay(displays, primaryDisplay, null);
        if (external) {
            return rightHalfBounds(external);
        }

        var internal = getInternalDisplay(displays, primaryDisplay) || primaryDisplay || displays[0];
        return rightHalfBounds(internal);
    }

    if (placement === "internal_fill") {
        return boundsForDisplay(getDisplayForTarget("internal", displays, primaryDisplay));
    }

    if (placement === "external_fill") {
        return boundsForDisplay(getDisplayForTarget("external", displays, primaryDisplay));
    }

    if (placement === "side_fill" || placement === "side_left_fill") {
        return boundsForDisplay(getDisplayForTarget("side_left", displays, primaryDisplay));
    }

    if (placement === "side_right_fill") {
        return boundsForDisplay(getDisplayForTarget("side_right", displays, primaryDisplay));
    }

    return null;
}

function placeFocusedWindowByPlacement(dockQuery, electronScreen, placement) {
    if (!dockQuery || !placement) return false;
    if (typeof dockQuery.moveFocusedWindow !== "function") {
        return false;
    }

    var displays = getAvailableDisplays(dockQuery, electronScreen);
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = getPrimaryDisplay(dockQuery, electronScreen, displays);
    var target = resolveBoundsForPlacement(placement, displays, primary);
    if (!target || target.w <= 0 || target.h <= 0) return false;

    var payload = {
        x: Math.round(target.x),
        y: Math.round(target.y),
        w: Math.round(target.w),
        h: Math.round(target.h)
    };
    return !!dockQuery.moveFocusedWindow(payload);
}

function placeFocusedWindowByAction(dockQuery, electronScreen, action) {
    if (!dockQuery) return false;
    if (action === "fill") {
        return typeof dockQuery.fullscreenFocusedWindow === "function"
            ? !!dockQuery.fullscreenFocusedWindow()
            : false;
    }
    if (typeof dockQuery.getFocusedWindowBounds !== "function" ||
        typeof dockQuery.moveFocusedWindow !== "function") {
        return false;
    }

    var rect = dockQuery.getFocusedWindowBounds();
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) {
        return false;
    }

    var displays = getAvailableDisplays(dockQuery, electronScreen);
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = getPrimaryDisplay(dockQuery, electronScreen, displays);
    var current = getDisplayForRect(displays, rect);
    if (!current) return false;

    var target = resolveBoundsForAction(action, displays, primary, current);
    if (!target || target.w <= 0 || target.h <= 0) return false;

    var payload = {
        x: Math.round(target.x),
        y: Math.round(target.y),
        w: Math.round(target.w),
        h: Math.round(target.h)
    };
    return !!dockQuery.moveFocusedWindow(payload);
}

function placeProcessWindowByAction(processName, dockQuery, electronScreen, action) {
    if (!processName || !dockQuery) return false;
    if (action === "fill") {
        return typeof dockQuery.fullscreenApplicationWindow === "function"
            ? !!dockQuery.fullscreenApplicationWindow({ name: processName })
            : false;
    }
    if (typeof dockQuery.getApplicationWindowBounds !== "function" ||
        typeof dockQuery.moveApplicationWindow !== "function") {
        return false;
    }

    var rect = dockQuery.getApplicationWindowBounds({ name: processName });
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) {
        return false;
    }

    var displays = getAvailableDisplays(dockQuery, electronScreen);
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = getPrimaryDisplay(dockQuery, electronScreen, displays);
    var current = getDisplayForRect(displays, rect);
    if (!current) return false;

    var target = resolveBoundsForAction(action, displays, primary, current);
    if (!target || target.w <= 0 || target.h <= 0) return false;

    var payload = {
        name: processName,
        x: Math.round(target.x),
        y: Math.round(target.y),
        w: Math.round(target.w),
        h: Math.round(target.h)
    };
    return !!dockQuery.moveApplicationWindow(payload);
}

function placeProcessWindowByPlacement(processName, dockQuery, electronScreen, placement) {
    if (!processName || !dockQuery || !placement) return false;
    if (typeof dockQuery.moveApplicationWindow !== "function") {
        return false;
    }

    var displays = getAvailableDisplays(dockQuery, electronScreen);
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = getPrimaryDisplay(dockQuery, electronScreen, displays);
    var target = resolveBoundsForPlacement(placement, displays, primary);
    if (!target || target.w <= 0 || target.h <= 0) return false;

    var payload = {
        name: processName,
        x: Math.round(target.x),
        y: Math.round(target.y),
        w: Math.round(target.w),
        h: Math.round(target.h)
    };
    return !!dockQuery.moveApplicationWindow(payload);
}

function placePidWindowByPlacement(processPid, dockQuery, electronScreen, placement) {
    if (!Number.isFinite(processPid) || processPid <= 0 || !dockQuery || !placement) return false;
    if (typeof dockQuery.moveApplicationWindowByPid !== "function") {
        return false;
    }

    var displays = getAvailableDisplays(dockQuery, electronScreen);
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = getPrimaryDisplay(dockQuery, electronScreen, displays);
    var target = resolveBoundsForPlacement(placement, displays, primary);
    if (!target || target.w <= 0 || target.h <= 0) return false;

    var payload = {
        pid: Math.round(processPid),
        x: Math.round(target.x),
        y: Math.round(target.y),
        w: Math.round(target.w),
        h: Math.round(target.h)
    };
    return !!dockQuery.moveApplicationWindowByPid(payload);
}

module.exports = {
    getDisplayForRect,
    resolveBoundsForAction,
    resolveBoundsForPlacement,
    placeFocusedWindowByPlacement,
    placeFocusedWindowByAction,
    placeProcessWindowByAction,
    placeProcessWindowByPlacement,
    placePidWindowByPlacement
};
