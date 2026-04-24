const childProcess = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const {
    placePidWindowByPlacement,
    placeProcessWindowByPlacement
} = require("./window-control");
const { selectCodexDisplay } = require("./codex-display-control");
const { placeComputerUseBrowser } = require("./computer-use-browser-placement");

const CONTROL_DIR = path.join(os.homedir(), "Library", "Application Support", "dock-switch");
const CONTROL_SOCKET_PATH = path.join(CONTROL_DIR, "control.sock");
const inflightCommands = new Map();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureControlDirectory() {
    fs.mkdirSync(CONTROL_DIR, { recursive: true });
}

function runSingleFlight(key, work) {
    if (!key) {
        return work();
    }
    const existing = inflightCommands.get(key);
    if (existing) {
        return existing;
    }

    const promise = Promise.resolve()
        .then(work)
        .finally(() => {
            if (inflightCommands.get(key) === promise) {
                inflightCommands.delete(key);
            }
        });

    inflightCommands.set(key, promise);
    return promise;
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

    return runSingleFlight(`place-app:${appName}:${placement}`, async () => {
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
    });
}

async function placePidWindow(command, deps) {
    const pid = Number(command.pid);
    const placement = String(command.placement || "").trim();
    if (!Number.isFinite(pid) || pid <= 0) {
        return { ok: false, error: "pid is required" };
    }
    if (!placement) {
        return { ok: false, error: "placement is required" };
    }
    if (!deps.ensurePermissions()) {
        return { ok: false, error: "Accessibility permission is required" };
    }

    return runSingleFlight(`place-pid:${Math.round(pid)}:${placement}`, async () => {
        const deadline = Date.now() + 1600;
        do {
            try {
                const ok = placePidWindowByPlacement(
                    Math.round(pid),
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

        return { ok: false, error: `Failed to place window for pid ${Math.round(pid)}` };
    });
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

    return runSingleFlight(`move-app:${appName}:${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`, async () => {
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
    });
}

async function movePidWindow(command, deps) {
    const pid = Number(command.pid);
    const x = Number(command.x);
    const y = Number(command.y);
    const w = Number(command.w);
    const h = Number(command.h);

    if (!Number.isFinite(pid) || pid <= 0) {
        return { ok: false, error: "pid is required" };
    }
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
        return { ok: false, error: "valid x/y/w/h are required" };
    }
    if (!deps.ensurePermissions()) {
        return { ok: false, error: "Accessibility permission is required" };
    }

    return runSingleFlight(`move-pid:${Math.round(pid)}:${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`, async () => {
        const deadline = Date.now() + 1600;
        do {
            try {
                const ok = deps.dockQuery.moveApplicationWindowByPid({
                    pid: Math.round(pid),
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

        return { ok: false, error: `Failed to move window for pid ${Math.round(pid)}` };
    });
}

async function selectCodexDisplayWindow(command, deps) {
    const target = String(command.target || "").trim();
    if (!target) {
        return { ok: false, error: "target is required" };
    }

    return runSingleFlight(`select-codex-display:${target}`, () => (
        selectCodexDisplay(command, deps)
    ));
}

async function placeComputerUseBrowserWindow(command, deps) {
    const anchorApp = String((command && command.anchorApp) || "Codex").trim();
    const browserApp = String((command && command.browserApp) || "Google Chrome for Testing").trim();
    return runSingleFlight(`computer-use-browser:${anchorApp}:${browserApp}`, () => (
        placeComputerUseBrowser(command, deps)
    ));
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

function getGokit5Status(deps) {
    if (deps && typeof deps.getGokit5Status === "function") {
        return { ok: true, gokit5: deps.getGokit5Status() };
    }
    return { ok: true, gokit5: { enabled: false, status: "unavailable" } };
}

function replyAndClose(socket, state, response) {
    if (state.responded) {
        return;
    }
    state.responded = true;

    if (state.closed || socket.destroyed || socket.writableEnded) {
        return;
    }

    socket.write(JSON.stringify(response) + "\n", () => {
        if (!socket.destroyed) {
            socket.end();
        }
    });
}

function setupControlServer(deps) {
    ensureControlDirectory();
    removeStaleSocket();

    const server = net.createServer(socket => {
        let buffer = "";
        const state = {
            closed: false,
            responded: false
        };

        socket.on("close", () => {
            state.closed = true;
        });

        // Hotkey launchers and short-lived CLI wrappers can disconnect before the
        // placement work finishes. Treat broken pipes as expected, not fatal.
        socket.on("error", () => {
            state.closed = true;
        });

        socket.on("data", chunk => {
            if (state.responded) {
                return;
            }
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
                        } else if (command.command === "place-pid") {
                            response = await placePidWindow(command, deps);
                        } else if (command.command === "move-app") {
                            response = await moveApplicationWindow(command, deps);
                        } else if (command.command === "move-pid") {
                            response = await movePidWindow(command, deps);
                        } else if (command.command === "select-codex-display") {
                            response = await selectCodexDisplayWindow(command, deps);
                        } else if (command.command === "computer-use-browser") {
                            response = await placeComputerUseBrowserWindow(command, deps);
                        } else if (command.command === "gokit5-status") {
                            response = getGokit5Status(deps);
                        } else if (command.command === "debug-displays") {
                            response = { ok: true, displays: getDisplaysSnapshot(deps) };
                        } else {
                            response = { ok: false, error: `Unsupported command: ${command.command || ""}` };
                        }
                    } catch (e) {
                        response = { ok: false, error: e.message || String(e) };
                    }

                    replyAndClose(socket, state, response);
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
