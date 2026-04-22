const electron = require("electron");
const child_process = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
    placeFocusedWindowByPlacement,
    placeFocusedWindowByAction,
    placeProcessWindowByAction,
    placePidWindowByPlacement,
    placeProcessWindowByPlacement,
    resolveBoundsForPlacement
} = require("./window-control");
const {
    chooseCodexWindowForDisplay,
    chooseCreatedCodexWindow,
    resolveCodexPlacementForDisplayTarget
} = require("./codex-display-launcher");
const { resolveMouseTargetPoint } = require("./display-targets");
const { setupControlServer } = require("./control-server");
var dock_items = [], display_items = [];
const dock_query_module_path = path.join(
    __dirname,
    "..",
    "native",
    "dock-query",
    "build",
    "Release",
    "dock_query.node"
);
var dock_query = null;
const dock_cache_path = path.join(electron.app.getPath("userData"), "dock-items-cache.json");
const dock_poll_interval_ms = 120;
var dock_poll_timer = null;
var last_dock_signature = "";
var dock_tracking_active = false;
var dock_query_inflight = false;
var overlay_open_t0 = 0;
const arrow_control_apply_delay_ms = 90;
const app_launch_place_retry_delay_ms = 60;
const app_launch_place_timeout_ms = 1600;
const codex_new_window_timeout_ms = 5000;
const codex_new_window_poll_ms = 120;
const codex_input_focus_delay_ms = 1400;
const codex_input_focus_after_mouse_delay_ms = 180;
const codex_input_focus_retry_delay_ms = 650;
var control_server_handle = null;
var codex_focus_queue = Promise.resolve();
const CODEX_APP_NAME = "Codex";
const CODEX_APP_BUNDLE_ID = "com.openai.codex";

// Keep the app out of the Dock; interaction is via tray + global shortcut.
electron.app.dock.hide();

electron.app.on("ready", () => {
    try {
        dock_query = require(dock_query_module_path);
    } catch (e) {
        electron.dialog.showErrorBox(
            "dock-query addon failed to load",
            `${e.message}\n\nExpected: ${dock_query_module_path}`
        );
        return;
    }

    // Create a small frameless launcher window that tracks Dock item positions.
    electron.win = new electron.BrowserWindow({
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        // transparent: true,
        // backgroundColor: "#AA000000",
        vibrancy: "dark",
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false
        },
    });

    electron.win.loadURL(`file://${__dirname}/index.html`);

    electron.win.on("blur", function() {
        // Hide whenever focus is lost so the launcher behaves like a transient palette.
        stop_dock_tracking();
        electron.win.hide();
    });

    // F20 toggles the launcher and refreshes Dock/display data each time it opens.
    electron.globalShortcut.register("F20", () => {
        if (!ensure_tcc_permissions()) {
            return;
        }
        if (electron.win.isVisible()) {
            stop_dock_tracking();
            electron.win.hide();
        } else {
            overlay_open_t0 = Date.now();
            // Fast first paint from last known snapshot while fresh query is in flight.
            if (Array.isArray(dock_items) && dock_items.length > 0) {
                show_window();
                electron.win.webContents.send("update-ui", dock_items);
            }
            start_dock_tracking();
            display_items = electron.screen.getAllDisplays();
            electron.win.webContents.send("update-display", display_items);
        }
    });

    var trayIconPath = path.join(__dirname, "icon@2x.png");
    var trayIcon = electron.nativeImage.createFromPath(trayIconPath);
    if (process.platform === "darwin" && trayIcon && !trayIcon.isEmpty()) {
        trayIcon.setTemplateImage(true);
    }
    electron.tray = new electron.Tray(trayIcon);
    const contextMenu = electron.Menu.buildFromTemplate([
        { label: "Settings..." },
        { label: "Quit", role: "quit" }
    ]);
    electron.tray.setContextMenu(contextMenu);
    // Uncomment for renderer debugging.
    // electron.win.webContents.openDevTools();

    electron.ipcMain.handle('hide-window', (event, path) => {
        // Renderer uses this to close after handling a key press.
        stop_dock_tracking();
        electron.app.hide();
    });

    electron.ipcMain.on("arrow-window-control", (event, action) => {
        run_arrow_window_control(action);
    });

    electron.ipcMain.on("launch-app-with-placement", (event, item) => {
        launch_app_with_placement(item);
    });

    electron.ipcMain.on("place-focused-window", (event, placement) => {
        place_focused_window(String(placement || ""));
    });

    electron.ipcMain.on("focus-codex-on-display", (event, target) => {
        focus_codex_on_display(String(target || ""));
    });

    dock_items = read_dock_cache();
    control_server_handle = setupControlServer({
        dockQuery: dock_query,
        electronScreen: electron.screen,
        ensurePermissions: ensure_tcc_permissions
    });
});

