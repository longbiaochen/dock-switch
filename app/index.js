var electron = require("electron");
var util = require("util");
var $ = require("jquery");
var bootstrap = require("bootstrap");
const child_process = require("child_process");

var CONFIG = require(`${__dirname}/config.json`);
var ITEM_TPL = `<div class="item" style="left: %dpx; top: 0;""><button type="button" class="btn btn-info">%s</button></div>`;
var APP_TPL = `open -a "%s"; sleep .1;`;
var UI_TPL = `${__dirname}/ui-helper window %s`;
var SCREEN_MAP = { 37: "1", 38: "0", 39: "2", 40: "0" };
var ITEMS = [];

$(function() {
    $(document).on("keydown", function(e) {
        electron.remote.app.hide();
        console.log(e.keyCode);
        if (SCREEN_MAP[e.keyCode] != undefined) {
            var name = child_process.execSync(util.format(UI_TPL, SCREEN_MAP[e.keyCode], SCREEN_MAP[e.keyCode])).toString();
            var item = ITEMS.find(item => item.name == name);
            item.screen = SCREEN_MAP[e.keyCode];
            return;
        }
        var key = e.key.toUpperCase();
        var item = ITEMS.find(item => item.key == key);
        console.log(item)
        if (item) {
            child_process.execSync(util.format(APP_TPL + UI_TPL, item.name, item.screen, item.screen));
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
            $("#container").append(util.format(ITEM_TPL, i * 52, item.key));
        }
    });

});