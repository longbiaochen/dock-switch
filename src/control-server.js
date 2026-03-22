const childProcess = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { placeProcessWindowByPlacement } = require("./window-control");

const CONTROL_DIR = path.join(os.homedir(), "Library", "Application Support", "dock-switch");
const CONTROL_SOCKET_PATH = path.join(CONTROL_DIR, "control.sock");

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureControlDirectory() {
    fs.mkdirSync(CONTROL_DIR, { recursive: true });
}

function removeStaleSocket() {
    try {
        if (fs.existsSync(CONTROL_SOCKET_PATH)) {
            fs.unlinkSync(CONTROL_SOCKET_PATH);
        }
    } catch (e) {
        // best effort
    }
}

async function placeApplicationWindow(command, deps) {
    const appName = String(command.appName || "").trim();
    const placement = String(command.placement || "").trim();
    if (!appName) {
        return { ok: false, error: "appName is required" };
    }
    if (!placement) {
        return { ok: false, error: "placement is required" };
    }
    if (!deps.ensurePermissions()) {
        return { ok: false, error: "Accessibility permission is required" };
    }

    await new Promise(resolve => {
        childProcess.execFile("open", ["-a", appName], () => resolve());
    });

    const deadline = Date.now() + 1600;
    do {
        try {
            const ok = placeProcessWindowByPlacement(
                appName,
                deps.dockQuery,
                deps.electronScreen,
                placement
            );
            if (ok) {
                return { ok: true };
            }
        } catch (e) {
            // retry until deadline
        }
        await delay(60);
    } while (Date.now() < deadline);

    return { ok: false, error: `Failed to place window for ${appName}` };
}

async function moveApplicationWindow(command, deps) {
    const appName = String(command.appName || "").trim();
    const x = Number(command.x);
    const y = Number(command.y);
    const w = Number(command.w);
    const h = Number(command.h);

    if (!appName) {
        return { ok: false, error: "appName is required" };
    }
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
        return { ok: false, error: "valid x/y/w/h are required" };
    }
    if (!deps.ensurePermissions()) {
        return { ok: false, error: "Accessibility permission is required" };
    }

    await new Promise(resolve => {
        childProcess.execFile("open", ["-a", appName], () => resolve());
    });

    const deadline = Date.now() + 1600;
    do {
        try {
            const ok = deps.dockQuery.moveApplicationWindow({
                name: appName,
                x: Math.round(x),
                y: Math.round(y),
                w: Math.round(w),
                h: Math.round(h)
            });
            if (ok) {
                return { ok: true };
            }
        } catch (e) {
            // retry until deadline
        }
        await delay(60);
    } while (Date.now() < deadline);

    return { ok: false, error: `Failed to move window for ${appName}` };
}

function getDisplaysSnapshot(deps) {
    return deps.electronScreen.getAllDisplays().map(display => ({
        id: display.id,
        internal: display.internal,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        label: display.label
    }));
}

function setupControlServer(deps) {
    ensureControlDirectory();
    removeStaleSocket();

    const server = net.createServer(socket => {
        let buffer = "";

        socket.on("data", chunk => {
            buffer += chunk.toString("utf8");
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
                const raw = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (!raw) {
                    newlineIndex = buffer.indexOf("\n");
                    continue;
                }

                (async () => {
                    let response;
                    try {
                        const command = JSON.parse(raw);
                        if (command.command === "place-app") {
                            response = await placeApplicationWindow(command, deps);
                        } else if (command.command === "move-app") {
                            response = await moveApplicationWindow(command, deps);
                        } else if (command.command === "debug-displays") {
                            response = { ok: true, displays: getDisplaysSnapshot(deps) };
                        } else {
                            response = { ok: false, error: `Unsupported command: ${command.command || ""}` };
                        }
                    } catch (e) {
                        response = { ok: false, error: e.message || String(e) };
                    }

                    try {
                        socket.write(JSON.stringify(response) + "\n");
                    } finally {
                        socket.end();
                    }
                })();

                newlineIndex = -1;
            }
        });
    });

    server.on("error", err => {
        if (err && err.code === "EADDRINUSE") {
            removeStaleSocket();
            setTimeout(() => {
                try {
                    server.listen(CONTROL_SOCKET_PATH);
                } catch (e) {
                    // ignore repeated startup failures
                }
            }, 100);
        }
    });

    server.listen(CONTROL_SOCKET_PATH);
    return {
        server,
        cleanup() {
            try {
                server.close();
            } catch (e) {
                // ignore
            }
            removeStaleSocket();
        }
    };
}

module.exports = {
    CONTROL_SOCKET_PATH,
    setupControlServer
};
