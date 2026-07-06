const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DOCK_SWITCH_RULE_DESCRIPTION,
    CHATGPT_DIRECT_COMMAND,
    SMARTSHADOW_DIRECT_COMMAND,
    applyDockSwitchKarabinerProfile
} = require("../src/karabiner-config");

function directLegacyRule() {
    return {
        description: "F3 opens SmartShadow on the left display; F6 opens ChatGPT on the right display; left Shift opens Codex on the external display; right Shift opens Claude on the right display",
        manipulators: [
            {
                type: "basic",
                from: { key_code: "f3", modifiers: { optional: ["any"] } },
                to: [{ shell_command: "/Users/longbiao/bin/open-hotkey-app.sh smartshadow >/dev/null 2>&1" }]
            },
            {
                type: "basic",
                from: { consumer_key_code: "mission_control", modifiers: { optional: ["any"] } },
                to: [{ shell_command: "/Users/longbiao/bin/open-hotkey-app.sh smartshadow >/dev/null 2>&1" }]
            },
            {
                type: "basic",
                from: { apple_vendor_keyboard_key_code: "mission_control", modifiers: { optional: ["any"] } },
                to: [{ shell_command: "/Users/longbiao/bin/open-hotkey-app.sh smartshadow >/dev/null 2>&1" }]
            },
            {
                type: "basic",
                from: { key_code: "f6", modifiers: { optional: ["any"] } },
                to: [{ shell_command: "/Users/longbiao/bin/open-hotkey-app.sh chatgpt >/dev/null 2>&1" }]
            },
            {
                type: "basic",
                from: { key_code: "left_shift", modifiers: { optional: ["any"] } },
                to: [{ key_code: "left_shift" }],
                to_if_alone: [{ shell_command: "/Users/longbiao/bin/open-hotkey-app.sh codex >/dev/null 2>&1" }]
            },
            {
                type: "basic",
                from: { key_code: "right_shift", modifiers: { optional: ["any"] } },
                to: [{ key_code: "right_shift" }],
                to_if_alone: [{ shell_command: "/Users/longbiao/bin/open-hotkey-app.sh claude >/dev/null 2>&1" }]
            }
        ]
    };
}

test("applyDockSwitchKarabinerProfile keeps F3 and F6 direct while removing Shift launcher mappings", () => {
    const profile = {
        simple_modifications: [
            { from: { key_code: "left_shift" }, to: [{ key_code: "left_shift" }] },
            { from: { key_code: "caps_lock" }, to: [{ key_code: "f20" }] }
        ],
        fn_function_keys: [
            { from: { key_code: "f5" }, to: [{ key_code: "f5" }] },
            { from: { key_code: "f6" }, to: [{ key_code: "f6" }] }
        ],
        complex_modifications: {
            rules: [
                directLegacyRule(),
                {
                    description: "Longbiao's Tweaks",
                    manipulators: [
                        {
                            type: "basic",
                            from: { key_code: "d", modifiers: { mandatory: ["right_shift"] } },
                            to: [{ shell_command: "date" }]
                        },
                        {
                            type: "basic",
                            from: { key_code: "f6", modifiers: { optional: ["any"] } },
                            to: [{ key_code: "vk_none" }]
                        }
                    ]
                }
            ]
        }
    };

    const result = applyDockSwitchKarabinerProfile(profile);

    assert.equal(result.changed, true);
    assert.equal(
        JSON.stringify(profile).includes("open-hotkey-app.sh"),
        false
    );
    assert.equal(
        profile.complex_modifications.rules.some(rule =>
            rule.manipulators.some(manipulator => manipulator.from && manipulator.from.key_code === "f6" && manipulator.to?.[0]?.key_code === "vk_none")
        ),
        false
    );
    assert.deepEqual(
        profile.complex_modifications.rules.find(rule => rule.description === "Longbiao's Tweaks").manipulators.map(manipulator => manipulator.from.key_code),
        ["d"]
    );
    assert.deepEqual(profile.simple_modifications, [
        { from: { key_code: "caps_lock" }, to: [{ key_code: "f20" }] }
    ]);
    assert.deepEqual(profile.fn_function_keys, [
        { from: { key_code: "f5" }, to: [{ key_code: "f5" }] }
    ]);

    const dockSwitchRule = profile.complex_modifications.rules[0];
    assert.equal(dockSwitchRule.description, DOCK_SWITCH_RULE_DESCRIPTION);
    assert.equal(dockSwitchRule.manipulators.length, 4);

    const f3 = dockSwitchRule.manipulators.find(manipulator => manipulator.from.key_code === "f3");
    assert.deepEqual(f3.to, [{ shell_command: SMARTSHADOW_DIRECT_COMMAND }]);

    const missionControl = dockSwitchRule.manipulators.filter(manipulator =>
        manipulator.from.consumer_key_code === "mission_control" ||
        manipulator.from.apple_vendor_keyboard_key_code === "mission_control"
    );
    assert.equal(missionControl.length, 2);
    assert.deepEqual(missionControl.map(manipulator => manipulator.to), [
        [{ shell_command: SMARTSHADOW_DIRECT_COMMAND }],
        [{ shell_command: SMARTSHADOW_DIRECT_COMMAND }]
    ]);

    const f6 = dockSwitchRule.manipulators.find(manipulator => manipulator.from.key_code === "f6");
    assert.deepEqual(f6.to, [{ shell_command: CHATGPT_DIRECT_COMMAND }]);

    const leftShift = dockSwitchRule.manipulators.find(manipulator => manipulator.from.key_code === "left_shift");
    assert.equal(leftShift, undefined);

    const rightShift = dockSwitchRule.manipulators.find(manipulator => manipulator.from.key_code === "right_shift");
    assert.equal(rightShift, undefined);
});
