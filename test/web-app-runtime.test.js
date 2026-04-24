const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");

const {
    resolveOpenPath,
    findAppProcessPidByOpenPathFromPsOutput,
    findChromeAppProcessPidFromPsOutput
} = require("../src/web-app-runtime");

test("resolveOpenPath falls back from Chrome Apps to Chromium Apps shims", () => {
    const originalPath = path.join(os.homedir(), "Applications", "Chrome Apps.localized", "X.app");
    const migratedPath = path.join(os.homedir(), "Applications", "Chromium Apps.localized", "X.app");

    const resolvedPath = resolveOpenPath(
        originalPath,
        candidate => candidate === migratedPath
    );

    assert.equal(resolvedPath, migratedPath);
});

test("findAppProcessPidByOpenPathFromPsOutput matches app_mode_loader bundles", () => {
    const originalPath = path.join(os.homedir(), "Applications", "Chrome Apps.localized", "X.app");
    const migratedPath = path.join(os.homedir(), "Applications", "Chromium Apps.localized", "X.app");
    const psOutput = [
        `1200 ${path.join(migratedPath, "Contents", "MacOS", "app_mode_loader")}`,
        `1201 ${path.join(os.homedir(), "Applications", "Chromium Apps.localized", "GitHub.app", "Contents", "MacOS", "app_mode_loader")}`,
        `1202 ${path.join(migratedPath, "Contents", "MacOS", "app_mode_loader")} --launched-by-test`
    ].join("\n");

    const pid = findAppProcessPidByOpenPathFromPsOutput(
        psOutput,
        originalPath,
        candidate => candidate === migratedPath
    );

    assert.equal(pid, 1202);
});

test("findChromeAppProcessPidFromPsOutput matches Chrome for Testing browser app launches", () => {
    const psOutput = [
        "300 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --app=https://x.com/?utm_source=homescreen&utm_medium=shortcut",
        "299 /Users/longbiao/.chrome-use/browsers/chrome-for-testing/147.0.7727.57/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --app=https://x.com/?utm_source=homescreen&utm_medium=shortcut --profile-directory=Default",
        "301 /Users/longbiao/.chrome-use/browsers/chrome-for-testing/147.0.7727.57/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --app=https://x.com/?utm_source=homescreen&utm_medium=shortcut --profile-directory=Default"
    ].join("\n");

    const pid = findChromeAppProcessPidFromPsOutput(
        psOutput,
        "https://x.com/?utm_source=homescreen&utm_medium=shortcut"
    );

    assert.equal(pid, 301);
});
