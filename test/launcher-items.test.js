const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildLauncherItems,
    isExcludedLauncherApp,
    specialLauncherItemForName
} = require("../src/launcher-items");

test("isExcludedLauncherApp marks ChatGPT and Codex as excluded from ordinary fallback keys", () => {
    assert.equal(isExcludedLauncherApp("ChatGPT"), true);
    assert.equal(isExcludedLauncherApp("ChatGPT.app"), true);
    assert.equal(isExcludedLauncherApp("Codex"), true);
    assert.equal(isExcludedLauncherApp("Codex.app"), true);
});

test("specialLauncherItemForName labels ChatGPT and Codex with symbolic UTF-8 keys", () => {
    assert.deepEqual(specialLauncherItemForName("ChatGPT"), {
        name: "ChatGPT",
        key: "TAB",
        icon: "⇥"
    });
    assert.deepEqual(specialLauncherItemForName("Codex.app"), {
        name: "Codex",
        key: "SHIFT",
        icon: "⇧"
    });
    assert.equal(specialLauncherItemForName("Finder"), null);
});

test("buildLauncherItems renders special app labels and preserves fallback numeric keys for other apps", () => {
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
            { name: "ChatGPT", key: "TAB" },
            { name: "Codex", key: "SHIFT" },
            { name: "Temporary App", key: 1 }
        ]
    );
    assert.deepEqual(
        launcherItems.map(entry => entry.item.icon || entry.item.key),
        ["D", "⇥", "⇧", 1]
    );
});
