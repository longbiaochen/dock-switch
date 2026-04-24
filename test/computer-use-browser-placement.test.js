const test = require("node:test");
const assert = require("node:assert/strict");

const {
    chooseWindow,
    placeComputerUseBrowser,
    rightHalfBoundsForDisplay
} = require("../src/computer-use-browser-placement");

function makeDisplay({ id, label, internal, x, y, width, height, workArea }) {
    return {
        id,
        label,
        internal,
        bounds: { x, y, width, height },
        workArea: workArea || { x, y, width, height }
    };
}

function makeScreen(displays) {
    return {
        getAllDisplays: () => displays,
        getPrimaryDisplay: () => displays[0]
    };
}

test("rightHalfBoundsForDisplay uses the display work area", () => {
    const display = makeDisplay({
        id: 3,
        label: "DELL U3219Q",
        internal: false,
        x: -406,
        y: -1296,
        width: 2304,
        height: 1296,
        workArea: { x: -406, y: -1266, width: 2304, height: 1266 }
    });

    assert.deepEqual(rightHalfBoundsForDisplay(display), {
        x: 746,
        y: -1266,
        w: 1152,
        h: 1266
    });
});

test("chooseWindow prefers the focused usable window, then main and area", () => {
    const chosen = chooseWindow([
        { pid: 1, windowIndex: 0, x: 0, y: 0, w: 1000, h: 800, main: true },
        { pid: 2, windowIndex: 0, x: 10, y: 10, w: 500, h: 400, focused: true },
        { pid: 3, windowIndex: 0, x: 10, y: 10, w: 2000, h: 1200 }
    ]);

    assert.equal(chosen.pid, 2);
});

test("placeComputerUseBrowser pins Chrome for Testing to the right half of the Codex display", async () => {
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
            id: 3,
            label: "DELL U3219Q",
            internal: false,
            x: -406,
            y: -1296,
            width: 2304,
            height: 1296,
            workArea: { x: -406, y: -1266, width: 2304, height: 1266 }
        })
    ];
    const moves = [];
    const dockQuery = {
        getApplicationWindows: ({ name }) => {
            if (name === "Codex") {
                return [
                    { pid: 10, windowIndex: 0, x: 20, y: 60, w: 1000, h: 700, focused: false },
                    { pid: 11, windowIndex: 1, x: -300, y: -1200, w: 1200, h: 900, focused: true }
                ];
            }
            if (name === "Google Chrome for Testing") {
                return [
                    { pid: 20, windowIndex: 2, x: 10, y: 80, w: 900, h: 700, focused: true }
                ];
            }
            return [];
        },
        moveApplicationWindowByPidAndIndex: payload => {
            moves.push(payload);
            return true;
        }
    };

    const result = await placeComputerUseBrowser({}, {
        dockQuery,
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true
    });

    assert.equal(result.ok, true);
    assert.equal(result.display.label, "DELL U3219Q");
    assert.deepEqual(result.bounds, { x: 746, y: -1266, w: 1152, h: 1266 });
    assert.deepEqual(moves[0], {
        pid: 20,
        windowIndex: 2,
        x: 746,
        y: -1266,
        w: 1152,
        h: 1266
    });
});

test("placeComputerUseBrowser reports when the external browser is not open yet", async () => {
    const displays = [
        makeDisplay({
            id: 1,
            label: "Built-in Retina Display",
            internal: true,
            x: 0,
            y: 0,
            width: 1512,
            height: 982
        })
    ];
    const result = await placeComputerUseBrowser({}, {
        dockQuery: {
            getApplicationWindows: ({ name }) => (
                name === "Codex"
                    ? [{ pid: 10, windowIndex: 0, x: 20, y: 60, w: 1000, h: 700, focused: true }]
                    : []
            )
        },
        electronScreen: makeScreen(displays),
        ensurePermissions: () => true
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /Google Chrome for Testing/);
});
