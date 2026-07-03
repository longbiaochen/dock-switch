const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildSettingsRows,
    normalizeEditableKey,
    saveDockItemSettings,
    validateKeyUpdates
} = require("../src/settings-config");

test("buildSettingsRows merges visible Dock apps with configured, reserved, and fallback keys", () => {
    const dockItems = [
        { name: "Finder", pos: { x: 10, y: 0 } },
        { name: "ChatGPT", pos: { x: 20, y: 0 } },
        { name: "Codex", pos: { x: 30, y: 0 } },
        { name: "SmartShadow", pos: { x: 40, y: 0 } },
        { name: "Claude", pos: { x: 50, y: 0 } },
        { name: "Temporary App", pos: { x: 60, y: 0 } }
    ];
    const config = {
        dock_items: [
            { name: "Finder", key: "D", screen: "0", placement: "internal_fill" }
        ]
    };

    const rows = buildSettingsRows(dockItems, config);

    assert.deepEqual(rows.map(row => ({
        name: row.name,
        key: row.key,
        screen: row.screen,
        placement: row.placement,
        status: row.status,
        readonly: row.readonly
    })), [
        { name: "Finder", key: "D", screen: "0", placement: "internal_fill", status: "configured", readonly: false },
        { name: "ChatGPT", key: "F6", screen: "", placement: "", status: "reserved", readonly: true },
        { name: "Codex", key: "LEFT_SHIFT", screen: "", placement: "", status: "reserved", readonly: true },
        { name: "SmartShadow", key: "F3", screen: "", placement: "", status: "reserved", readonly: true },
        { name: "Claude", key: "RIGHT_SHIFT", screen: "", placement: "", status: "reserved", readonly: true },
        { name: "Temporary App", key: "1", screen: "", placement: "", status: "fallback", readonly: false }
    ]);
});

test("normalizeEditableKey uses launcher key normalization for settings input", () => {
    assert.equal(normalizeEditableKey(" f3 "), "F3");
    assert.equal(normalizeEditableKey("space"), "SPACE");
    assert.equal(normalizeEditableKey("left_shift"), "LEFT_SHIFT");
    assert.equal(normalizeEditableKey("right-shift"), "RIGHT_SHIFT");
    assert.equal(normalizeEditableKey("⌘"), "COMMAND_LEFT");
    assert.equal(normalizeEditableKey("cmd_left"), "COMMAND_LEFT");
    assert.equal(normalizeEditableKey("left_cmd"), "COMMAND_LEFT");
    assert.equal(normalizeEditableKey(""), "");
});

test("buildSettingsRows renders command shortcuts with the command icon", () => {
    const rows = buildSettingsRows([
        { name: "System Settings", pos: { x: 10, y: 0 } }
    ], {
        dock_items: [
            { name: "System Settings", key: "COMMAND_LEFT", screen: "1", placement: "internal_fill" }
        ]
    });

    assert.equal(rows[0].key, "⌘");
    assert.equal(rows[0].displayKey, "⌘");
});

test("validateKeyUpdates allows left command for System Settings only", () => {
    const allowed = validateKeyUpdates([
        { name: "System Settings", key: "⌘" }
    ]);
    const rejected = validateKeyUpdates([
        { name: "Finder", key: "⌘" }
    ]);

    assert.equal(allowed.length, 0);
    assert.equal(rejected.some(error => error.type === "reserved" && error.key === "COMMAND_LEFT"), true);
});

test("validateKeyUpdates rejects duplicate and reserved settings keys", () => {
    const errors = validateKeyUpdates([
        { name: "Finder", key: "D" },
        { name: "Safari", key: "d" },
        { name: "Codex Override", key: "left_shift" },
        { name: "SmartShadow Override", key: "f3" },
        { name: "Claude Override", key: "right_shift" },
        { name: "ChatGPT Override", key: "f6" }
    ]);

    assert.equal(errors.some(error => error.type === "duplicate" && error.key === "D"), true);
    assert.equal(errors.some(error => error.type === "reserved" && error.key === "LEFT_SHIFT"), true);
    assert.equal(errors.some(error => error.type === "reserved" && error.key === "RIGHT_SHIFT"), true);
    assert.equal(errors.some(error => error.type === "reserved" && error.key === "F3"), true);
    assert.equal(errors.some(error => error.type === "reserved" && error.key === "F6"), true);
});

