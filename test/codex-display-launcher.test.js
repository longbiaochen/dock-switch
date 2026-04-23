const test = require("node:test");
const assert = require("node:assert/strict");

const {
    classifyWindowDisplayTarget,
    chooseCodexWindowForDisplay,
    chooseCreatedCodexWindow,
    findNewCodexWindow,
    resolveCodexPlacementForDisplayTarget
} = require("../src/codex-display-launcher");

function makeDisplay({ id, label, internal, x, y, width, height, workArea }) {
    return {
        id,
        label,
        internal,
        bounds: { x, y, width, height },
        workArea: workArea || { x, y, width, height }
    };
}

function makeWindow({ pid, windowIndex, x, y, w, h, focused = false, main = false }) {
    return { pid, windowIndex, x, y, w, h, focused, main };
}

test("resolveCodexPlacementForDisplayTarget treats side as side-left alias", () => {
    assert.equal(resolveCodexPlacementForDisplayTarget("internal"), "internal_fill");
    assert.equal(resolveCodexPlacementForDisplayTarget("external"), "external_fill");
    assert.equal(resolveCodexPlacementForDisplayTarget("side_left"), "side_left_fill");
    assert.equal(resolveCodexPlacementForDisplayTarget("side_right"), "side_right_fill");
    assert.equal(resolveCodexPlacementForDisplayTarget("side"), "side_left_fill");
});

test("chooseCodexWindowForDisplay prefers focused then main then first usable on target display", () => {
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
    const windows = [
        makeWindow({ pid: 100, windowIndex: 2, x: -400, y: -1200, w: 1200, h: 900, main: true }),
        makeWindow({ pid: 100, windowIndex: 5, x: -300, y: -1180, w: 1200, h: 900, focused: true }),
        makeWindow({ pid: 100, windowIndex: 8, x: 10, y: 40, w: 1200, h: 800 })
    ];

    assert.deepEqual(
        chooseCodexWindowForDisplay(windows, "external", displays, displays[0]),
        windows[1]
    );
    assert.deepEqual(
        chooseCodexWindowForDisplay(windows.filter(w => !w.focused), "external", displays, displays[0]),
        windows[0]
    );
    assert.deepEqual(
        chooseCodexWindowForDisplay([
            makeWindow({ pid: 100, windowIndex: 2, x: -579, y: -1410, w: 1280, h: 1410 }),
            makeWindow({ pid: 100, windowIndex: 5, x: -579, y: -1410, w: 2560, h: 1410 })
        ], "external", displays, displays[0]),
        makeWindow({ pid: 100, windowIndex: 5, x: -579, y: -1410, w: 2560, h: 1410 })
    );
    assert.deepEqual(
        chooseCodexWindowForDisplay(windows, "internal", displays, displays[0]),
        windows[2]
    );
});

test("chooseCodexWindowForDisplay falls back from side to external when side display is offline", () => {
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
    const windows = [
        makeWindow({ pid: 100, windowIndex: 1, x: -300, y: -1180, w: 1200, h: 900, focused: true })
    ];

    assert.deepEqual(
        chooseCodexWindowForDisplay(windows, "side_left", displays, displays[0]),
        windows[0]
    );
    assert.deepEqual(
        chooseCodexWindowForDisplay(windows, "side", displays, displays[0]),
        windows[0]
    );
});

test("classifyWindowDisplayTarget distinguishes all four current display targets", () => {
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

    assert.equal(
        classifyWindowDisplayTarget(makeWindow({ pid: 100, windowIndex: 1, x: 20, y: 50, w: 800, h: 600 }), displays, displays[0]),
        "internal"
    );
    assert.equal(
        classifyWindowDisplayTarget(makeWindow({ pid: 100, windowIndex: 2, x: -2100, y: -900, w: 800, h: 600 }), displays, displays[0]),
        "side_left"
    );
    assert.equal(
        classifyWindowDisplayTarget(makeWindow({ pid: 100, windowIndex: 3, x: 2500, y: -900, w: 800, h: 600 }), displays, displays[0]),
        "side_right"
    );
    assert.equal(
        classifyWindowDisplayTarget(makeWindow({ pid: 100, windowIndex: 4, x: 0, y: -1200, w: 1200, h: 900 }), displays, displays[0]),
        "external"
    );
});

test("findNewCodexWindow returns a window that did not exist in the previous snapshot", () => {
    const before = [
        makeWindow({ pid: 100, windowIndex: 1, x: 0, y: 33, w: 1512, h: 875 }),
        makeWindow({ pid: 100, windowIndex: 2, x: -579, y: -1410, w: 2560, h: 1410 })
    ];
    const after = [
        ...before,
        makeWindow({ pid: 100, windowIndex: 3, x: 20, y: 50, w: 1100, h: 900, focused: true })
    ];

    assert.deepEqual(findNewCodexWindow(before, after), after[2]);
});

test("chooseCreatedCodexWindow returns only a newly created window, not the old focused window", () => {
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
    const before = [
        makeWindow({ pid: 100, windowIndex: 0, x: -2499, y: -1050, w: 1920, h: 1050, focused: true, main: true }),
        makeWindow({ pid: 100, windowIndex: 1, x: -579, y: -1410, w: 2560, h: 1410 })
    ];
    const after = [
        makeWindow({ pid: 100, windowIndex: 0, x: -2499, y: -1050, w: 1920, h: 1050, focused: true, main: true }),
        makeWindow({ pid: 100, windowIndex: 1, x: -579, y: -1410, w: 2560, h: 1410 }),
        makeWindow({ pid: 100, windowIndex: 2, x: 30, y: 60, w: 1200, h: 900 })
    ];

    assert.deepEqual(
        chooseCreatedCodexWindow(before, after, "internal", displays, displays[0]),
        after[2]
    );
});

test("chooseCreatedCodexWindow returns null when no newly created window can be identified", () => {
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
        })
    ];
    const before = [
        makeWindow({ pid: 100, windowIndex: 0, x: 0, y: 33, w: 1512, h: 875, focused: true, main: true })
    ];
    const after = [
        makeWindow({ pid: 100, windowIndex: 2, x: 0, y: 33, w: 1512, h: 875, focused: true, main: true })
    ];

    assert.equal(chooseCreatedCodexWindow(before, after, "internal", displays, displays[0]), null);
});
