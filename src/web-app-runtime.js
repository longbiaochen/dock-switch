const child_process = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const KNOWN_WEB_APP_DIRS = [
    path.join(os.homedir(), "Applications", "Chrome Apps.localized"),
    path.join(os.homedir(), "Applications", "Chromium Apps.localized"),
    "/Applications/Chrome Apps.localized",
    "/Applications/Chromium Apps.localized"
];

function expandUserPath(inputPath) {
    if (!inputPath) return "";
    if (inputPath === "~") return os.homedir();
    if (inputPath.startsWith("~/")) {
        return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
}

function uniqueStrings(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
}

function buildOpenPathCandidates(openPath) {
    const expandedPath = expandUserPath(openPath);
    if (!expandedPath) {
        return [];
    }

    const candidates = [expandedPath];
    if (expandedPath.includes("/Chrome Apps.localized/")) {
        candidates.push(expandedPath.replace("/Chrome Apps.localized/", "/Chromium Apps.localized/"));
    }
    if (expandedPath.includes("/Chromium Apps.localized/")) {
        candidates.push(expandedPath.replace("/Chromium Apps.localized/", "/Chrome Apps.localized/"));
    }

    const bundleName = path.basename(expandedPath);
    if (bundleName && bundleName !== "." && bundleName !== path.sep) {
        KNOWN_WEB_APP_DIRS.forEach(dir => {
            candidates.push(path.join(dir, bundleName));
        });
    }

    return uniqueStrings(candidates);
}

function resolveOpenPath(openPath, existsSync = fs.existsSync) {
    const candidates = buildOpenPathCandidates(openPath);
    if (candidates.length === 0) {
        return "";
    }

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return candidates[0];
}

function parseProcessTable(psOutput) {
    return String(psOutput || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const match = line.match(/^(\d+)\s+(.*)$/);
            if (!match) return null;
            return {
                pid: Number(match[1]),
                command: match[2]
            };
        })
        .filter(Boolean);
}

function findAppProcessPidByOpenPathFromPsOutput(psOutput, openPath, existsSync = fs.existsSync) {
    const bundlePath = resolveOpenPath(openPath, existsSync);
    if (!bundlePath) {
        return null;
    }

    const executablePrefix = `${path.join(bundlePath, "Contents", "MacOS")}${path.sep}`;
    const candidates = parseProcessTable(psOutput)
        .filter(entry => entry.command.startsWith(executablePrefix))
        .sort((a, b) => b.pid - a.pid);

    return candidates.length > 0 ? candidates[0].pid : null;
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isChromeBrowserCommand(command) {
    return /\/(?:Google Chrome(?: for Testing)?|Chromium)\.app\/Contents\/MacOS\/(?:Google Chrome(?: for Testing)?|Chromium)(?:\s|$)/.test(
        String(command || "")
    );
}

function findChromeAppProcessPidFromPsOutput(psOutput, appUrl) {
    const targetUrl = String(appUrl || "").trim();
    if (!targetUrl) {
        return null;
    }

    const urlPattern = new RegExp(`--app=${escapeRegex(targetUrl)}(?:\\s|$)`);
    const candidates = parseProcessTable(psOutput)
        .filter(entry => isChromeBrowserCommand(entry.command))
        .filter(entry => !/--type=/.test(entry.command))
        .filter(entry => !/crashpad_handler/.test(entry.command))
        .filter(entry => urlPattern.test(entry.command))
        .sort((a, b) => b.pid - a.pid);

    return candidates.length > 0 ? candidates[0].pid : null;
}

function readProcessTable(spawnSync = child_process.spawnSync) {
    const result = spawnSync(
        "ps",
        ["ax", "-o", "pid=,command="],
        { encoding: "utf8" }
    );
    if (!result || result.status !== 0) {
        return "";
    }
    return String(result.stdout || "");
}

function findAppProcessPidByOpenPath(openPath, options = {}) {
    const psOutput = readProcessTable(options.spawnSync);
    return findAppProcessPidByOpenPathFromPsOutput(
        psOutput,
        openPath,
        options.existsSync || fs.existsSync
    );
}

function findChromeAppProcessPid(appUrl, options = {}) {
    const psOutput = readProcessTable(options.spawnSync);
    return findChromeAppProcessPidFromPsOutput(psOutput, appUrl);
}

module.exports = {
    expandUserPath,
    resolveOpenPath,
    findAppProcessPidByOpenPath,
    findAppProcessPidByOpenPathFromPsOutput,
    findChromeAppProcessPid,
    findChromeAppProcessPidFromPsOutput,
    isChromeBrowserCommand
};
