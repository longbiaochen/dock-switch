var APP_SHORTCUTS = Object.freeze({
    LEFT_SHIFT: "Codex",
    RIGHT_SHIFT: "Claude",
    F3: "SmartShadow",
    F6: "ChatGPT",
    COMMAND_LEFT: "System Settings"
});
var RESERVED_LAUNCHER_SHORTCUTS = Object.freeze({
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
