const test = require("node:test");
const assert = require("node:assert/strict");

const {
    dockRectForItems,
    resolveDockOverlayBounds
} = require("../src/dock-overlay");

function display({ x = 0, y = 0, width = 1512, height = 982 } = {}) {
    return {
        bounds: { x, y, width, height },
        workArea: { x, y, width, height }
    };
}

test("Dock overlay uses a direct absolute offset from Dock item bounds", () => {
    const items = [
        { name: "Finder", pos: { x: 480, y: 900 }, size: { w: 58, h: 58 } },
        { name: "Safari", pos: { x: 552, y: 900 }, size: { w: 58, h: 58 } }
    ];

    const layout = resolveDockOverlayBounds(items, [display()], { edgePadding: 10 });

    assert.equal(layout.edge, "dock");
    assert.deepEqual(layout.windowBounds, {
        x: 470,
        y: 832,
        width: 150,
        height: 60
    });
    assert.equal(layout.readerHeight, 0);
    assert.deepEqual(layout.items[0].relativeRect, {
        x: 10,
        y: 68,
        width: 58,
        height: 58
    });
});

test("Dock item size contributes to the Dock rectangle", () => {
    const items = [
        { name: "Finder", pos: { x: 100, y: 900 }, size: { w: 64, h: 64 } },
        { name: "Safari", pos: { x: 180, y: 900 }, size: { w: 64, h: 64 } }
    ];

    assert.deepEqual(dockRectForItems(items), {
        x: 100,
        y: 900,
        width: 144,
        height: 64
    });
});

test("overlay does not clamp to the display bounds", () => {
    const items = [
        { name: "Finder", pos: { x: 1480, y: 900 }, size: { w: 58, h: 58 } },
        { name: "Safari", pos: { x: 1540, y: 900 }, size: { w: 58, h: 58 } }
    ];

    const layout = resolveDockOverlayBounds(items, [display()], { edgePadding: 10 });

    assert.equal(layout.windowBounds.x, 1470);
    assert.equal(layout.windowBounds.x + layout.windowBounds.width, 1608);
    assert.equal(layout.items[0].relativeRect.x, 1480 - layout.windowBounds.x);
});

test("multi-display overlay is independent of mouse or display ordering", () => {
    const displays = [
        display({ x: 0, y: 0, width: 1512, height: 982 }),
        display({ x: -579, y: -1410, width: 2560, height: 1410 })
    ];
    const items = [
        { name: "Finder", pos: { x: -120, y: -92 }, size: { w: 58, h: 58 } },
        { name: "Safari", pos: { x: -48, y: -92 }, size: { w: 58, h: 58 } }
    ];

    const layout = resolveDockOverlayBounds(items, displays, { edgePadding: 10 });

    assert.equal(layout.edge, "dock");
    assert.equal(layout.windowBounds.y, -160);
    assert.equal(layout.windowBounds.x, -130);
});

test("old Dock items without size fall back to the historical item size estimate", () => {
    const items = [
        { name: "Finder", pos: { x: 400, y: 900 } },
        { name: "Safari", pos: { x: 460, y: 900 } }
    ];

    assert.deepEqual(dockRectForItems(items), {
        x: 400,
        y: 900,
        width: 112,
        height: 52
    });
});
