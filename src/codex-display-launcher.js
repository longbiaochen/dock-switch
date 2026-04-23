const { getDisplayForRect } = require("./window-control");
const {
    getDisplayTargetName,
    getSideLeftDisplay,
    getSideRightDisplay,
    normalizeDisplayTarget
} = require("./display-targets");

function resolveCodexPlacementForDisplayTarget(target) {
    var normalizedTarget = normalizeDisplayTarget(target);
    if (normalizedTarget === "internal") return "internal_fill";
    if (normalizedTarget === "external") return "external_fill";
    if (normalizedTarget === "side_left") return "side_left_fill";
    if (normalizedTarget === "side_right") return "side_right_fill";
    return "";
}

function classifyWindowDisplayTarget(windowInfo, displays, primaryDisplay) {
    if (!windowInfo) return "";
    var display = getDisplayForRect(displays, windowInfo);
    if (!display) return "";

    return getDisplayTargetName(display, displays, primaryDisplay);
}

function chooseCodexWindowForDisplay(windows, target, displays, primaryDisplay) {
    var effectiveTarget = normalizeDisplayTarget(target);
    if (effectiveTarget === "side_left" && !getSideLeftDisplay(displays)) {
        effectiveTarget = "external";
    }
    if (effectiveTarget === "side_right" && !getSideRightDisplay(displays)) {
        effectiveTarget = "external";
    }

    var candidates = (windows || [])
        .filter(windowInfo => classifyWindowDisplayTarget(windowInfo, displays, primaryDisplay) === effectiveTarget)
        .sort((a, b) => {
            if (!!a.focused !== !!b.focused) return a.focused ? -1 : 1;
            if (!!a.main !== !!b.main) return a.main ? -1 : 1;
            var areaA = Math.max(0, Number(a.w) || 0) * Math.max(0, Number(a.h) || 0);
            var areaB = Math.max(0, Number(b.w) || 0) * Math.max(0, Number(b.h) || 0);
            if (areaA !== areaB) return areaB - areaA;
            return a.windowIndex - b.windowIndex;
        });

    return candidates.length > 0 ? candidates[0] : null;
}

function windowGeometryIdentity(windowInfo) {
    return [
        windowInfo && windowInfo.pid,
        windowInfo && Math.round(Number(windowInfo.x)),
        windowInfo && Math.round(Number(windowInfo.y)),
        windowInfo && Math.round(Number(windowInfo.w)),
        windowInfo && Math.round(Number(windowInfo.h))
    ].join(":");
}

function decrementCount(map, key) {
    var count = map.get(key) || 0;
    if (count <= 1) {
        map.delete(key);
    } else {
        map.set(key, count - 1);
    }
}

function findNewCodexWindow(beforeWindows, afterWindows) {
    var existing = new Map();
    (beforeWindows || []).forEach(windowInfo => {
        var key = windowGeometryIdentity(windowInfo);
        existing.set(key, (existing.get(key) || 0) + 1);
    });

    var candidates = [];
    (afterWindows || []).forEach(windowInfo => {
        var key = windowGeometryIdentity(windowInfo);
        if (existing.has(key)) {
            decrementCount(existing, key);
            return;
        }
        candidates.push(windowInfo);
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
        if (!!a.focused !== !!b.focused) return a.focused ? -1 : 1;
        if (!!a.main !== !!b.main) return a.main ? -1 : 1;
        return a.windowIndex - b.windowIndex;
    });
    return candidates[0];
}

function chooseCreatedCodexWindow(beforeWindows, afterWindows, target, displays, primaryDisplay) {
    return findNewCodexWindow(beforeWindows, afterWindows);
}

module.exports = {
    resolveCodexPlacementForDisplayTarget,
    classifyWindowDisplayTarget,
    chooseCodexWindowForDisplay,
    findNewCodexWindow,
    chooseCreatedCodexWindow
};
