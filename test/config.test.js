const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config.json");

test("default config maps Xiaohongshu web app to R", () => {
    const item = config.dock_items.find(entry => entry.name === "小红书");

    assert.deepEqual(item, {
        name: "小红书",
        key: "R",
        screen: "3",
        kind: "web_app",
        placement: "internal_fill",
        open_path: "~/Applications/Chromium Apps.localized/小红书.app",
        app_url: "https://www.xiaohongshu.com/explore?m_source=pwa"
    });
});

test("default config does not assign duplicate launcher keys", () => {
    const byKey = new Map();

    for (const item of config.dock_items) {
        const key = String(item.key || "");
        if (!key) continue;

        assert.equal(
            byKey.has(key),
            false,
            `key ${key} is assigned to both ${byKey.get(key)} and ${item.name}`
        );
        byKey.set(key, item.name);
    }
});
