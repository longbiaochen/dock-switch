const electron = require("electron");
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
var dock_items = [], display_items = [];
const osascript_path = "/usr/bin/osascript";
const main_debug_path = path.join(electron.app.getPath("userData"), "main-debug.log");
const dock_poll_interval_ms = 320;
var dock_poll_timer = null;
var last_dock_signature = "";
var last_automation_prompt_at = 0;
var dock_tracking_active = false;
var dock_query_inflight = false;
const dock_query_script =
    "tell application \"System Events\"\n" +
    "  tell process \"Dock\"\n" +
    "    set theList to list 1\n" +
    "    set out to \"\"\n" +
    "    repeat with e in UI elements of theList\n" +
    "      try\n" +
    "        set n to name of e\n" +
    "      on error\n" +
    "        set n to \"\"\n" +
    "      end try\n" +
    "      try\n" +
    "        set p to position of e\n" +
    "        set out to out & n & \"|\" & (item 1 of p as text) & \"|\" & (item 2 of p as text) & linefeed\n" +
    "      end try\n" +
    "    end repeat\n" +
    "    return out\n" +
    "  end tell\n" +
    "end tell";

// Keep the app out of the Dock; interaction is via tray + global shortcut.
electron.app.dock.hide();

electron.app.on("ready", () => {
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
    electron.win.webContents.on("did-finish-load", () => {
        log_main_debug("renderer-ready");
    });

    electron.win.on("blur", function() {
        // Hide whenever focus is lost so the launcher behaves like a transient palette.
        stop_dock_tracking();
        electron.win.hide();
    });

    // F20 toggles the launcher and refreshes Dock/display data each time it opens.
    electron.globalShortcut.register("F20", () => {
        log_main_debug("f20-pressed");
        if (!ensure_tcc_permissions()) {
            log_main_debug("f20-abort-no-accessibility");
            return;
        }
        if (electron.win.isVisible()) {
            stop_dock_tracking();
            electron.win.hide();
            log_main_debug("launcher-hidden");
        } else {
            start_dock_tracking();
            display_items = electron.screen.getAllDisplays();
            electron.win.webContents.send("update-display", display_items);
        }
    });

    electron.tray = new electron.Tray(`${__dirname}/icon@2x.png`);
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

    electron.ipcMain.on("get-user-data-path", (event) => {
        event.returnValue = electron.app.getPath("userData");
    });

});

function query_live_dock_items() {
    return query_dock_items_via_osascript();
}

function query_dock_items_via_osascript() {
    var output = child_process.execFileSync(osascript_path, ["-e", dock_query_script], { encoding: "utf8" });
    return parse_osascript_dock_output(output);
}

function query_dock_items_via_osascript_async(cb) {
    child_process.execFile(
        osascript_path,
        ["-e", dock_query_script],
        { encoding: "utf8", timeout: 800 },
        (err, stdout) => {
            if (err) {
                cb(err);
                return;
            }
            try {
                cb(null, parse_osascript_dock_output(stdout));
            } catch (parseErr) {
                cb(parseErr);
            }
        }
    );
}

function parse_osascript_dock_output(output) {
    return String(output || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            var parts = line.split("|");
            if (parts.length < 3) return null;
            var name = parts[0] === "missing value" ? "" : parts[0];
            var x = Number(parts[1]);
            var y = Number(parts[2]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { name: name, pos: { x: x, y: y } };
        })
        .filter(Boolean)
        .sort((a, b) => a.pos.x - b.pos.x);
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
    if (!ensure_automation_permission()) {
        return;
    }
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

function refresh_dock_overlay(force_send) {
    if (!dock_tracking_active) {
        return;
    }
    if (dock_query_inflight) {
        schedule_next_dock_refresh();
        return;
    }
    dock_query_inflight = true;
    query_dock_items_via_osascript_async((err, items) => {
        dock_query_inflight = false;
        if (!dock_tracking_active) {
            return;
        }

        if (err) {
            log_main_debug(`dock-query-failed ${String(err && err.message || err)}`);
            schedule_next_dock_refresh();
            return;
        }

        dock_items = Array.isArray(items) ? items : [];
        if (dock_items.length === 0) {
            schedule_next_dock_refresh();
            return;
        }

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
            log_main_debug(`update-ui-sent count=${dock_items.length}`);
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
    if (!ensure_automation_permission()) {
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

function ensure_automation_permission() {
    try {
        child_process.execFileSync(osascript_path, [
            "-e",
            "tell application \"System Events\" to count (application processes)"
        ], { encoding: "utf8" });
        return true;
    } catch (e) {
        var now = Date.now();
        if (now - last_automation_prompt_at < 10000) {
            return false;
        }
        last_automation_prompt_at = now;
        var action = electron.dialog.showMessageBoxSync({
            type: "warning",
            buttons: ["Open Automation Settings", "Cancel"],
            defaultId: 0,
            cancelId: 1,
            message: "dock-switch needs Automation permission",
            detail: "Allow dock-switch to control System Events in Privacy & Security > Automation."
        });
        if (action === 0) {
            electron.shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation");
        }
        return false;
    }
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

function log_main_debug(message) {
    try {
        fs.appendFileSync(main_debug_path, `${new Date().toISOString()} ${message}\n`, "utf8");
    } catch (e) {
        // Best-effort debug logging.
    }
}
