const fs = require("fs");
const os = require("os");
const path = require("path");

const DOCK_SWITCH_RULE_DESCRIPTION = "dock-switch launcher shortcuts with direct F3/F6 apps";
const MANAGED_FN_FUNCTION_KEYS = ["f3", "f6"];

function shellCommand(parts) {
    return parts.map(part => `'${part.replace(/'/g, "'\\''")}'`).join(" ");
}

function directAppCommand(appName, placement) {
    return shellCommand([
        "/bin/zsh",
        "-lc",
        [
            `APP_NAME=${appName}`,
            "NODE=/opt/homebrew/bin/node",
            "CLI=/Applications/dock-switch.app/Contents/Resources/app/bin/dock-switch-cli.js",
            "/usr/bin/open -a \"$APP_NAME\" >/dev/null 2>&1",
            `[[ -x "$NODE" && -f "$CLI" ]] && "$NODE" "$CLI" place --app "$APP_NAME" --placement ${placement} >/dev/null 2>&1 &`
        ].join("; ")
    ]);
}

const SMARTSHADOW_DIRECT_COMMAND = shellCommand([
    "/bin/zsh",
    "-lc",
    [
        "APP=/Applications/SmartShadow.app",
        "NODE=/opt/homebrew/bin/node",
        "CLI=/Applications/dock-switch.app/Contents/Resources/app/bin/dock-switch-cli.js",
        "/usr/bin/open \"$APP\" >/dev/null 2>&1",
        "[[ -x \"$NODE\" && -f \"$CLI\" ]] && \"$NODE\" \"$CLI\" place --app SmartShadow --placement side_left_fill >/dev/null 2>&1 &"
    ].join("; ")
]);
const CHATGPT_DIRECT_COMMAND = directAppCommand("ChatGPT", "side_right_fill");

function fromKeyCode(keyCode) {
    return {
        key_code: keyCode,
        modifiers: { optional: ["any"] }
    };
}

function buildDockSwitchKarabinerRule() {
    return {
        description: DOCK_SWITCH_RULE_DESCRIPTION,
        manipulators: [
            {
                type: "basic",
                from: fromKeyCode("f3"),
                to: [{ shell_command: SMARTSHADOW_DIRECT_COMMAND }]
            },
            {
                type: "basic",
                from: {
                    consumer_key_code: "mission_control",
                    modifiers: { optional: ["any"] }
                },
                to: [{ shell_command: SMARTSHADOW_DIRECT_COMMAND }]
            },
            {
                type: "basic",
                from: {
                    apple_vendor_keyboard_key_code: "mission_control",
                    modifiers: { optional: ["any"] }
                },
                to: [{ shell_command: SMARTSHADOW_DIRECT_COMMAND }]
            },
            {
                type: "basic",
                from: fromKeyCode("f6"),
                to: [{ shell_command: CHATGPT_DIRECT_COMMAND }]
            },
            {
                type: "basic",
                from: {
                    generic_desktop: "do_not_disturb",
                    modifiers: { optional: ["any"] }
                },
                to: [{ shell_command: CHATGPT_DIRECT_COMMAND }]
            }
        ]
    };
}

function manipulatorMatchesManagedDirectKey(manipulator) {
    const from = manipulator && manipulator.from;
    if (!from || typeof from !== "object") return false;
    if (["f3", "f6", "left_shift", "right_shift"].includes(from.key_code)) return true;
    if (from.consumer_key_code === "mission_control") return true;
    if (from.apple_vendor_keyboard_key_code === "mission_control") return true;
    if (from.generic_desktop === "do_not_disturb") return true;
    return false;
}

function normalizeRules(profile) {
    if (!profile.complex_modifications || typeof profile.complex_modifications !== "object") {
        profile.complex_modifications = {};
    }
    if (!Array.isArray(profile.complex_modifications.rules)) {
        profile.complex_modifications.rules = [];
    }
    return profile.complex_modifications.rules;
}

