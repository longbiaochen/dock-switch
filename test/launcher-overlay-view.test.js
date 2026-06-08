const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildReadableOverlayTarget,
    displayName,
    readableKey
} = require("../src/launcher-overlay-view");

function layout(width = 90, height = 86) {
    return {
        windowBounds: { x: 0, y: 896, width, height }
    };
}

test("readable overlay target includes key, label, and a full clickable area", () => {
    const target = buildReadableOverlayTarget(
        { name: "Finder", key: "F" },
        {
            name: "Finder",
            relativeRect: { x: 10, y: 10, width: 50, height: 66 }
        },
        layout()
    );

    assert.equal(target.key, "F");
    assert.equal(target.label, "Finder");
    assert.equal(target.title, "F Finder");
    assert.equal(target.targetStyle.width >= 52, true);
    assert.equal(target.targetStyle.height >= 76, true);
    assert.equal(target.targetStyle.left >= 0, true);
    assert.equal(target.targetStyle.top, 0);
});

test("readable overlay target clamps to the window bounds", () => {
    const target = buildReadableOverlayTarget(
        { name: "Safari", key: "S" },
        {
            name: "Safari",
            relativeRect: { x: 72, y: 10, width: 50, height: 66 }
        },
        layout(100, 86)
    );

    assert.equal(target.targetStyle.left + target.targetStyle.width <= 100, true);
    assert.equal(target.targetStyle.top + target.targetStyle.height <= 86, true);
});

test("readable overlay target respects the reserved reader rail", () => {
    const target = buildReadableOverlayTarget(
        { name: "Finder", key: "F" },
        {
            name: "Finder",
            relativeRect: { x: 10, y: 46, width: 50, height: 66 }
        },
        layout(120, 124),
        { reservedTop: 34 }
    );

    assert.equal(target.targetStyle.top >= 34, true);
});

test("displayName truncates long app names for visual reading", () => {
    assert.equal(displayName("Very Long Application Name", 13), "Very Long ...");
    assert.equal(displayName("Mail", 13), "Mail");
});

test("readableKey prefers configured icons over raw keys", () => {
    assert.equal(readableKey({ icon: "⇧", key: "SHIFT" }), "⇧");
    assert.equal(readableKey({ key: "A" }), "A");
});
