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

function isExcludedLauncherApp(name) {
    var normalized = normalizeAppName(name);
    return normalized === "chatgpt" || normalized === "codex";
}

function buildLauncherItems(dockItems, configDockItems) {
    var visibleItems = (dockItems || [])
        .filter(item =>
            item &&
            item.name &&
            item.name !== "Trash" &&
            item.name !== "Downloads" &&
            item.pos &&
            Number.isFinite(item.pos.x) &&
            !isExcludedLauncherApp(item.name)
        )
        .sort((a, b) => a.pos.x - b.pos.x);

    var launcherItems = [];
    var fallbackKey = 1;
    for (var i = 0; i < visibleItems.length; i++) {
        var dockName = normalizeAppName(visibleItems[i].name);
        var item = (configDockItems || []).find(entry => normalizeAppName(entry.name) === dockName);
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
    normalizeAppName
};