function stableJsonValue(value) {
    if (Array.isArray(value)) {
        return value.map(stableJsonValue);
    }
    if (value && typeof value === "object") {
        return Object.keys(value).sort().reduce((stable, key) => {
            stable[key] = stableJsonValue(value[key]);
            return stable;
        }, {});
    }
    return value;
}

function stableJsonString(value) {
    return JSON.stringify(stableJsonValue(value));
}

function removeManagedSimpleEntries(profile) {
    if (Array.isArray(profile.simple_modifications)) {
        profile.simple_modifications = profile.simple_modifications.filter(entry =>
            !manipulatorMatchesManagedDirectKey(entry)
        );
    }
}

function managedFunctionKeyEntry(keyCode) {
    return {
        from: { key_code: keyCode },
        to: [{ key_code: keyCode }]
    };
}

function functionKeyRank(entry, index) {
    const keyCode = entry && entry.from && entry.from.key_code;
    const match = typeof keyCode === "string" ? keyCode.match(/^f(\d+)$/) : null;
    if (!match) return 1000 + index;
    return Number(match[1]);
}

function ensureManagedFunctionKeys(profile) {
    const existing = Array.isArray(profile.fn_function_keys)
        ? profile.fn_function_keys.filter(entry => !MANAGED_FN_FUNCTION_KEYS.includes(entry.from && entry.from.key_code))
        : [];
    profile.fn_function_keys = [
        ...existing,
        ...MANAGED_FN_FUNCTION_KEYS.map(managedFunctionKeyEntry)
    ]
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) => {
            const rankDiff = functionKeyRank(left.entry, left.index) - functionKeyRank(right.entry, right.index);
            return rankDiff || left.index - right.index;
        })
        .map(item => item.entry);
}

function applyDockSwitchKarabinerProfile(profile) {
    if (!profile || typeof profile !== "object") {
        throw new TypeError("profile must be an object");
    }

    const before = stableJsonString(profile);
    removeManagedSimpleEntries(profile);
    ensureManagedFunctionKeys(profile);
    const rules = normalizeRules(profile);
    const cleanedRules = [];

    for (const rule of rules) {
        if (!rule || typeof rule !== "object") continue;
        if (rule.description === DOCK_SWITCH_RULE_DESCRIPTION) continue;
        const manipulators = Array.isArray(rule.manipulators)
            ? rule.manipulators.filter(manipulator => !manipulatorMatchesManagedDirectKey(manipulator))
            : [];
        if (manipulators.length > 0) {
            cleanedRules.push(Object.assign({}, rule, { manipulators }));
        }
    }

    profile.complex_modifications.rules = [
        buildDockSwitchKarabinerRule(),
        ...cleanedRules
    ];

    return {
        changed: stableJsonString(profile) !== before,
        profile
    };
}

function selectedProfile(config) {
    const profiles = Array.isArray(config && config.profiles) ? config.profiles : [];
    return profiles.find(profile => profile && profile.selected) || profiles[0] || null;
}

function applyDockSwitchKarabinerConfig(config) {
    if (!config || typeof config !== "object") {
        throw new TypeError("config must be an object");
    }
    const profile = selectedProfile(config);
    if (!profile) {
        throw new Error("Karabiner config has no profile");
    }
    return applyDockSwitchKarabinerProfile(profile);
}

function defaultKarabinerConfigPath() {
    return path.join(os.homedir(), ".config", "karabiner", "karabiner.json");
}

function readKarabinerConfig(configPath = defaultKarabinerConfigPath()) {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function writeKarabinerConfig(config, configPath = defaultKarabinerConfigPath()) {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

module.exports = {
    DOCK_SWITCH_RULE_DESCRIPTION,
    CHATGPT_DIRECT_COMMAND,
    SMARTSHADOW_DIRECT_COMMAND,
    applyDockSwitchKarabinerConfig,
    applyDockSwitchKarabinerProfile,
    buildDockSwitchKarabinerRule,
    defaultKarabinerConfigPath,
    readKarabinerConfig,
    writeKarabinerConfig
};
