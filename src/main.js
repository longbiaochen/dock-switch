const electron = require("electron");
const util = require("util");
const child_process = require("child_process");
var dock_items = [], display_items = [];

electron.app.dock.hide();

electron.app.on("ready", () => {
    // create window
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
        // console.log("Blurred.");
        electron.win.hide();
    });

    electron.globalShortcut.register("F20", () => {
        if (electron.win.isVisible()) {
            electron.win.hide();
        } else {
            // send dock items
            var response = child_process.execSync(`${__dirname}/ui-helper dock 0`).toString();
            console.log(response);
            dock_items = JSON.parse(response);
            show_window();
            electron.win.webContents.send("update-ui", dock_items);
            // send display items
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
    // toggle debug window
    // electron.win.webContents.openDevTools();

    electron.ipcMain.handle('hide-window', (event, path) => {
        // electron.win.blur();
        electron.app.hide();
    })

});

function show_window() {
    var screen = electron.screen.getPrimaryDisplay().bounds;
    electron.win.width = dock_items[dock_items.length - 1].pos.x - dock_items[0].pos.x + 60;
    electron.win.height = 60;
    electron.win.setSize(electron.win.width, electron.win.height);
    electron.win.setPosition(dock_items[0].pos.x, dock_items[0].pos.y);
    electron.win.show();

}