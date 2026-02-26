var electron = require("electron");
var util = require("util");
var $ = require("jquery");
var bootstrap = require("bootstrap");
const child_process = require("child_process");

var CONFIG = require(`${__dirname}/config.json`);
// Renderer-side templates for buttons and helper command invocations.
var ITEM_TPL = `<div class="item" style="left: %dpx; top: 0;""><button type="button" class="btn btn-info">%s</button></div>`;
var APP_TPL = `open -a "%s"; sleep .1;`;
var SCREEN_TPL = `${__dirname}/ui-helper screen %s`;
var MOUSE_TPL = `${__dirname}/ui-helper mouse %s`;
// Arrow keys are mapped to display ids expected by ui-helper.
var KEY_MAP = { "ArrowDown": "0", "\\": "2", "ArrowUp": "1", "ArrowLeft": "3", "ArrowRight": "4"};
var DOCK_ITEMS = [],
    DISPLAY_ITEMS = [];

function normalizeAppName(name) {
    return (name || "")
        .trim()
        .replace(/\.app$/i, "")
        .toLowerCase();
}

$(function() {
    $(document).on("keydown", function(e) {
        // electron.remote.app.hide();
        // Hide first so launcher feels instant after key selection.
        electron.ipcRenderer.invoke('hide-window');
        // new Notification(name, { body: e.key });
        if (KEY_MAP[e.key] != undefined) {
            // Arrow-key path: derive the currently focused app on target display.
            var name = child_process.execSync(util.format(SCREEN_TPL, KEY_MAP[e.key])).toString();
            // new Notification(name, { body: e.key });
            var item = DOCK_ITEMS.find(item => item.name == name);
            item.screen = KEY_MAP[e.key];
            child_process.execSync(util.format(MOUSE_TPL, item.screen));
        } else {
            // App-key path: open/focus app, then place focus/mouse on mapped display.
            var key = e.key.toUpperCase();
            var item = DOCK_ITEMS.find(item => item.key == key);
            if (item == undefined) {
                return;
            }
            // new Notification(item.name, { body: key });
            child_process.execSync(util.format(APP_TPL, item.name));
            // var screen_id = (DISPLAY_ITEMS.length == 1) ? 0 : item.screen;
            child_process.execSync(util.format(SCREEN_TPL, item.screen));
            child_process.execSync(util.format(MOUSE_TPL, item.screen));
        }
    });

    electron.ipcRenderer.on("update-ui", (event, dock_items) => {
        $("#container").html("");
        DOCK_ITEMS = [];
        var k = 1;
        for (var i = 0; i < dock_items.length - 3; i++) {
            // Reuse configured key mapping when available; otherwise assign fallback keys.
            var dockName = normalizeAppName(dock_items[i].name);
            var item = CONFIG.dock_items.find(item => normalizeAppName(item.name) == dockName);
            if (item == undefined) {
                item = {
                    name: dock_items[i].name,
                    key: k++,
                    screen: ""
                }
            }
            DOCK_ITEMS.push(item);
            $("#container").append(util.format(ITEM_TPL, i * 52, item.icon || item.key));
        }
    });

    electron.ipcRenderer.on("update-display", (event, display_items) => {
        // Display metadata is kept for future UI logic and parity with main-process updates.
        DISPLAY_ITEMS = display_items;
    });


});
