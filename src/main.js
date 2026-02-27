const electron = require("electron");
const util = require("util");
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require(`${__dirname}/config.json`);
var dock_items = [], display_items = [];
const helper_path = path.join(__dirname, "ui-helper");
const osascript_path = "/usr/bin/osascript";
const dock_cache_path = path.join(electron.app.getPath("userData"), "dock-items-cache.json");
const main_debug_path = path.join(electron.app.getPath("userData"), "main-debug.log");

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
            electron.win.hide();
            log_main_debug("launcher-hidden");
        } else {
            // Query Dock items from the helper binary and pass them to the renderer.
            ensure_helper_executable();
            dock_items = get_dock_items_robust();
            log_main_debug(`dock-items-ready count=${dock_items.length}`);
            show_window();
            electron.win.webContents.send("update-ui", dock_items);
            // Also send display data so renderer shortcuts can switch displays.
            display_items = electron.screen.getAllDisplays();
            electron.win.webContents.send("update-display", display_items);
            log_main_debug(`update-ui-sent count=${dock_items.length}`);
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
        electron.app.hide();
    });

    electron.ipcMain.on("get-user-data-path", (event) => {
        event.returnValue = electron.app.getPath("userData");
    });

});

function ensure_helper_executable() {
    fs.chmodSync(helper_path, 0o755);
    fs.accessSync(helper_path, fs.constants.X_OK);
}

function run_dock_query_with_debug() {
    var result = child_process.spawnSync(helper_path, ["dock", "0"], { encoding: "utf8" });
    if (result.status === 0) {
        return result.stdout || "";
    }

    var report_path = write_helper_debug_report(result);
    var err = new Error(
        `ui-helper dock query failed (status=${result.status}, signal=${result.signal || "none"}). ` +
        `Debug report: ${report_path}`
    );
    err.name = "DockQueryError";
    throw err;
}

function get_dock_items_robust() {
    var last_report_path = null;

    for (var i = 0; i < 3; i++) {
        try {
            var response = run_dock_query_with_debug();
            var parsed = JSON.parse(response);
            if (Array.isArray(parsed) && parsed.length > 0) {
                write_dock_cache(parsed);
                return parsed;
            }
        } catch (err) {
            var msg = String(err && err.message || "");
            var marker = "Debug report:";
            if (msg.includes(marker)) {
                last_report_path = msg.split(marker).pop().trim();
            }
        }
        child_process.execFileSync("/bin/sleep", ["0.05"]);
    }

    var cached = read_dock_cache();
    if (cached.length > 0) {
        return cached;
    }

    var fallback = build_fallback_dock_items();
    if (fallback.length > 0) {
        return fallback;
    }

    throw new Error(`Unable to get dock items. Last helper debug report: ${last_report_path || "n/a"}`);
}

function write_dock_cache(items) {
    fs.writeFileSync(dock_cache_path, JSON.stringify(items), "utf8");
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

function build_fallback_dock_items() {
    var configured = Array.isArray(config.dock_items) ? config.dock_items : [];
    if (configured.length === 0) {
        configured = [{ name: "Finder" }, { name: "Terminal" }];
    }

    var primary = electron.screen.getPrimaryDisplay().bounds;
    var start_x = Math.max(40, Math.floor(primary.width / 2) - Math.floor(configured.length * 26));
    var y = Math.max(0, primary.height - 120);

    return configured.map((item, idx) => ({
        name: item.name,
        pos: { x: start_x + idx * 52, y: y }
    }));
}

function write_helper_debug_report(result) {
    var user_data = electron.app.getPath("userData");
    var report_path = path.join(user_data, "ui-helper-debug.log");
    var helper_stat = null;
    var x_ok = false;
    var r_ok = false;

    try {
        helper_stat = fs.statSync(helper_path);
    } catch (e) {
        helper_stat = { stat_error: e.message };
    }

    try {
        fs.accessSync(helper_path, fs.constants.X_OK);
        x_ok = true;
    } catch (e) {
        x_ok = false;
    }

    try {
        fs.accessSync(helper_path, fs.constants.R_OK);
        r_ok = true;
    } catch (e) {
        r_ok = false;
    }

    var debug_payload = {
        timestamp: new Date().toISOString(),
        appPath: electron.app.getAppPath(),
        userDataPath: user_data,
        helperPath: helper_path,
        helperExists: fs.existsSync(helper_path),
        helperModeOctal: helper_stat && helper_stat.mode ? (helper_stat.mode & 0o777).toString(8) : null,
        helperUid: helper_stat && helper_stat.uid,
        helperGid: helper_stat && helper_stat.gid,
        helperSize: helper_stat && helper_stat.size,
        helperReadable: r_ok,
        helperExecutable: x_ok,
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        accessibilityTrusted: electron.systemPreferences.isTrustedAccessibilityClient(false),
        spawnError: result.error ? {
            message: result.error.message,
            code: result.error.code,
            errno: result.error.errno,
            syscall: result.error.syscall,
            path: result.error.path,
            spawnargs: result.error.spawnargs
        } : null,
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr
    };

    var line = `${JSON.stringify(debug_payload)}\n`;
    fs.appendFileSync(report_path, line, "utf8");
    return report_path;
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
    if (!Array.isArray(dock_items) || dock_items.length === 0) {
        return;
    }
    // Match launcher width to Dock item span with small horizontal padding.
    var screen = electron.screen.getPrimaryDisplay().bounds;
    electron.win.width = dock_items[dock_items.length - 1].pos.x - dock_items[0].pos.x + 60;
    electron.win.height = 60;
    electron.win.setSize(electron.win.width, electron.win.height);
    electron.win.setPosition(dock_items[0].pos.x, dock_items[0].pos.y);
    electron.win.show();

}

function log_main_debug(message) {
    try {
        fs.appendFileSync(main_debug_path, `${new Date().toISOString()} ${message}\n`, "utf8");
    } catch (e) {
        // Best-effort debug logging.
    }
}
