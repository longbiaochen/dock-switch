const DEFAULT_DOCK_ITEM_SIZE = 52;
const DEFAULT_EDGE_PADDING = 10;
const DEFAULT_OVERLAY_HEIGHT = 60;

function finiteNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function itemRect(item) {
    if (!item || !item.pos) return null;
    const x = finiteNumber(item.pos.x);
    const y = finiteNumber(item.pos.y);
    if (x === null || y === null) return null;

    const width = item.size && finiteNumber(item.size.w) !== null && item.size.w > 0
        ? item.size.w
        : DEFAULT_DOCK_ITEM_SIZE;
    const height = item.size && finiteNumber(item.size.h) !== null && item.size.h > 0
        ? item.size.h
        : DEFAULT_DOCK_ITEM_SIZE;

    return { x, y, width, height };
}

function dockRectForItems(items) {
    const rects = (items || []).map(itemRect).filter(Boolean);
    if (rects.length === 0) return null;

    const left = Math.min.apply(null, rects.map(rect => rect.x));
    const top = Math.min.apply(null, rects.map(rect => rect.y));
    const right = Math.max.apply(null, rects.map(rect => rect.x + rect.width));
    const bottom = Math.max.apply(null, rects.map(rect => rect.y + rect.height));

    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
    };
}

function resolveDockOverlayBounds(items, displays, options = {}) {
    const dockRect = dockRectForItems(items);
    if (!dockRect) return null;

    const padding = Number.isFinite(options.edgePadding)
        ? options.edgePadding
        : DEFAULT_EDGE_PADDING;
    const overlayHeight = Number.isFinite(options.overlayHeight)
        ? Math.max(1, options.overlayHeight)
        : DEFAULT_OVERLAY_HEIGHT;
    const gap = Number.isFinite(options.gap) ? options.gap : 8;
    const windowBounds = {
        x: Math.round(dockRect.x - padding),
        y: Math.round(dockRect.y - overlayHeight - gap),
        width: Math.round(dockRect.width + padding * 2),
        height: Math.round(overlayHeight)
    };

    return {
        edge: "dock",
        dockRect,
        readerHeight: 0,
        windowBounds,
        items: (items || [])
            .map(item => {
                const rect = itemRect(item);
                if (!rect) return null;
                return {
                    name: item.name,
                    rect,
                    relativeRect: {
                        x: rect.x - windowBounds.x,
                        y: rect.y - windowBounds.y,
                        width: rect.width,
                        height: rect.height
                    }
                };
            })
            .filter(Boolean)
    };
}

module.exports = {
    dockRectForItems,
    resolveDockOverlayBounds
};
