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
    moveMouseToApplicationDisplay,
    moveMouseToBoundsDisplayCenter,
    resolveBoundsForPlacement
} = require("./window-control");
const { normalizeLauncherKey } = require("./launcher-key");
const {
    isReservedLauncherShortcut,
    resolveAppShortcut
} = require("./launcher-shortcuts");
const { setupControlServer } = require("./control-server");
const { selectCodexDisplay } = require("./codex-display-control");
const { createGokit5SerialListener } = require("./gokit5-serial");
const {
    resolveOpenPath,
    findAppProcessPidByOpenPath,
    findChromeAppProcessPid
} = require("./web-app-runtime");
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
var control_server_handle = null;
var gokit5_serial_handle = null;
var codex_display_select_inflight = Promise.resolve();
var mouse_feedback_window = null;
var mouse_feedback_hide_timer = null;
var gokit5_status = {
    enabled: false,
    status: "not_started",
    portPath: ""
};

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
    electron.win.webContents.on("before-input-event", handle_launcher_before_input);

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

    electron.ipcMain.on("move-mouse-to-app-display", (event, appName) => {
        move_mouse_to_application_display(String(appName || ""));
    });

    dock_items = read_dock_cache();
    const controlDeps = {
        dockQuery: dock_query,
        electronScreen: electron.screen,
        ensurePermissions: ensure_tcc_permissions,
        getGokit5Status: get_gokit5_status,
        showMouseFeedback: show_mouse_feedback
    };
    control_server_handle = setupControlServer(controlDeps);
    gokit5_serial_handle = setup_gokit5_serial_listener(controlDeps);
});

electron.app.on("before-quit", () => {
    if (gokit5_serial_handle && typeof gokit5_serial_handle.stop === "function") {
        gokit5_serial_handle.stop();
        gokit5_serial_handle = null;
    }
    if (control_server_handle && typeof control_server_handle.cleanup === "function") {
        control_server_handle.cleanup();
        control_server_handle = null;
    }
    if (mouse_feedback_hide_timer) {
        clearTimeout(mouse_feedback_hide_timer);
        mouse_feedback_hide_timer = null;
    }
    if (mouse_feedback_window && !mouse_feedback_window.isDestroyed()) {
        mouse_feedback_window.close();
        mouse_feedback_window = null;
    }
});

function mouse_feedback_html() {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: transparent;
}
#ring {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 54px;
    height: 54px;
    margin-left: -27px;
    margin-top: -27px;
    border: 2px solid rgba(255, 255, 255, 0.92);
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(20, 20, 20, 0.28), 0 0 18px rgba(255, 255, 255, 0.36);
    opacity: 0;
    transform: scale(0.72);
}
#ring.pulse {
    animation: pulse 320ms ease-out forwards;
}
@keyframes pulse {
    0% { opacity: 0; transform: scale(0.72); }
    18% { opacity: 0.92; transform: scale(0.92); }
    100% { opacity: 0; transform: scale(1.38); }
}
</style>
</head>
<body>
<div id="ring"></div>
<script>
const { ipcRenderer } = require("electron");
const ring = document.getElementById("ring");
ipcRenderer.on("pulse", () => {
    ring.classList.remove("pulse");
    void ring.offsetWidth;
    ring.classList.add("pulse");
});
</script>
</body>
</html>`;
}

function get_mouse_feedback_window() {
    if (mouse_feedback_window && !mouse_feedback_window.isDestroyed()) {
        return mouse_feedback_window;
    }

    mouse_feedback_window = new electron.BrowserWindow({
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        fullscreenable: false,
        width: 96,
        height: 96,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mouse_feedback_window.setIgnoreMouseEvents(true);
    mouse_feedback_window.setAlwaysOnTop(true, "screen-saver");
    mouse_feedback_window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(mouse_feedback_html())}`);
    mouse_feedback_window.on("closed", () => {
        mouse_feedback_window = null;
    });
    return mouse_feedback_window;
}

function schedule_mouse_feedback_hide() {
    if (mouse_feedback_hide_timer) {
        clearTimeout(mouse_feedback_hide_timer);
    }
    mouse_feedback_hide_timer = setTimeout(() => {
        mouse_feedback_hide_timer = null;
        if (mouse_feedback_window && !mouse_feedback_window.isDestroyed()) {
            mouse_feedback_window.hide();
        }
    }, 380);
}

