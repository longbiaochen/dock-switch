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

function isExternalDisplay(display) {
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

function displaySortX(display) {
    var bounds = display && display.bounds;
    if (!bounds || !Number.isFinite(bounds.x)) return Number.POSITIVE_INFINITY;
    return bounds.x;
}

function getSideCandidates(displays) {
    if (!Array.isArray(displays)) return [];
    return displays.filter(display =>
        display &&
        display.internal !== true &&
        !isExternalDisplay(display)
    );
}

function getExternalDisplay(displays, primaryDisplay, currentDisplay) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    var namedExternal = displays.find(isExternalDisplay);
    if (namedExternal) return namedExternal;

    if (currentDisplay && currentDisplay.internal === false) {
        return currentDisplay;
    }

    var explicitExternal = displays.find(d => d && d.internal === false);
    if (explicitExternal) return explicitExternal;

    if (currentDisplay && Number.isFinite(currentDisplay.id)) {
        var nonCurrent = displays.find(d => d && Number.isFinite(d.id) && d.id !== currentDisplay.id);
        if (nonCurrent) return nonCurrent;
    }

    if (displays.length > 1) {
        var internalGuess = getInternalDisplay(displays, primaryDisplay);
        var externalGuess = displays
            .filter(d => d && d !== internalGuess)
            .sort((a, b) => getDisplayPixelArea(b) - getDisplayPixelArea(a))[0];
        if (externalGuess) return externalGuess;
    }

    if (primaryDisplay && Number.isFinite(primaryDisplay.id)) {
        var nonPrimary = displays.find(d => d && Number.isFinite(d.id) && d.id !== primaryDisplay.id);
        if (nonPrimary) return nonPrimary;
    }

    return displays.length > 1 ? displays[1] : null;
}

function getSideLeftDisplay(displays) {
    if (!Array.isArray(displays) || displays.length === 0) return null;
    return getSideCandidates(displays)
        .slice()
        .sort((a, b) => displaySortX(a) - displaySortX(b))[0] || null;
}

function getSideRightDisplay(displays) {
    if (!Array.isArray(displays) || displays.length === 0) return null;
    return getSideCandidates(displays)
        .slice()
        .sort((a, b) => displaySortX(b) - displaySortX(a))[0] || null;
}

function normalizeDisplayTarget(target) {
    if (target === "side") return "side_left";
    return String(target || "");
}

function getDisplayForTarget(target, displays, primaryDisplay) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    var normalizedTarget = normalizeDisplayTarget(target);
    if (normalizedTarget === "internal") {
        return getInternalDisplay(displays, primaryDisplay) || primaryDisplay || displays[0];
    }
    if (normalizedTarget === "external") {
        return getExternalDisplay(displays, primaryDisplay, null);
    }
    if (normalizedTarget === "side_left") {
        return getSideLeftDisplay(displays) || getExternalDisplay(displays, primaryDisplay, null);
    }
    if (normalizedTarget === "side_right") {
        return getSideRightDisplay(displays) || getExternalDisplay(displays, primaryDisplay, null);
    }

    return null;
}

module.exports = {
    getDisplayArea,
    getDisplayPixelArea,
    getInternalDisplay,
    getExternalDisplay,
    getSideLeftDisplay,
    getSideRightDisplay,
    getDisplayForTarget,
    normalizeDisplayTarget
};
