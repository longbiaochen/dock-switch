function normalizeLauncherKey(key, code) {
    if (code === "Space" || key === " ") return "SPACE";
    if (code === "Digit1") return "1";
    if (code === "Digit2") return "2";
    if (code === "Digit3") return "3";
    if (key === "Tab" || code === "Tab") return "TAB";
    if (code === "MetaLeft") return "COMMAND_LEFT";
    if (code === "MetaRight") return "COMMAND_RIGHT";
    if (key === "Meta") return "COMMAND";
    if (key === "Shift" || code === "ShiftLeft" || code === "ShiftRight") return "SHIFT";
    return String(key || "").toUpperCase();
}

module.exports = {
    normalizeLauncherKey
};
