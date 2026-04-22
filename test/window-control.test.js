const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveBoundsForPlacement } = require("../src/window-control");

function makeDisplay({ id, label, internal, x, y, width, height, workArea }) {
    return {
        id,
        label,
        internal,
        bounds: { x, y, width, height },
        workArea: workArea || { x, y, width, height }
    };
}

test("resolveBoundsForPlacement uses the side display work area for side_fill", () => {
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
            label: "H279",
            internal: false,
            x: -2499,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: -2499, y: -1050, width: 1920, height: 1050 }
        })
    ];

    assert.deepEqual(
        resolveBoundsForPlacement("side_fill", displays, displays[0]),
        { x: -2499, y: -1050, w: 1920, h: 1050 }
    );
});

test("resolveBoundsForPlacement falls back to the external display when side display is offline", () => {
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
        })
    ];

    assert.deepEqual(
        resolveBoundsForPlacement("side_fill", displays, displays[0]),
        { x: -579, y: -1410, w: 2560, h: 1410 }
    );
});

test("resolveBoundsForPlacement uses the external display work area for external_fill", () => {
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
            label: "H279",
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

    assert.deepEqual(
        resolveBoundsForPlacement("external_fill", displays, displays[0]),
        { x: -579, y: -1410, w: 2560, h: 1410 }
    );
});
