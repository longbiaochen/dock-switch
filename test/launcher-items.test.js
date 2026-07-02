const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildLauncherItems,
    isExcludedLauncherApp,
    specialLauncherItemForName
} = require("../src/launcher-items");

test("isExcludedLauncherApp marks fixed-key apps as excluded from ordinary fallback keys", () => {
    assert.equal(isExcludedLauncherApp("ChatGPT"), true);
    assert.equal(isExcludedLauncherApp("ChatGPT.app"), true);
    assert.equal(isExcludedLauncherApp("Codex"), true);
    assert.equal(isExcludedLauncherApp("Codex.app"), true);
    assert.equal(isExcludedLauncherApp("SmartShadow"), true);
    assert.equal(isExcludedLauncherApp("SmartShadow.app"), true);
    assert.equal(isExcludedLauncherApp("Claude"), true);
    assert.equal(isExcludedLauncherApp("Claude.app"), true);
});

test("specialLauncherItemForName labels fixed Dock apps with synced key names", () => {
    assert.deepEqual(specialLauncherItemForName("ChatGPT"), {
        name: "ChatGPT",
        key: "TAB",
        icon: "⇥"
    });
    assert.deepEqual(specialLauncherItemForName("Codex.app"), {
        name: "Codex",
        key: "SHIFT",
        icon: "⇧",
        screen: "side_right",
        placement: "side_right_fill"
    });
    assert.deepEqual(specialLauncherItemForName("SmartShadow.app"), {
        name: "SmartShadow",
        key: "F3",
        icon: "F3",
        screen: "side_left",
        placement: "side_left_fill",
        open_path: "/Applications/SmartShadow.app"
    });
    assert.deepEqual(specialLauncherItemForName("Claude.app"), {
        name: "Claude",
        key: "F6",
        icon: "F6",
        screen: "side_right",
        placement: "side_right_fill",
        open_path: "/Applications/Claude.app"
    });
    assert.equal(specialLauncherItemForName("Finder"), null);
});

test("buildLauncherItems renders special app labels and preserves fallback numeric keys for other apps", () => {
    const dockItems = [
        { name: "Finder", pos: { x: 10, y: 0 } },
        { name: "ChatGPT", pos: { x: 20, y: 0 } },
        { name: "Codex", pos: { x: 30, y: 0 } },
        { name: "System Settings", pos: { x: 40, y: 0 } },
        { name: "SmartShadow", pos: { x: 50, y: 0 } },
        { name: "Claude", pos: { x: 60, y: 0 } },
        { name: "Terminal", pos: { x: 70, y: 0 } },
        { name: "Temporary App", pos: { x: 80, y: 0 } }
    ];
    const configDockItems = [
        { name: "Finder", key: "D" },
        { name: "System Settings", key: "COMMAND_LEFT" },
        { name: "Terminal", key: "\\" }
    ];

    const launcherItems = buildLauncherItems(dockItems, configDockItems);

    assert.deepEqual(
        launcherItems.map(entry => ({ name: entry.item.name, key: entry.item.key })),
        [
            { name: "Finder", key: "D" },
            { name: "ChatGPT", key: "TAB" },
            { name: "Codex", key: "SHIFT" },
            { name: "System Settings", key: "COMMAND_LEFT" },
            { name: "SmartShadow", key: "F3" },
            { name: "Claude", key: "F6" },
            { name: "Terminal", key: "\\" },
            { name: "Temporary App", key: 1 }
        ]
    );
    assert.deepEqual(
        launcherItems.map(entry => entry.item.icon || entry.item.key),
        ["D", "⇥", "⇧", "⌘", "F3", "F6", "\\", 1]
    );
});

test("buildLauncherItems ignores config entries without keys so fallback keys still work", () => {
    const dockItems = [
        { name: "X", pos: { x: 10, y: 0 } }
    ];
    const configDockItems = [
        { name: "X", screen: "1", kind: "web_app", app_url: "https://x.com/" }
    ];

    const launcherItems = buildLauncherItems(dockItems, configDockItems);

    assert.deepEqual(
        launcherItems.map(entry => ({ name: entry.item.name, key: entry.item.key })),
        [
            { name: "X", key: 1 }
        ]
    );
});
