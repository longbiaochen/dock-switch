var APP_SHORTCUTS = Object.freeze({
    TAB: "ChatGPT",
    SHIFT: "Codex",
    F3: "SmartShadow",
    F6: "Claude",
    COMMAND_LEFT: "System Settings"
});
var RESERVED_LAUNCHER_SHORTCUTS = Object.freeze({
    TAB: true,
    SHIFT: true,
    F3: true,
    F6: true,
    COMMAND_LEFT: true,
    COMMAND_RIGHT: true
});

function resolveAppShortcut(normalizedKey) {
    return APP_SHORTCUTS[String(normalizedKey || "")] || "";
}

function resolveWindowPlacementShortcut(normalizedKey) {
    return "";
}

function isReservedLauncherShortcut(normalizedKey) {
    return !!RESERVED_LAUNCHER_SHORTCUTS[String(normalizedKey || "")];
}

module.exports = {
    resolveAppShortcut,
    isReservedLauncherShortcut,
    resolveWindowPlacementShortcut
};
