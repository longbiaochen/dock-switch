const electron = require("electron");
const util = require("util");
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
var dock_items = [], display_items = [];
const helper_path = path.join(__dirname, "ui-helper");
const osascript_path = "/usr/bin/osascript";

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

    electron.win.on("blur", function() {
        // Hide whenever focus is lost so the launcher behaves like a transient palette.
        electron.win.hide();
    });

    // F20 toggles the launcher and refreshes Dock/display data each time it opens.
    electron.globalShortcut.register("F20", () => {
        if (!ensure_tcc_permissions()) {
            return;
        }
        if (electron.win.isVisible()) {
            electron.win.hide();
        } else {
            // Query Dock items from the helper binary and pass them to the renderer.
            ensure_helper_executable();
            var response = child_process.execFileSync(helper_path, ["dock", "0"]).toString();
            dock_items = JSON.parse(response);
            show_window();
            electron.win.webContents.send("update-ui", dock_items);
            // Also send display data so renderer shortcuts can switch displays.
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
        electron.app.hide();
    })

});

function ensure_helper_executable() {
    fs.chmodSync(helper_path, 0o755);
    fs.accessSync(helper_path, fs.constants.X_OK);
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
        ]);
        return true;
    } catch (e) {
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
    // Match launcher width to Dock item span with small horizontal padding.
    var screen = electron.screen.getPrimaryDisplay().bounds;
    electron.win.width = dock_items[dock_items.length - 1].pos.x - dock_items[0].pos.x + 60;
    electron.win.height = 60;
    electron.win.setSize(electron.win.width, electron.win.height);
    electron.win.setPosition(dock_items[0].pos.x, dock_items[0].pos.y);
    electron.win.show();

}
