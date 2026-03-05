function getDisplayArea(display) {
    if (!display) return null;
    return display.workArea || display.bounds || null;
}

function isCurrentDisplayInternal(currentDisplay, primaryDisplay) {
    if (!currentDisplay) return false;
    if (currentDisplay.internal === true) return true;
    if (currentDisplay.internal === false) return false;
    return !!(primaryDisplay &&
        Number.isFinite(primaryDisplay.id) &&
        Number.isFinite(currentDisplay.id) &&
        primaryDisplay.id === currentDisplay.id);
}

function getExternalDisplay(displays, primaryDisplay, currentDisplay) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    if (currentDisplay && currentDisplay.internal === false) {
        return currentDisplay;
    }

    var explicitExternal = displays.find(d => d && d.internal === false);
    if (explicitExternal) return explicitExternal;

    if (currentDisplay && Number.isFinite(currentDisplay.id)) {
        var nonCurrent = displays.find(d => d && Number.isFinite(d.id) && d.id !== currentDisplay.id);
        if (nonCurrent) return nonCurrent;
    }

    if (primaryDisplay && Number.isFinite(primaryDisplay.id)) {
        var nonPrimary = displays.find(d => d && Number.isFinite(d.id) && d.id !== primaryDisplay.id);
        if (nonPrimary) return nonPrimary;
    }

    return displays.length > 1 ? displays[1] : null;
}

function getInternalDisplay(displays, primaryDisplay) {
    if (!Array.isArray(displays)) return primaryDisplay || null;
    return displays.find(d => d && d.internal === true) || primaryDisplay || displays[0] || null;
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

function resolveBoundsForAction(action, displays, primaryDisplay, currentDisplay) {
    var currentArea = getDisplayArea(currentDisplay);
    if (!currentArea) return null;
    var external = getExternalDisplay(displays, primaryDisplay, currentDisplay);

    if (action === "left") {
        var leftBase = currentArea;
        var wLeft = Math.floor(leftBase.width / 2);
        return { x: leftBase.x, y: leftBase.y, w: wLeft, h: leftBase.height };
    }
    if (action === "right") {
        var rightBase = currentArea;
        var wRight = Math.floor(rightBase.width / 2);
        return {
            x: rightBase.x + wRight,
            y: rightBase.y,
            w: rightBase.width - wRight,
            h: rightBase.height
        };
    }
    if (action === "fill") {
        var b = currentDisplay && currentDisplay.bounds;
        if (b) {
            return { x: b.x, y: b.y, w: b.width, h: b.height };
        }
        return { x: currentArea.x, y: currentArea.y, w: currentArea.width, h: currentArea.height };
    }
    if (action === "up" || action === "down") {
        var internal = getInternalDisplay(displays, primaryDisplay) || currentDisplay;
        var currentIsInternal = isCurrentDisplayInternal(currentDisplay, primaryDisplay);
        var targetDisplay = currentDisplay;
        if (action === "up") {
            if (currentIsInternal && external) {
                targetDisplay = external;
            } else {
                targetDisplay = internal;
            }
        } else {
            if (currentIsInternal) {
                return null;
            }
            targetDisplay = internal || currentDisplay;
        }
        var targetArea = getDisplayArea(targetDisplay);
        if (!targetArea) return null;
        return { x: targetArea.x, y: targetArea.y, w: targetArea.width, h: targetArea.height };
    }

    return null;
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

    var displays = electronScreen.getAllDisplays();
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = electronScreen.getPrimaryDisplay();
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

    var displays = electronScreen.getAllDisplays();
    if (!Array.isArray(displays) || displays.length === 0) return false;
    var primary = electronScreen.getPrimaryDisplay();
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

module.exports = {
    getDisplayForRect,
    resolveBoundsForAction,
    placeFocusedWindowByAction,
    placeProcessWindowByAction
};
