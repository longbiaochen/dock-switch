const electron = require("electron");
const fs = require("fs");
const path = require("path");
const { placeFocusedWindowByAction, placeProcessWindowByAction } = require("./window-control");
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
var control_server_handle = null;

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
            // Target the actual focused app process first; fallback to generic focused-window move.
            var processName = focused_process_name();
            if (processName) {
                var ok = placeProcessWindowByAction(processName, dock_query, electron.screen, action);
                if (!ok) {
                    placeFocusedWindowByAction(dock_query, electron.screen, action);
                }
            } else {
                placeFocusedWindowByAction(dock_query, electron.screen, action);
            }
        } catch (e) {
            // Ignore windows that cannot be moved/resized.
        }
    }, arrow_control_apply_delay_ms);
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
