const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildLauncherItems,
    isExcludedLauncherApp
} = require("../src/launcher-items");

test("isExcludedLauncherApp hides ChatGPT from the launcher HUD", () => {
    assert.equal(isExcludedLauncherApp("ChatGPT"), true);
    assert.equal(isExcludedLauncherApp("ChatGPT.app"), true);
    assert.equal(isExcludedLauncherApp("Codex"), true);
    assert.equal(isExcludedLauncherApp("Codex.app"), true);
});

test("buildLauncherItems excludes special apps and preserves fallback numeric keys for other apps", () => {
    const dockItems = [
        { name: "Finder", pos: { x: 10, y: 0 } },
        { name: "ChatGPT", pos: { x: 20, y: 0 } },
        { name: "Codex", pos: { x: 30, y: 0 } },
        { name: "Temporary App", pos: { x: 40, y: 0 } }
    ];
    const configDockItems = [
        { name: "Finder", key: "D" }
    ];

    const launcherItems = buildLauncherItems(dockItems, configDockItems);

    assert.deepEqual(
        launcherItems.map(entry => ({ name: entry.item.name, key: entry.item.key })),
        [
            { name: "Finder", key: "D" },
            { name: "Temporary App", key: 1 }
        ]
    );
});