test("saveDockItemSettings writes command icon input as COMMAND_LEFT", () => {
    const result = saveDockItemSettings({
        dock_items: [
            { name: "System Settings", key: "COMMAND_LEFT", screen: "1", placement: "internal_fill" }
        ]
    }, [
        { name: "System Settings", pos: { x: 10, y: 0 } }
    ], [
        { name: "System Settings", key: "⌘", screen: "1", placement: "internal_fill" }
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.config.dock_items[0].key, "COMMAND_LEFT");
});

test("saveDockItemSettings updates only visible Dock app settings and preserves advanced fields", () => {
    const dockItems = [
        { name: "GitHub", pos: { x: 10, y: 0 } },
        { name: "Temporary App", pos: { x: 20, y: 0 } }
    ];
    const config = {
        dock_items: [
            {
                name: "GitHub",
                key: "H",
                screen: "1",
                kind: "web_app",
                open_path: "~/Applications/Chromium Apps.localized/GitHub.app",
                app_url: "https://github.com/repos?q=owner%3A%40me+sort%3Aupdated"
            },
            { name: "Hidden App", key: "Q", screen: "0" }
        ]
    };

    const result = saveDockItemSettings(config, dockItems, [
        { name: "GitHub", key: "J", screen: "0", placement: "external_right_half" },
        { name: "Temporary App", key: "" },
        { name: "Hidden App", key: "Z", screen: "1", placement: "internal_fill" }
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.config.dock_items.find(item => item.name === "GitHub"), {
        name: "GitHub",
        key: "J",
        screen: "0",
        kind: "web_app",
        placement: "external_right_half",
        open_path: "~/Applications/Chromium Apps.localized/GitHub.app",
        app_url: "https://github.com/repos?q=owner%3A%40me+sort%3Aupdated"
    });
    assert.equal(result.config.dock_items.some(item => item.name === "Temporary App"), false);
    assert.deepEqual(result.config.dock_items.find(item => item.name === "Hidden App"), {
        name: "Hidden App",
        key: "Q",
        screen: "0"
    });
});

test("saveDockItemSettings clears an existing key without deleting advanced app metadata", () => {
    const dockItems = [
        { name: "X", pos: { x: 10, y: 0 } }
    ];
    const config = {
        dock_items: [
            {
                name: "X",
                key: "X",
                screen: "1",
                kind: "web_app",
                placement: "internal_fill",
                open_path: "~/Applications/Chromium Apps.localized/X.app",
                app_url: "https://x.com/?utm_source=homescreen&utm_medium=shortcut"
            }
        ]
    };

    const result = saveDockItemSettings(config, dockItems, [
        { name: "X", key: "" }
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.config.dock_items[0], {
        name: "X",
        screen: "1",
        kind: "web_app",
        placement: "internal_fill",
        open_path: "~/Applications/Chromium Apps.localized/X.app",
        app_url: "https://x.com/?utm_source=homescreen&utm_medium=shortcut"
    });
    assert.deepEqual(buildSettingsRows(dockItems, result.config).map(row => row.status), ["fallback"]);
});

test("saveDockItemSettings creates a visible fallback app when screen or placement is configured", () => {
    const dockItems = [
        { name: "Preview", pos: { x: 10, y: 0 } }
    ];
    const config = {
        dock_items: []
    };

    const result = saveDockItemSettings(config, dockItems, [
        { name: "Preview", key: "", screen: "side_right", placement: "side_right_fill" }
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.config.dock_items, [
        { name: "Preview", screen: "side_right", placement: "side_right_fill" }
    ]);
});
