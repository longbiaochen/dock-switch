const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getDisplayForTarget,
    resolveDisplayCenterPoint
} = require("../src/display-targets");

function makeDisplay({ id, label, internal, x, y, width, height, workArea }) {
    return {
        id,
        label,
        internal,
        bounds: { x, y, width, height },
        workArea: workArea || { x, y, width, height }
    };
}

test("getDisplayForTarget returns the internal display", () => {
    const displays = [
        makeDisplay({
            id: 1,
            label: "Built-in Retina Display",
            internal: true,
            x: 0,
            y: 0,
            width: 1512,
            height: 982,
            workArea: { x: 0, y: 33, width: 1512, height: 875 }
        }),
        makeDisplay({
            id: 4,
            label: "DELL U3219Q",
            internal: false,
            x: -579,
            y: -1440,
            width: 2560,
            height: 1440,
            workArea: { x: -579, y: -1410, width: 2560, height: 1410 }
        }),
        makeDisplay({
            id: 5,
            label: "Side Monitor",
            internal: false,
            x: -2499,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: -2499, y: -1050, width: 1920, height: 1050 }
        })
    ];

    assert.equal(getDisplayForTarget("internal", displays, displays[0]), displays[0]);
});

test("getDisplayForTarget returns the named external display", () => {
    const displays = [
        makeDisplay({
            id: 1,
            label: "Built-in Retina Display",
            internal: true,
            x: 0,
            y: 0,
            width: 1512,
            height: 982,
            workArea: { x: 0, y: 33, width: 1512, height: 875 }
        }),
        makeDisplay({
            id: 5,
            label: "Side Monitor",
            internal: false,
            x: -2499,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: -2499, y: -1050, width: 1920, height: 1050 }
        }),
        makeDisplay({
            id: 4,
            label: "DELL U3219Q",
            internal: false,
            x: -579,
            y: -1440,
            width: 2560,
            height: 1440,
            workArea: { x: -579, y: -1410, width: 2560, height: 1410 }
        })
    ];

    assert.equal(getDisplayForTarget("external", displays, displays[0]), displays[2]);
});

test("getDisplayForTarget returns the side display and falls back to external", () => {
    const withSide = [
        makeDisplay({
            id: 1,
            label: "Built-in Retina Display",
            internal: true,
            x: 0,
            y: 0,
            width: 1512,
            height: 982,
            workArea: { x: 0, y: 33, width: 1512, height: 875 }
        }),
        makeDisplay({
            id: 4,
            label: "DELL U3219Q",
            internal: false,
            x: -579,
            y: -1440,
            width: 2560,
            height: 1440,
            workArea: { x: -579, y: -1410, width: 2560, height: 1410 }
        }),
        makeDisplay({
            id: 5,
            label: "Side Monitor",
            internal: false,
            x: -2499,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: -2499, y: -1050, width: 1920, height: 1050 }
        })
    ];
    const withoutSide = withSide.slice(0, 2);

    assert.equal(getDisplayForTarget("side_left", withSide, withSide[0]), withSide[2]);
    assert.equal(getDisplayForTarget("side_left", withoutSide, withoutSide[0]), withoutSide[1]);
    assert.equal(getDisplayForTarget("side", withSide, withSide[0]), withSide[2]);
});

test("getDisplayForTarget maps the current four-display layout", () => {
    const displays = [
        makeDisplay({
            id: 1,
            label: "Built-in Retina Display",
            internal: true,
            x: 0,
            y: 0,
            width: 1512,
            height: 982,
            workArea: { x: 0, y: 33, width: 1512, height: 875 }
        }),
        makeDisplay({
            id: 2,
            label: "Mi Monitor (1)",
            internal: false,
            x: -2444,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: -2444, y: -1050, width: 1920, height: 1050 }
        }),
        makeDisplay({
            id: 3,
            label: "Mi Monitor (2)",
            internal: false,
            x: 2036,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: 2036, y: -1050, width: 1920, height: 1050 }
        }),
        makeDisplay({
            id: 5,
            label: "DELL U3219Q",
            internal: false,
            x: -524,
            y: -1440,
            width: 2560,
            height: 1440,
            workArea: { x: -524, y: -1410, width: 2560, height: 1410 }
        })
    ];

    assert.equal(getDisplayForTarget("internal", displays, displays[0]), displays[0]);
    assert.equal(getDisplayForTarget("external", displays, displays[0]), displays[3]);
    assert.equal(getDisplayForTarget("side_left", displays, displays[0]), displays[1]);
    assert.equal(getDisplayForTarget("side_right", displays, displays[0]), displays[2]);
});

test("resolveDisplayCenterPoint uses the display work area center", () => {
    const display = makeDisplay({
        id: 3,
        label: "Mi Monitor (2)",
        internal: false,
        x: 2036,
        y: -1080,
        width: 1920,
        height: 1080,
        workArea: { x: 2036, y: -1050, width: 1920, height: 1050 }
    });

    assert.deepEqual(resolveDisplayCenterPoint(display), {
        x: 2996,
        y: -525
    });
});
