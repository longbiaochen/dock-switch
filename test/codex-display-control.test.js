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
            label: "Internal Display",
            internal: true,
            x: 0,
            y: 0,
            width: 1512,
            height: 982,
            workArea: { x: 0, y: 33, width: 1512, height: 875 }
        }),
        makeDisplay({
            id: 2,
            label: "Left Side Display",
            internal: false,
            x: -2444,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: -2444, y: -1050, width: 1920, height: 1050 }
        }),
        makeDisplay({
            id: 3,
            label: "Right Side Display",
            internal: false,
            x: 2036,
            y: -1080,
            width: 1920,
            height: 1080,
            workArea: { x: 2036, y: -1050, width: 1920, height: 1050 }
        }),
        makeDisplay({
            id: 5,
            label: "External Display",
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

test("normalizeCodexDisplayTarget rejects non-display hardware button names", () => {
    for (const removed of ["minus", "voice", "green", "switch", "plus", "+", "add", "volume_up", "volume-up", "volume+"]) {
        assert.equal(normalizeCodexDisplayTarget(removed), "");
        assert.equal(placementForDisplayTarget(removed), "");
    }

    assert.equal(normalizeCodexDisplayTarget("side_right"), "side_right");
    assert.equal(placementForDisplayTarget("right"), "side_right_fill");
});

test("selectCodexDisplay focuses an existing Codex window on the target display", async () => {
    const displays = makeDisplays();
    const focused = [];
    const mouseMoves = [];
    const mouseClicks = [];
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
        },
        clickMouse: payload => {
            mouseClicks.push(payload);
            return true;
        }
    };

    const result = await selectCodexDisplay({ target: "side_left" }, {
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
    assert.deepEqual(mouseClicks[0], { x: -1484, y: -525 });
    assert.deepEqual(result.feedbackPoint, { x: -1484, y: -525 });
    assert.deepEqual(feedbackPoints[0], { x: -1484, y: -525 });
    assert.deepEqual(moves, []);
});

test("selectCodexDisplay creates a new Codex window on the target display without moving existing windows", async () => {
    const displays = makeDisplays();
    const moves = [];
    const focused = [];
    const mouseMoves = [];
    const mouseClicks = [];
    const feedbackPoints = [];
    let opens = 0;
    let calls = 0;
    const dockQuery = {
        getApplicationWindows: () => {
            calls += 1;
            if (calls === 1) {
                return [
                    { pid: 20, windowIndex: 3, x: 20, y: 80, w: 900, h: 700, focused: true, main: true }
                ];
            }
            return [
                { pid: 20, windowIndex: 3, x: 20, y: 80, w: 900, h: 700, focused: true, main: true },
                { pid: 21, windowIndex: 0, x: 30, y: 90, w: 900, h: 700, focused: false, main: false }
            ];
        },
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
        },
        clickMouse: payload => {
            mouseClicks.push(payload);
            return true;
        }
    };

    const result = await selectCodexDisplay({ target: "external" }, {
        dockQuery,
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true,
        openApplication: async appName => {
            assert.equal(appName, "Codex");
            opens += 1;
        },
        showMouseFeedback: point => feedbackPoints.push(point)
    });

    assert.equal(result.ok, true);
    assert.equal(result.createdNewWindow, true);
    assert.equal(result.reusedExistingTargetWindow, false);
    assert.equal(result.moved, true);
    assert.equal(result.focused, true);
    assert.equal(opens, 1);
    assert.deepEqual(moves, [{
        pid: 21,
        windowIndex: 0,
        x: -524,
        y: -1410,
        w: 2560,
        h: 1410
    }]);
    assert.deepEqual(focused, [{ pid: 21, windowIndex: 0 }]);
    assert.deepEqual(mouseMoves[0], { x: 756, y: -705 });
    assert.deepEqual(mouseClicks[0], { x: 756, y: -705 });
    assert.deepEqual(result.feedbackPoint, { x: 756, y: -705 });
    assert.deepEqual(feedbackPoints[0], { x: 756, y: -705 });
});

test("selectCodexDisplay opens Codex when no windows exist", async () => {
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

    const result = await selectCodexDisplay({ target: "internal", timeoutMs: 400 }, {
        dockQuery,
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true,
        openApplication: async appName => {
            assert.equal(appName, "Codex");
            opens += 1;
        }
    });

    assert.equal(result.ok, true);
    assert.equal(opens, 1);
    assert.equal(calls, 2);
    assert.deepEqual(result.selectedWindow, { pid: 30, windowIndex: 0 });
    assert.equal(result.focused, true);
    assert.equal(result.createdNewWindow, true);
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
