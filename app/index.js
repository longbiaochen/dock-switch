var electron = require("electron");
var util = require("util");
var $ = require("jquery");
var bootstrap = require("bootstrap");
const child_process = require("child_process");

var CONFIG = require(`${__dirname}/config.json`);
var ITEM_TPL = `<div class="item" style="left: %dpx; top: 0;""><button type="button" class="btn btn-info">%s</button></div>`;
var APP_TPL = `open -a "%s"; sleep .5;`;
var SCREEN_TPL = `${__dirname}/ui-helper screen %s`;
var KEY_MAP = { 37: "2", 38: "0", 39: "1"};
var ITEMS = [];

$(function() {
    $(document).on("keydown", function(e) {
        electron.remote.app.hide();
        // new Notification('Title', { body: e.keyCode });
        var screen = electron.screen.getAllDisplays();
        if (KEY_MAP[e.keyCode] != undefined) {
            // Moves
            var name = child_process.execSync(util.format(SCREEN_TPL, KEY_MAP[e.keyCode])).toString();
            // new Notification(KEY_MAP[e.keyCode], { body: name });
            var item = ITEMS.find(item => item.name == name);
            item.screen = KEY_MAP[e.keyCode];
        } else {
            // Apps
            var key = e.key.toUpperCase();
            var item = ITEMS.find(item => item.key == key);
            // new Notification(item.screen, { body: e.keyCode });
            child_process.execSync(util.format(APP_TPL, item.name));
            child_process.execSync(util.format(SCREEN_TPL, item.screen));
        }
    });

    electron.ipcRenderer.on("update-ui", (event, dock_items) => {
        $("#container").html("");
        ITEMS = [];
        var k = 1;
        for (var i = 0; i < dock_items.length - 3; i++) {
            var item = CONFIG.items.find(item => item.name == dock_items[i].name);
            if (item == undefined) {
                item = {
                    name: dock_items[i].name,
                    key: k++,
                    screen: ""
                }
            }
            ITEMS.push(item);
            $("#container").append(util.format(ITEM_TPL, i * 52, item.icon ? item.icon : item.key));
        }
    });

});