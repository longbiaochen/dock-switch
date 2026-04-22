function getDisplayArea(display) {
    if (!display) return null;
    return display.workArea || display.bounds || null;
}

function getDisplayPixelArea(display) {
    var area = getDisplayArea(display);
    if (!area) return 0;
    return Math.max(0, area.width) * Math.max(0, area.height);
}

function isDisplayLabel(display, pattern) {
    return !!(display &&
        typeof display.label === "string" &&
        pattern.test(display.label.trim()));
}

function isSideDisplay(display) {
    return isDisplayLabel(display, /^H279$/i) ||
        isDisplayLabel(display, /(^|\s)h279(\s|$)/i);
}

function isExternalCodexDisplay(display) {
    return isDisplayLabel(display, /^DELL U3219Q$/i) ||
        isDisplayLabel(display, /(^|\s)dell\s+u3219q(\s|$)/i);
}

function getInternalDisplay(displays, primaryDisplay) {
    if (!Array.isArray(displays)) return primaryDisplay || null;
    var explicitInternal = displays.find(d => d && d.internal === true);
    if (explicitInternal) return explicitInternal;
    if (displays.length > 1) {
        var smallest = displays
            .filter(Boolean)
            .sort((a, b) => getDisplayPixelArea(a) - getDisplayPixelArea(b))[0];
        if (smallest) return smallest;
    }
    return primaryDisplay || displays[0] || null;
}

function getExternalDisplay(displays, primaryDisplay, currentDisplay) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    var namedExternal = displays.find(isExternalCodexDisplay);
    if (namedExternal) return namedExternal;

    if (currentDisplay && currentDisplay.internal === false && !isSideDisplay(currentDisplay)) {
        return currentDisplay;
    }

    var explicitExternal = displays.find(d => d && d.internal === false && !isSideDisplay(d));
    if (explicitExternal) return explicitExternal;

    if (currentDisplay && Number.isFinite(currentDisplay.id)) {
        var nonCurrent = displays.find(d => d && Number.isFinite(d.id) && d.id !== currentDisplay.id);
        if (nonCurrent) return nonCurrent;
    }

    if (displays.length > 1) {
        var internalGuess = getInternalDisplay(displays, primaryDisplay);
        var externalGuess = displays
            .filter(d => d && d !== internalGuess && !isSideDisplay(d))
            .sort((a, b) => getDisplayPixelArea(b) - getDisplayPixelArea(a))[0];
        if (externalGuess) return externalGuess;
    }

    if (primaryDisplay && Number.isFinite(primaryDisplay.id)) {
        var nonPrimary = displays.find(d => d && Number.isFinite(d.id) && d.id !== primaryDisplay.id);
        if (nonPrimary) return nonPrimary;
    }

    return displays.length > 1 ? displays[1] : null;
}

function getSideDisplay(displays) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    var exactLabel = displays.find(display =>
        display &&
        typeof display.label === "string" &&
        display.label.trim() === "H279"
    );
    if (exactLabel) return exactLabel;

    var labelMatch = displays.find(display =>
        display &&
        typeof display.label === "string" &&
        /(^|\s)h279(\s|$)/i.test(display.label)
    );
    if (labelMatch) return labelMatch;

    return null;
}

function normalizeDisplayTarget(target) {
    if (target === "side") return "side_left";
    return String(target || "");
}

function resolveMouseTargetPoint(target, displays, primaryDisplay) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    var normalizedTarget = normalizeDisplayTarget(target);
    var display = null;
    if (normalizedTarget === "internal") {
        display = getInternalDisplay(displays, primaryDisplay) || primaryDisplay || displays[0];
    } else if (normalizedTarget === "external") {
        display = getExternalDisplay(displays, primaryDisplay, null);
    } else if (normalizedTarget === "side_left") {
        display = getSideDisplay(displays) || getExternalDisplay(displays, primaryDisplay, null);
    }

    var area = getDisplayArea(display);
    if (!area) return null;
    return {
        x: Math.floor(area.x + area.width / 2),
        y: Math.floor(area.y + area.height / 2)
    };
}

module.exports = {
    getDisplayArea,
    getDisplayPixelArea,
    getInternalDisplay,
    getExternalDisplay,
    getSideDisplay,
    normalizeDisplayTarget,
    resolveMouseTargetPoint
};
