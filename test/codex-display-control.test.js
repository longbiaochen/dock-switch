const test = require("node:test");
const assert = require("node:assert/strict");

const {
    normalizeCodexDisplayTarget,
    placementForDisplayTarget,
    selectCodexDisplay
} = require("../src/codex-display-control");

function makeDisplay({ id, label, internal, x, y, width, height, workArea }) {
    return {
        id,
        label,
        internal,
        bounds: { x, y, width, height },
        workArea: workArea || { x, y, width, height }
    };
}

function makeDisplays() {
    return [
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
}

function makeScreen(displays) {
    return {
        getAllDisplays: () => displays,
        getPrimaryDisplay: () => displays[0]
    };
}

test("normalizeCodexDisplayTarget maps physical button names to display targets", () => {
    assert.equal(normalizeCodexDisplayTarget("minus"), "side_left");
    assert.equal(normalizeCodexDisplayTarget("voice"), "external");
    assert.equal(normalizeCodexDisplayTarget("green"), "side_right");
    assert.equal(normalizeCodexDisplayTarget("plus"), "internal");
    assert.equal(placementForDisplayTarget("right"), "side_right_fill");
});

test("selectCodexDisplay focuses an existing Codex window on the target display", async () => {
    const displays = makeDisplays();
    const focused = [];
    const mouseMoves = [];
    const feedbackPoints = [];
    const moves = [];
    const dockQuery = {
        getApplicationWindows: () => [
            { pid: 10, windowIndex: 0, x: -2300, y: -1000, w: 900, h: 700, focused: false, main: true },
            { pid: 10, windowIndex: 1, x: 100, y: 100, w: 900, h: 700, focused: true, main: false }
        ],
        focusApplicationWindowByPid: payload => {
            focused.push(payload);
            return true;
        },
        moveApplicationWindowByPidAndIndex: payload => {
            moves.push(payload);
            return true;
        },
        moveMouse: payload => {
            mouseMoves.push(payload);
            return true;
        }
    };

    const result = await selectCodexDisplay({ target: "minus" }, {
        dockQuery,
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true,
        showMouseFeedback: point => feedbackPoints.push(point)
    });

    assert.equal(result.ok, true);
    assert.equal(result.target, "side_left");
    assert.equal(result.reusedExistingTargetWindow, true);
    assert.equal(result.moved, false);
    assert.deepEqual(focused[0], { pid: 10, windowIndex: 0 });
    assert.deepEqual(mouseMoves[0], { x: -1484, y: -525 });
    assert.deepEqual(result.feedbackPoint, { x: -1484, y: -525 });
    assert.deepEqual(feedbackPoints[0], { x: -1484, y: -525 });
    assert.deepEqual(moves, []);
});

test("selectCodexDisplay only moves the mouse when target display has no Codex window", async () => {
    const displays = makeDisplays();
    const moves = [];
    const focused = [];
    const mouseMoves = [];
    const feedbackPoints = [];
    const dockQuery = {
        getApplicationWindows: () => [
            { pid: 20, windowIndex: 3, x: 20, y: 80, w: 900, h: 700, focused: true, main: true }
        ],
        moveApplicationWindowByPidAndIndex: payload => {
            moves.push(payload);
            return true;
        },
        focusApplicationWindowByPid: payload => {
            focused.push(payload);
            return true;
        },
        moveMouse: payload => {
            mouseMoves.push(payload);
            return true;
        }
    };

    const result = await selectCodexDisplay({ target: "external" }, {
        dockQuery,
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true,
        showMouseFeedback: point => feedbackPoints.push(point)
    });

    assert.equal(result.ok, true);
    assert.equal(result.moved, false);
    assert.equal(result.focused, false);
    assert.equal(result.selectedWindow, null);
    assert.deepEqual(moves, []);
    assert.deepEqual(focused, []);
    assert.deepEqual(mouseMoves[0], { x: 756, y: -705 });
    assert.deepEqual(result.feedbackPoint, { x: 756, y: -705 });
    assert.deepEqual(feedbackPoints[0], { x: 756, y: -705 });
});

test("selectCodexDisplay does not open Codex when no window exists", async () => {
    const displays = makeDisplays();
    let calls = 0;
    let opens = 0;
    const dockQuery = {
        getApplicationWindows: () => {
            calls += 1;
            if (calls === 1) return [];
            return [
                { pid: 30, windowIndex: 0, x: 50, y: 80, w: 900, h: 700, focused: false, main: true }
            ];
        },
        focusApplicationWindowByPid: () => true,
        moveMouse: () => true
    };

    const result = await selectCodexDisplay({ target: "plus", timeoutMs: 400 }, {
        dockQuery,
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true,
        openApplication: async () => {
            opens += 1;
        }
    });

    assert.equal(result.ok, true);
    assert.equal(opens, 0);
    assert.equal(calls, 1);
    assert.equal(result.selectedWindow, null);
    assert.equal(result.focused, false);
});

test("selectCodexDisplay rejects invalid targets", async () => {
    const result = await selectCodexDisplay({ target: "unknown" }, {
        dockQuery: {},
        electronScreen: makeScreen(makeDisplays()),
        ensurePermissions: () => true
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /target must/);
});
