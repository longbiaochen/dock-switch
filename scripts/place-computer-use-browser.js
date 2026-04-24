#!/usr/bin/env node

const childProcess = require("child_process");
const net = require("net");
const os = require("os");
const path = require("path");

const CONTROL_SOCKET_PATH = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "dock-switch",
    "control.sock"
);

function usage() {
    console.error("Usage: place-computer-use-browser [--anchor-app <AppName>] [--browser-app <AppName>]");
    process.exit(2);
}

function parseArgs(argv) {
    let anchorApp = "Codex";
    let browserApp = "Google Chrome for Testing";

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--anchor-app") {
            anchorApp = argv[i + 1] || "";
            i += 1;
        } else if (arg === "--browser-app") {
            browserApp = argv[i + 1] || "";
            i += 1;
        } else {
            usage();
        }
    }

    if (!anchorApp || !browserApp) usage();
    return {
        command: "computer-use-browser",
        anchorApp,
        browserApp
    };
}

function connectAndSend(payload) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(CONTROL_SOCKET_PATH);
        let buffer = "";
        let settled = false;

        socket.setEncoding("utf8");
        socket.on("connect", () => {
            socket.write(JSON.stringify(payload) + "\n");
        });
        socket.on("data", chunk => {
            buffer += chunk;
            const newlineIndex = buffer.indexOf("\n");
            if (newlineIndex === -1) return;
            const raw = buffer.slice(0, newlineIndex).trim();
            if (!raw) return;
            settled = true;
            socket.end();
            resolve(JSON.parse(raw));
        });
        socket.on("error", err => {
            if (!settled) reject(err);
        });
        socket.on("end", () => {
            if (!settled) {
                reject(new Error("No response from dock-switch"));
            }
        });
    });
}

function launchDockSwitch() {
    childProcess.spawn("/usr/bin/open", ["/Applications/dock-switch.app"], {
        detached: true,
        stdio: "ignore"
    }).unref();
}

async function sendWithRetry(payload) {
    try {
        return await connectAndSend(payload);
    } catch (e) {
        launchDockSwitch();
    }

    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 120));
        try {
            return await connectAndSend(payload);
        } catch (e) {
            // retry until deadline
        }
    }
    throw new Error("Timed out waiting for dock-switch control server");
}

async function main() {
    const payload = parseArgs(process.argv.slice(2));
    const response = await sendWithRetry(payload);
    process.stdout.write(JSON.stringify(response, null, 2) + "\n");
    if (!response.ok) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err.message || String(err));
    process.exit(1);
});
