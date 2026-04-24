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
        icon: "⇧"
    })
});

function isExcludedLauncherApp(name) {
    var normalized = normalizeAppName(name);
    return normalized === "chatgpt" || normalized === "codex";
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
            item = (configDockItems || []).find(entry => normalizeAppName(entry.name) === dockName);
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
