const electron = require("electron");
const util = require("util");
const child_process = require("child_process");
var dock_items = [], display_items = [];

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
        if (electron.win.isVisible()) {
            electron.win.hide();
        } else {
            // Query Dock items from the helper binary and pass them to the renderer.
            var response = child_process.execSync(`${__dirname}/ui-helper dock 0`).toString();
            console.log(response);
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

function show_window() {
    // Match launcher width to Dock item span with small horizontal padding.
    var screen = electron.screen.getPrimaryDisplay().bounds;
    electron.win.width = dock_items[dock_items.length - 1].pos.x - dock_items[0].pos.x + 60;
    electron.win.height = 60;
    electron.win.setSize(electron.win.width, electron.win.height);
    electron.win.setPosition(dock_items[0].pos.x, dock_items[0].pos.y);
    electron.win.show();

}
