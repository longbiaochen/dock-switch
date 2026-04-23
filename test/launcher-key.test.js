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
    assert.equal(normalizeLauncherKey("b", "KeyB"), "B");
});

test("normalizeLauncherKey maps digit codes to stable numeric keys", () => {
    assert.equal(normalizeLauncherKey("", "Digit1"), "1");
    assert.equal(normalizeLauncherKey("", "Digit2"), "2");
    assert.equal(normalizeLauncherKey("", "Digit3"), "3");
});

test("resolveAppShortcut maps symbolic app keys", () => {
    assert.equal(resolveAppShortcut("TAB"), "ChatGPT");
    assert.equal(resolveAppShortcut("SHIFT"), "Codex");
    assert.equal(resolveAppShortcut("COMMAND_LEFT"), "System Settings");
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
});

test("reserved symbolic launcher keys cannot fall through to app fallback", () => {
    assert.equal(isReservedLauncherShortcut("TAB"), true);
    assert.equal(isReservedLauncherShortcut("SHIFT"), true);
    assert.equal(isReservedLauncherShortcut("COMMAND_LEFT"), true);
    assert.equal(isReservedLauncherShortcut("COMMAND_RIGHT"), true);
    assert.equal(isReservedLauncherShortcut("1"), false);
});