electron.app.on("before-quit", () => {
    if (control_server_handle && typeof control_server_handle.cleanup === "function") {
        control_server_handle.cleanup();
        control_server_handle = null;
    }
});

function query_live_dock_items() {
    var items = dock_query.getDockItems();
    if (!Array.isArray(items)) return [];
    return items
        .filter(item => item && item.pos && Number.isFinite(item.pos.x) && Number.isFinite(item.pos.y))
        .sort((a, b) => a.pos.x - b.pos.x);
}

function query_dock_items_async(cb) {
    setImmediate(() => {
        try {
            cb(null, query_live_dock_items());
        } catch (e) {
            cb(e);
        }
    });
}

function write_dock_cache(items) {
    try {
        fs.writeFileSync(dock_cache_path, JSON.stringify(items), "utf8");
    } catch (e) {
        // best effort
    }
}

function read_dock_cache() {
    try {
        if (!fs.existsSync(dock_cache_path)) return [];
        var raw = fs.readFileSync(dock_cache_path, "utf8");
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function get_visible_dock_items(items) {
    return (items || []).filter(item =>
        item &&
        item.name &&
        item.name !== "Trash" &&
        item.name !== "Downloads" &&
        item.pos &&
        Number.isFinite(item.pos.x) &&
        Number.isFinite(item.pos.y)
    );
}

function dock_signature(items) {
    return items.map(item => `${item.name}:${item.pos.x},${item.pos.y}`).join("|");
}

function start_dock_tracking() {
    stop_dock_tracking();
    dock_tracking_active = true;
    refresh_dock_overlay(true);
}

function stop_dock_tracking() {
    dock_tracking_active = false;
    dock_query_inflight = false;
    if (dock_poll_timer) {
        clearTimeout(dock_poll_timer);
        dock_poll_timer = null;
    }
}

function run_arrow_window_control(action) {
    stop_dock_tracking();
    electron.app.hide();
    setTimeout(() => {
        try {
            // Arrow commands should act on the real frontmost window, even when an app
            // has multiple windows (for example Playwright-managed Chrome windows).
            var ok = placeFocusedWindowByAction(dock_query, electron.screen, action);
            if (!ok) {
                var processName = focused_process_name();
                if (processName) {
                    placeProcessWindowByAction(processName, dock_query, electron.screen, action);
                }
            }
        } catch (e) {
            // Ignore windows that cannot be moved/resized.
        }
    }, arrow_control_apply_delay_ms);
}

function launch_app_with_placement(item) {
    if (!item || !item.name || !item.placement) {
        return;
    }

    open_item_target(item);
    var deadline = Date.now() + app_launch_place_timeout_ms;
    var tryPlace = () => {
        if (!dock_query) {
            return;
        }
        try {
            var chromeAppPid = find_chrome_app_process_pid(item.app_url);
            if (Number.isFinite(chromeAppPid) && chromeAppPid > 0) {
                var pidOk = placePidWindowByPlacement(
                    chromeAppPid,
                    dock_query,
                    electron.screen,
                    String(item.placement)
                );
                if (pidOk) {
                    return;
                }
            }

            var ok = placeProcessWindowByPlacement(
                String(item.name),
                dock_query,
                electron.screen,
                String(item.placement)
            );
            if (ok) {
                return;
            }
        } catch (e) {
            // retry until deadline
        }

        if (Date.now() < deadline) {
            setTimeout(tryPlace, app_launch_place_retry_delay_ms);
        }
    };

    setTimeout(tryPlace, app_launch_place_retry_delay_ms);
}

function place_focused_window(placement) {
    if (!placement) {
        return;
    }

    stop_dock_tracking();
    electron.app.hide();
    setTimeout(() => {
        try {
            placeFocusedWindowByPlacement(dock_query, electron.screen, placement);
        } catch (e) {
            // Ignore windows that cannot be moved/resized.
        }
    }, arrow_control_apply_delay_ms);
}

function focus_codex_on_display(target) {
    if (!target) {
        return;
    }
    stop_dock_tracking();
    electron.app.hide();
    setTimeout(() => {
        codex_focus_queue = codex_focus_queue
            .catch(() => {})
            .then(() => focus_codex_on_display_impl(target))
            .catch(() => {
                // Ignore Codex orchestration failures.
            });
    }, arrow_control_apply_delay_ms);
}

async function focus_codex_on_display_impl(target) {
    var displays = electron.screen.getAllDisplays();
    var primary = electron.screen.getPrimaryDisplay();
    var windows = get_application_windows(CODEX_APP_NAME);
    var existing = chooseCodexWindowForDisplay(windows, target, displays, primary);
    if (existing) {
        var existingPlacement = resolveCodexPlacementForDisplayTarget(target);
        var existingBounds = resolveBoundsForPlacement(existingPlacement, displays, primary);
        focus_application_window(existing);
        if (existingBounds) {
            move_application_window(existing, existingBounds);
            existing = Object.assign({}, existing, existingBounds);
        }
        schedule_mouse_and_input_focus(target);
        return;
    }

    var created = await create_codex_window(target);
    if (!created) {
        return;
    }

    displays = electron.screen.getAllDisplays();
    primary = electron.screen.getPrimaryDisplay();
    var placement = resolveCodexPlacementForDisplayTarget(target);
    var bounds = resolveBoundsForPlacement(placement, displays, primary);
    focus_application_window(created);
    if (bounds) {
        move_application_window(created, bounds);
        created = Object.assign({}, created, bounds);
    }
    schedule_mouse_and_input_focus(target);
}

function get_application_windows(appName) {
    if (!dock_query || typeof dock_query.getApplicationWindows !== "function") {
        return [];
    }
    try {
        var windows = dock_query.getApplicationWindows({ name: String(appName) });
        return Array.isArray(windows) ? windows : [];
    } catch (e) {
        return [];
    }
}

function focus_application_window(windowInfo) {
    if (!windowInfo || !dock_query ||
        typeof dock_query.focusApplicationWindowByPid !== "function") {
        return false;
    }
    try {
        return !!dock_query.focusApplicationWindowByPid({
            pid: Number(windowInfo.pid),
            windowIndex: Number(windowInfo.windowIndex)
        });
    } catch (e) {
        return false;
    }
}

function move_application_window(windowInfo, bounds) {
    if (!windowInfo || !bounds || !dock_query ||
        typeof dock_query.moveApplicationWindowByPidAndIndex !== "function") {
        return false;
    }
    try {
        return !!dock_query.moveApplicationWindowByPidAndIndex({
            pid: Number(windowInfo.pid),
            windowIndex: Number(windowInfo.windowIndex),
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            w: Math.round(bounds.w),
            h: Math.round(bounds.h)
        });
    } catch (e) {
        return false;
    }
}

function move_mouse_to_display_center(target) {
    if (!dock_query || typeof dock_query.moveMouse !== "function") {
        return false;
    }
    try {
        var point = resolveMouseTargetPoint(
            target,
            electron.screen.getAllDisplays(),
            electron.screen.getPrimaryDisplay()
        );
        if (!point) {
            return false;
        }
        return !!dock_query.moveMouse({
            x: Math.round(point.x),
            y: Math.round(point.y)
        });
    } catch (e) {
        return false;
    }
}

function schedule_mouse_and_input_focus(target) {
    setTimeout(() => {
        move_mouse_to_display_center(target);
    }, codex_input_focus_delay_ms);
    setTimeout(() => {
        focus_codex_window_on_display(target);
        focus_codex_composer_with_escape();
    }, codex_input_focus_delay_ms + codex_input_focus_after_mouse_delay_ms);
    setTimeout(() => {
        focus_codex_window_on_display(target);
        focus_codex_composer_with_escape();
    }, codex_input_focus_delay_ms + codex_input_focus_after_mouse_delay_ms + codex_input_focus_retry_delay_ms);
}

function focus_codex_window_on_display(target) {
    var windows = get_application_windows(CODEX_APP_NAME);
    var existing = chooseCodexWindowForDisplay(
        windows,
        target,
        electron.screen.getAllDisplays(),
        electron.screen.getPrimaryDisplay()
    );
    if (!existing) return false;
    return focus_application_window(existing);
}

function focus_codex_composer_with_escape() {
    if (dock_query && typeof dock_query.pressKeyCode === "function") {
        try {
            return !!dock_query.pressKeyCode({ keyCode: 53 });
        } catch (e) {
            // Fall through to AppleScript on older native builds.
        }
    }

    var script = [
        `tell application id "${CODEX_APP_BUNDLE_ID}" to activate`,
        "tell application \"System Events\"",
        "key code 53",
        "end tell"
    ];
    var args = script.flatMap(line => ["-e", line]);
    child_process.execFile("osascript", args, () => {});
}

async function create_codex_window(target) {
    var beforeWindows = get_application_windows(CODEX_APP_NAME);
    if (beforeWindows.length === 0) {
        if (!launch_codex_app()) {
            return null;
        }
    } else {
        var triggered = await trigger_codex_new_window();
        if (!triggered) {
            await sleep(codex_new_window_poll_ms);
            triggered = await trigger_codex_new_window();
        }
        if (!triggered) {
            return null;
        }
    }

    var afterWindows = await wait_for_codex_window(beforeWindows);
    if (afterWindows.length === 0) {
        return null;
    }
    return chooseCreatedCodexWindow(
        beforeWindows,
        afterWindows,
        target,
        electron.screen.getAllDisplays(),
        electron.screen.getPrimaryDisplay()
    );
}

function launch_codex_app() {
    try {
        child_process.execFileSync("open", ["-b", CODEX_APP_BUNDLE_ID], {
            stdio: "ignore"
        });
        return true;
    } catch (e) {
        return false;
    }
}

function trigger_codex_new_window() {
    return new Promise(resolve => {
        var script = [
            `tell application id "${CODEX_APP_BUNDLE_ID}" to activate`,
            "tell application \"System Events\"",
            `tell process "${CODEX_APP_NAME}"`,
            "click menu item \"New Window\" of menu 1 of menu bar item \"File\" of menu bar 1",
            "end tell",
            "end tell"
        ];
        var args = script.flatMap(line => ["-e", line]);
        child_process.execFile("osascript", args, error => {
            resolve(!error);
        });
    });
}

function wait_for_codex_window(beforeWindows) {
    return new Promise(resolve => {
        var deadline = Date.now() + codex_new_window_timeout_ms;
        function poll() {
            var current = get_application_windows(CODEX_APP_NAME);
            if (current.length > beforeWindows.length) {
                resolve(current);
                return;
            }
            if (beforeWindows.length === 0 && current.length > 0) {
                resolve(current);
                return;
            }
            if (Date.now() >= deadline) {
                resolve(current);
                return;
            }
            setTimeout(poll, codex_new_window_poll_ms);
        }
        poll();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function open_item_target(item) {
    if (!item) {
        return;
    }

    var openPath = String(item.open_path || "").trim();
    if (openPath) {
        var expandedPath = expand_user_path(openPath);
        child_process.execFile("open", [expandedPath], () => {});
        return;
    }

    child_process.execFile("open", ["-a", String(item.name)], () => {});
}

function expand_user_path(inputPath) {
    if (!inputPath) return "";
    if (inputPath === "~") return os.homedir();
    if (inputPath.startsWith("~/")) {
        return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
}

function escape_regex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function find_chrome_app_process_pid(appUrl) {
    var targetUrl = String(appUrl || "").trim();
    if (!targetUrl) {
        return null;
    }

    try {
        var result = child_process.spawnSync(
            "ps",
            ["ax", "-o", "pid=,command="],
            { encoding: "utf8" }
        );
        if (result.status !== 0) {
            return null;
        }

        var urlPattern = new RegExp(`--app=${escape_regex(targetUrl)}(?:\\s|$)`);
        var chromePattern = /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/;
        var candidates = String(result.stdout || "")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                var match = line.match(/^(\d+)\s+(.*)$/);
                if (!match) return null;
                return {
                    pid: Number(match[1]),
                    command: match[2]
                };
            })
            .filter(Boolean)
            .filter(entry => chromePattern.test(entry.command))
            .filter(entry => !/--type=/.test(entry.command))
            .filter(entry => !/crashpad_handler/.test(entry.command))
            .filter(entry => urlPattern.test(entry.command))
            .sort((a, b) => b.pid - a.pid);

        return candidates.length > 0 ? candidates[0].pid : null;
    } catch (e) {
        return null;
    }
}

function focused_process_name() {
    try {
        if (dock_query && typeof dock_query.getFocusedApplicationName === "function") {
            var name = String(dock_query.getFocusedApplicationName() || "").trim();
            if (name && name !== "dock-switch" && name !== "Electron") {
                return name;
            }
        }
    } catch (e) {
        // ignore
    }
    return "";
}

function refresh_dock_overlay(force_send) {
    if (!dock_tracking_active) {
        return;
    }
    if (dock_query_inflight) {
        schedule_next_dock_refresh();
        return;
    }
    dock_query_inflight = true;
    query_dock_items_async((err, items) => {
        dock_query_inflight = false;
        if (!dock_tracking_active) {
            return;
        }

        if (err) {
            schedule_next_dock_refresh();
            return;
        }

        dock_items = Array.isArray(items) ? items : [];
        if (dock_items.length === 0) {
            schedule_next_dock_refresh();
            return;
        }
        write_dock_cache(dock_items);

        var visible = get_visible_dock_items(dock_items);
        if (visible.length === 0) {
            schedule_next_dock_refresh();
            return;
        }

        var sig = dock_signature(visible);
        show_window();
        if (force_send || sig !== last_dock_signature) {
            last_dock_signature = sig;
            electron.win.webContents.send("update-ui", dock_items);
        }
        schedule_next_dock_refresh();
    });
}

function schedule_next_dock_refresh() {
    if (!dock_tracking_active) return;
    if (dock_poll_timer) {
        clearTimeout(dock_poll_timer);
    }
    dock_poll_timer = setTimeout(() => {
        refresh_dock_overlay(false);
    }, dock_poll_interval_ms);
}

function ensure_tcc_permissions() {
    if (!ensure_accessibility_permission()) {
        return false;
    }
    return true;
}

function ensure_accessibility_permission() {
    if (electron.systemPreferences.isTrustedAccessibilityClient(false)) {
        return true;
    }

    // Trigger the native Accessibility prompt.
    electron.systemPreferences.isTrustedAccessibilityClient(true);
    var action = electron.dialog.showMessageBoxSync({
        type: "warning",
        buttons: ["Open Accessibility Settings", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        message: "dock-switch needs Accessibility permission",
        detail: "Enable dock-switch in Privacy & Security > Accessibility, then reopen the app."
    });
    if (action === 0) {
        electron.shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
    }
    return false;
}

function show_window() {
    var visible = get_visible_dock_items(dock_items);
    if (visible.length === 0) {
        return;
    }
    var first = visible[0];
    var last = visible[visible.length - 1];
    var min_y = Math.min.apply(null, visible.map(item => item.pos.y));
    var max_y = Math.max.apply(null, visible.map(item => item.pos.y));
    var center_y = Math.round((min_y + max_y) / 2);
    var display = electron.screen.getDisplayNearestPoint({ x: Math.round(first.pos.x), y: center_y });
    var display_mid_y = display.bounds.y + Math.floor(display.bounds.height / 2);
    var is_bottom_dock = center_y >= display_mid_y;
    electron.win.width = Math.max(120, last.pos.x - first.pos.x + 60);
    electron.win.height = 60;
    electron.win.setSize(electron.win.width, electron.win.height);
    var y = is_bottom_dock ? (min_y - electron.win.height - 8) : (max_y + 52 + 8);
    y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - electron.win.height));
    electron.win.setPosition(first.pos.x, y);
    electron.win.show();
}
