var electron = require("electron");
var util = require("util");
var $ = require("jquery");
var bootstrap = require("bootstrap");
const child_process = require("child_process");

var CONFIG = require(`${__dirname}/config.json`);
var ITEM_TPL = `<div class="item" style="left: %dpx; top: 0;""><button type="button" class="btn btn-info">%s</button></div>`;
var APP_TPL = `open -a "%s"; sleep .1;`;
var SCREEN_TPL = `${__dirname}/ui-helper screen %s`;
var MOUSE_TPL = `${__dirname}/ui-helper mouse %s`;
var KEY_MAP = { "ArrowDown": "0", "\\": "2", "ArrowUp": "1", "ArrowLeft": "3", "ArrowRight": "4"};
var DOCK_ITEMS = [],
    DISPLAY_ITEMS = [];

function shellEscapeAppleScript(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findExternalDisplay() {
    if (!Array.isArray(DISPLAY_ITEMS) || DISPLAY_ITEMS.length === 0) return null;

    // Prefer explicit external monitor on macOS
    var external = DISPLAY_ITEMS.find(d => d && d.internal === false);
    if (external) return external;

    // Fallback: pick the display with the largest x (usually the external monitor on the right)
    return DISPLAY_ITEMS
        .filter(d => d && d.bounds)
        .sort((a, b) => (b.bounds.x || 0) - (a.bounds.x || 0))[0] || null;
}

function applyWindowPlacement(item) {
    if (!item) return;
    var placement = item.placement || "";

    if (placement !== "external_right_half") return;

    var display = findExternalDisplay();
    if (!display || !display.bounds) return;

    var b = display.bounds;
    var x = Math.floor(b.x + b.width / 2);
    var y = Math.floor(b.y);
    var w = Math.floor(b.width / 2);
    var h = Math.floor(b.height);

    var app = item.name || "";
    var script = null;

    if (app === "Safari") {
        script = `tell application \"Safari\"\n` +
            `  if (count of windows) > 0 then set bounds of front window to {${x}, ${y}, ${x + w}, ${y + h}}\n` +
            `end tell`;
    } else if (app === "Chrome" || app === "Google Chrome") {
        script = `tell application \"Google Chrome\"\n` +
            `  if (count of windows) > 0 then set bounds of front window to {${x}, ${y}, ${x + w}, ${y + h}}\n` +
            `end tell`;
    }

    if (script) {
        child_process.execSync(`osascript -e \"${shellEscapeAppleScript(script)}\"`);
    }
}

$(function() {
    $(document).on("keydown", function(e) {
        // electron.remote.app.hide();
        electron.ipcRenderer.invoke('hide-window');
        // new Notification(name, { body: e.key });
        if (KEY_MAP[e.key] != undefined) {
            // arrow keys
            var name = child_process.execSync(util.format(SCREEN_TPL, KEY_MAP[e.key])).toString();
            // new Notification(name, { body: e.key });
            var item = DOCK_ITEMS.find(item => item.name == name);
            item.screen = KEY_MAP[e.key];
            child_process.execSync(util.format(MOUSE_TPL, item.screen));
        } else {
            // app launches
            var key = e.key.toUpperCase();
            var item = DOCK_ITEMS.find(item => item.key == key);
            // new Notification(item.name, { body: key });
            child_process.execSync(util.format(APP_TPL, item.name));
            // var screen_id = (DISPLAY_ITEMS.length == 1) ? 0 : item.screen;
            child_process.execSync(util.format(SCREEN_TPL, item.screen));
            child_process.execSync(util.format(MOUSE_TPL, item.screen));
            applyWindowPlacement(item);
        }
    });

    electron.ipcRenderer.on("update-ui", (event, dock_items) => {
        $("#container").html("");
        DOCK_ITEMS = [];
        var k = 1;
        for (var i = 0; i < dock_items.length - 3; i++) {
            var item = CONFIG.dock_items.find(item => item.name == dock_items[i].name);
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
        DISPLAY_ITEMS = display_items;
    });


});