function show_mouse_feedback(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return false;
    }

    const size = 96;
    const win = get_mouse_feedback_window();
    win.setBounds({
        x: Math.round(point.x - size / 2),
        y: Math.round(point.y - size / 2),
        width: size,
        height: size
    }, false);
    win.showInactive();
    const send_pulse = () => {
        if (win && !win.isDestroyed()) {
            win.webContents.send("pulse");
            schedule_mouse_feedback_hide();
        }
    };
    if (win.webContents.isLoading()) {
        win.webContents.once("did-finish-load", send_pulse);
    } else {
        send_pulse();
    }
    return true;
}

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
            var directAppPid = findAppProcessPidByOpenPath(item.open_path);
            if (Number.isFinite(directAppPid) && directAppPid > 0) {
                var directPidOk = placePidWindowByPlacement(
                    directAppPid,
                    dock_query,
                    electron.screen,
                    String(item.placement)
                );
                if (directPidOk) {
                    move_mouse_to_placement_display(String(item.placement));
                    return;
                }
            }

            var chromeAppPid = findChromeAppProcessPid(item.app_url);
            if (Number.isFinite(chromeAppPid) && chromeAppPid > 0) {
                var pidOk = placePidWindowByPlacement(
                    chromeAppPid,
                    dock_query,
                    electron.screen,
                    String(item.placement)
                );
                if (pidOk) {
                    move_mouse_to_placement_display(String(item.placement));
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
                move_mouse_to_placement_display(String(item.placement));
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

function move_mouse_to_application_display(appName) {
    if (!appName) {
        return;
    }
    var deadline = Date.now() + app_launch_place_timeout_ms;
    var tryMove = () => {
        try {
            if (moveMouseToApplicationDisplay(appName, dock_query, electron.screen)) {
                return;
            }
        } catch (e) {
            // retry until deadline
        }

        if (Date.now() < deadline) {
            setTimeout(tryMove, app_launch_place_retry_delay_ms);
        }
    };

    setTimeout(tryMove, app_launch_place_retry_delay_ms);
}

function move_mouse_to_placement_display(placement) {
    if (!placement || !dock_query) {
        return;
    }
    try {
        var displays = electron.screen.getAllDisplays();
        var primary = electron.screen.getPrimaryDisplay();
        var target = resolveBoundsForPlacement(placement, displays, primary);
        if (target) {
            moveMouseToBoundsDisplayCenter(dock_query, electron.screen, target);
        }
    } catch (e) {
        // best effort
    }
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

function setup_gokit5_serial_listener(controlDeps) {
    if (process.env.DOCK_SWITCH_GOKIT5 === "0") {
        gokit5_status = {
            enabled: false,
            status: "disabled",
            portPath: ""
        };
        return null;
    }

    gokit5_status = {
        enabled: true,
        status: "starting",
        portPath: ""
    };
    var listener = createGokit5SerialListener({
        onStatus: status => {
            gokit5_status = Object.assign({
                enabled: true,
                updatedAt: new Date().toISOString()
            }, status || {});
        },
        onTarget: (target, event) => {
            if (!target) return;
            codex_display_select_inflight = codex_display_select_inflight
                .catch(() => {})
                .then(() => selectCodexDisplay({
                    target,
                    source: `gokit5:${event && event.button ? event.button : ""}`
                }, controlDeps))
                .catch(() => {});
        }
    });
    listener.start();
    return listener;
}

function get_gokit5_status() {
    var status = Object.assign({}, gokit5_status);
    if (gokit5_serial_handle && typeof gokit5_serial_handle.getPortPath === "function") {
        status.portPath = gokit5_serial_handle.getPortPath() || status.portPath || "";
        status.running = typeof gokit5_serial_handle.isRunning === "function"
            ? gokit5_serial_handle.isRunning()
            : true;
    } else {
        status.running = false;
    }
    return status;
}

function open_item_target(item) {
    if (!item) {
        return;
    }

    var openPath = String(item.open_path || "").trim();
    if (openPath) {
        child_process.execFile("open", [resolveOpenPath(openPath)], () => {});
        return;
    }

    child_process.execFile("open", ["-a", String(item.name)], () => {});
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

function handle_launcher_before_input(event, input) {
    if (!electron.win || !electron.win.isVisible() || !input) {
        return;
    }
    if (input.type !== "keyDown" || input.isAutoRepeat) {
        return;
    }

    var normalizedKey = normalizeLauncherKey(input.key, input.code);
    var shortcutApp = resolveAppShortcut(normalizedKey);
    if (shortcutApp) {
        event.preventDefault();
        electron.win.webContents.send("activate-app-shortcut", shortcutApp);
        return;
    }

    if (isReservedLauncherShortcut(normalizedKey)) {
        event.preventDefault();
        stop_dock_tracking();
        electron.app.hide();
    }
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
