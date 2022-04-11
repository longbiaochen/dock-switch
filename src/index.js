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
var KEY_MAP = { "ArrowUp": "0", "ArrowDown": "1", "ArrowLeft": "2", "ArrowRight": "3" };
var DOCK_ITEMS = [],
    DISPLAY_ITEMS = [];
var SCREEN_REPEAT = 7;

$(function() {
    $(document).on("keydown", function(e) {
        // electron.remote.app.hide();
        electron.ipcRenderer.invoke('hide-window');
        if (KEY_MAP[e.key] != undefined) {
            // arrow keys
            for (var i = SCREEN_REPEAT; i >= 0; i--) {
                // repeat for Google Chrome and Microsoft apps
                var name = child_process.execSync(util.format(SCREEN_TPL, KEY_MAP[e.key])).toString();
                // new Notification(name, { body: name });
            }
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
            for (var i = SCREEN_REPEAT; i >= 0; i--) {
                // repeat for Google Chrome and Microsoft apps
                var name = child_process.execSync(util.format(SCREEN_TPL, item.screen)).toString();
                // new Notification(name, { body: name });
            }
            child_process.execSync(util.format(MOUSE_TPL, item.screen));
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