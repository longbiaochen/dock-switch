const { launcherKeyIcon } = require("./launcher-key");

function normalizeAppName(name) {
    var normalized = String(name || "")
        .trim()
        .replace(/\.app$/i, "")
        .toLowerCase();

    if (normalized === "chrome") {
        return "google chrome";
    }

    return normalized;
}

var SPECIAL_LAUNCHER_ITEMS = Object.freeze({
    chatgpt: Object.freeze({
        name: "ChatGPT",
        key: "TAB",
        icon: "⇥"
    }),
    codex: Object.freeze({
        name: "Codex",
        key: "SHIFT",
        icon: "⇧",
        screen: "side_right",
        placement: "side_right_fill"
    }),
    smartshadow: Object.freeze({
        name: "SmartShadow",
        key: "F3",
        icon: "F3",
        screen: "side_left",
        placement: "side_left_fill",
        open_path: "/Applications/SmartShadow.app"
    }),
    claude: Object.freeze({
        name: "Claude",
        key: "F6",
        icon: "F6",
        screen: "side_right",
        placement: "side_right_fill",
        open_path: "/Applications/Claude.app"
    })
});

function isExcludedLauncherApp(name) {
    return !!SPECIAL_LAUNCHER_ITEMS[normalizeAppName(name)];
}

function specialLauncherItemForName(name) {
    var item = SPECIAL_LAUNCHER_ITEMS[normalizeAppName(name)];
    if (!item) return null;
    return Object.assign({}, item);
}

function buildLauncherItems(dockItems, configDockItems) {
    var visibleItems = (dockItems || [])
        .filter(item =>
            item &&
            item.name &&
            item.name !== "Trash" &&
            item.name !== "Downloads" &&
            item.pos &&
            Number.isFinite(item.pos.x)
        )
        .sort((a, b) => a.pos.x - b.pos.x);

    var launcherItems = [];
    var fallbackKey = 1;
    for (var i = 0; i < visibleItems.length; i++) {
        var dockName = normalizeAppName(visibleItems[i].name);
        var item = specialLauncherItemForName(visibleItems[i].name);
        if (item == undefined) {
            var configItem = (configDockItems || []).find(entry =>
                normalizeAppName(entry.name) === dockName &&
                String(entry.key || "").trim()
            );
            if (configItem) {
                item = Object.assign({}, configItem, {
                    icon: launcherKeyIcon(configItem.key) || configItem.icon
                });
            }
        }
        if (item == undefined) {
            item = {
                name: visibleItems[i].name,
                key: fallbackKey++,
                screen: ""
            };
        }
        launcherItems.push({
            item,
            dockItem: visibleItems[i]
        });
    }

    return launcherItems;
}

module.exports = {
    buildLauncherItems,
    isExcludedLauncherApp,
    normalizeAppName,
    specialLauncherItemForName
};
