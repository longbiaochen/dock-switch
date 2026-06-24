function normalizeLauncherKey(key, code) {
    var raw = String(key || "").trim();
    var lower = raw.toLowerCase().replace(/[\s-]+/g, "_");
    if (code === "Space" || key === " ") return "SPACE";
    if (code === "Digit1") return "1";
    if (code === "Digit2") return "2";
    if (code === "Digit3") return "3";
    if (key === "Tab" || code === "Tab") return "TAB";
    if (code === "MetaLeft") return "COMMAND_LEFT";
    if (code === "MetaRight") return "COMMAND_RIGHT";
    if (raw === "⌘") return "COMMAND_LEFT";
    if (["cmd", "command", "cmd_left", "left_cmd", "command_left", "left_command", "meta_left", "left_meta"].includes(lower)) {
        return "COMMAND_LEFT";
    }
    if (["cmd_right", "right_cmd", "command_right", "right_command", "meta_right", "right_meta"].includes(lower)) {
        return "COMMAND_RIGHT";
    }
    if (key === "Meta") return "COMMAND";
    if (key === "Shift" || code === "ShiftLeft" || code === "ShiftRight") return "SHIFT";
    return raw.toUpperCase();
}

function launcherKeyIcon(key) {
    var normalizedKey = normalizeLauncherKey(key, "");
    if (normalizedKey === "TAB") return "⇥";
    if (normalizedKey === "SHIFT") return "⇧";
    if (normalizedKey === "COMMAND" || normalizedKey === "COMMAND_LEFT" || normalizedKey === "COMMAND_RIGHT") {
        return "⌘";
    }
    return "";
}

function displayLauncherKey(key) {
    var normalizedKey = normalizeLauncherKey(key, "");
    return launcherKeyIcon(normalizedKey) || normalizedKey;
}

module.exports = {
    displayLauncherKey,
    launcherKeyIcon,
    normalizeLauncherKey
};
