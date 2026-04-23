const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeLauncherKey } = require("../src/launcher-key");
const {
    isReservedLauncherShortcut,
    resolveCodexDisplayShortcut,
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

test("resolveCodexDisplayShortcut maps symbolic Codex display keys", () => {
    assert.equal(resolveCodexDisplayShortcut("TAB"), "external");
    assert.equal(resolveCodexDisplayShortcut("SHIFT"), "internal");
    assert.equal(resolveCodexDisplayShortcut("COMMAND_LEFT"), "side_left");
    assert.equal(resolveCodexDisplayShortcut("COMMAND_RIGHT"), "side_right");
    assert.equal(resolveCodexDisplayShortcut("SPACE"), "");
});

test("resolveCodexDisplayShortcut does not consume numeric launcher fallback keys", () => {
    assert.equal(resolveCodexDisplayShortcut("1"), "");
    assert.equal(resolveCodexDisplayShortcut("2"), "");
    assert.equal(resolveCodexDisplayShortcut("3"), "");
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
