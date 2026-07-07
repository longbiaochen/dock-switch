const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeLauncherKey } = require("../src/launcher-key");
const {
    isReservedLauncherShortcut,
    resolveAppShortcut,
    resolveWindowPlacementShortcut
} = require("../src/launcher-shortcuts");

test("normalizeLauncherKey maps spacebar to SPACE", () => {
    assert.equal(normalizeLauncherKey(" ", "Space"), "SPACE");
});

test("normalizeLauncherKey keeps symbolic launcher keys stable", () => {
    assert.equal(normalizeLauncherKey("Tab", "Tab"), "TAB");
    assert.equal(normalizeLauncherKey("Meta", "MetaLeft"), "COMMAND_LEFT");
    assert.equal(normalizeLauncherKey("Meta", "MetaRight"), "COMMAND_RIGHT");
    assert.equal(normalizeLauncherKey("Shift", "ShiftLeft"), "LEFT_SHIFT");
    assert.equal(normalizeLauncherKey("Shift", "ShiftRight"), "RIGHT_SHIFT");
    assert.equal(normalizeLauncherKey("left_shift", ""), "LEFT_SHIFT");
    assert.equal(normalizeLauncherKey("right-shift", ""), "RIGHT_SHIFT");
    assert.equal(normalizeLauncherKey("cmd_left", ""), "COMMAND_LEFT");
    assert.equal(normalizeLauncherKey("left_cmd", ""), "COMMAND_LEFT");
    assert.equal(normalizeLauncherKey("cmd-right", ""), "COMMAND_RIGHT");
    assert.equal(normalizeLauncherKey("b", "KeyB"), "B");
});

test("normalizeLauncherKey maps digit codes to stable numeric keys", () => {
    assert.equal(normalizeLauncherKey("", "Digit1"), "1");
    assert.equal(normalizeLauncherKey("", "Digit2"), "2");
    assert.equal(normalizeLauncherKey("", "Digit3"), "3");
});

test("resolveAppShortcut provides default app fallback for launcher defaults", () => {
    assert.equal(resolveAppShortcut("LEFT_SHIFT"), "Codex");
    assert.equal(resolveAppShortcut("RIGHT_SHIFT"), "Claude");
    assert.equal(resolveAppShortcut("F3"), "SmartShadow");
    assert.equal(resolveAppShortcut("F6"), "ChatGPT");
    assert.equal(resolveAppShortcut("COMMAND_LEFT"), "System Settings");
    assert.equal(resolveAppShortcut("TAB"), "");
    assert.equal(resolveAppShortcut("COMMAND_RIGHT"), "");
    assert.equal(resolveAppShortcut("SPACE"), "");
});

test("resolveAppShortcut does not consume numeric launcher fallback keys", () => {
    assert.equal(resolveAppShortcut("1"), "");
    assert.equal(resolveAppShortcut("2"), "");
    assert.equal(resolveAppShortcut("3"), "");
});

test("resolveWindowPlacementShortcut no longer consumes SPACE", () => {
    assert.equal(resolveWindowPlacementShortcut("SPACE"), "");
    assert.equal(resolveWindowPlacementShortcut("1"), "");
    assert.equal(resolveWindowPlacementShortcut("\\"), "");
});

test("only command shortcuts stay reserved from configurable app fallback", () => {
    assert.equal(isReservedLauncherShortcut("LEFT_SHIFT"), false);
    assert.equal(isReservedLauncherShortcut("RIGHT_SHIFT"), false);
    assert.equal(isReservedLauncherShortcut("F3"), false);
    assert.equal(isReservedLauncherShortcut("F6"), false);
    assert.equal(isReservedLauncherShortcut("COMMAND_LEFT"), true);
    assert.equal(isReservedLauncherShortcut("COMMAND_RIGHT"), true);
    assert.equal(isReservedLauncherShortcut("TAB"), false);
    assert.equal(isReservedLauncherShortcut("1"), false);
});
