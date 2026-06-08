const DEFAULT_MIN_TARGET_WIDTH = 52;
const DEFAULT_LABEL_HEIGHT = 24;
const DEFAULT_TARGET_PADDING = 4;

function finiteNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
    if (max < min) return min;
    return Math.max(min, Math.min(value, max));
}

function displayName(name, maxLength = 13) {
    const text = String(name || "").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(1, maxLength - 3))}...`;
}

function readableKey(item) {
    return String((item && (item.icon || item.key)) || "").trim();
}

function buildReadableOverlayTarget(item, overlayItem, overlayLayout, options = {}) {
    if (!item || !overlayItem || !overlayItem.relativeRect || !overlayLayout) {
        return null;
    }

    const rect = overlayItem.relativeRect;
    const windowBounds = overlayLayout.windowBounds || {};
    const windowWidth = finiteNumber(windowBounds.width);
    const windowHeight = finiteNumber(windowBounds.height);
    const x = finiteNumber(rect.x);
    const y = finiteNumber(rect.y);
    const width = finiteNumber(rect.width);
    const height = finiteNumber(rect.height);
    if ([windowWidth, windowHeight, x, y, width, height].some(value => value === null)) {
        return null;
    }

    const padding = Number.isFinite(options.padding) ? options.padding : DEFAULT_TARGET_PADDING;
    const labelHeight = Number.isFinite(options.labelHeight) ? options.labelHeight : DEFAULT_LABEL_HEIGHT;
    const reservedTop = Number.isFinite(options.reservedTop) ? Math.max(0, options.reservedTop) : 0;
    const minTargetWidth = Number.isFinite(options.minTargetWidth)
        ? options.minTargetWidth
        : DEFAULT_MIN_TARGET_WIDTH;

    const targetWidth = Math.min(
        windowWidth,
        Math.max(minTargetWidth, width + padding * 2)
    );
    const targetHeight = Math.min(
        windowHeight,
        Math.max(height + labelHeight + padding, height + padding * 2)
    );
    const targetLeft = clamp(
        Math.round(x + width / 2 - targetWidth / 2),
        0,
        windowWidth - targetWidth
    );
    const targetTop = clamp(
        Math.round(y - labelHeight),
        reservedTop,
        windowHeight - targetHeight
    );
    const iconTop = clamp(
        Math.round(y - targetTop),
        labelHeight,
        Math.max(labelHeight, targetHeight - height)
    );

    const key = readableKey(item);
    const name = String(item.name || overlayItem.name || "");
    return {
        item,
        key,
        label: displayName(name),
        title: key ? `${key} ${name}` : name,
        targetStyle: {
            left: targetLeft,
            top: targetTop,
            width: Math.round(targetWidth),
            height: Math.round(targetHeight)
        },
        iconStyle: {
            top: iconTop,
            height: Math.round(height)
        }
    };
}

module.exports = {
    buildReadableOverlayTarget,
    displayName,
    readableKey
};
