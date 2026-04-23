var CODEX_DISPLAY_SHORTCUTS = Object.freeze({
    TAB: "external",
    SHIFT: "internal",
    COMMAND_LEFT: "side_left",
    COMMAND_RIGHT: "side_right"
});
var RESERVED_LAUNCHER_SHORTCUTS = Object.freeze({
    TAB: true,
    SHIFT: true,
    COMMAND_LEFT: true,
    COMMAND_RIGHT: true
});

function resolveCodexDisplayShortcut(normalizedKey) {
    return CODEX_DISPLAY_SHORTCUTS[String(normalizedKey || "")] || "";
}

function resolveWindowPlacementShortcut(normalizedKey) {
    return "";
}

function isReservedLauncherShortcut(normalizedKey) {
    return !!RESERVED_LAUNCHER_SHORTCUTS[String(normalizedKey || "")];
}

module.exports = {
    resolveCodexDisplayShortcut,
    isReservedLauncherShortcut,
    resolveWindowPlacementShortcut
};
