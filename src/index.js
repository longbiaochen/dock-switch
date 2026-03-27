var electron = require("electron");
var util = require("util");
var $ = require("jquery");
var bootstrap = require("bootstrap");
const child_process = require("child_process");
const path = require("path");

var CONFIG = require(`${__dirname}/config.json`);
// Renderer-side templates for buttons and app launch command.
var ITEM_TPL = `<div class="item" style="left: %dpx; top: 0;""><button type="button" class="btn btn-info">%s</button></div>`;
var ARROW_KEY_ACTIONS = Object.freeze({
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    "\\": "fill",
    "Backslash": "fill"
});
var DOCK_ITEMS = [];
const DOCK_QUERY_MODULE_PATH = path.join(
    __dirname,
    "..",
    "native",
    "dock-query",
    "build",
    "Release",
    "dock_query.node"
);
var dockQuery = null;
try {
    dockQuery = require(DOCK_QUERY_MODULE_PATH);
} catch (e) {
    dockQuery = null;
}

// In-memory only window state cache (per app, current app session).
var WINDOW_STATE_CACHE = {};

function normalizeAppName(name) {
    var normalized = (name || "")
        .trim()
        .replace(/\.app$/i, "")
        .toLowerCase();

    if (normalized === "chrome") {
        return "google chrome";
    }

    return normalized;
}

function setSavedWindowState(appName, bounds) {
    if (!appName || !bounds) return;

    var key = normalizeAppName(appName);
    if (!key) return;

    WINDOW_STATE_CACHE[key] = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        w: Math.round(bounds.w),
        h: Math.round(bounds.h),
        updatedAt: Date.now()
    };
}

function getSavedWindowState(appName) {
    var key = normalizeAppName(appName);
    if (!key) return null;

    var s = WINDOW_STATE_CACHE[key];
    if (!s) return null;

    if (![s.x, s.y, s.w, s.h].every(Number.isFinite)) {
        return null;
    }

    if (s.w <= 0 || s.h <= 0) {
        return null;
    }

    return s;
}

function saveFrontmostWindowState() {
    if (!dockQuery ||
        typeof dockQuery.getFocusedApplicationName !== "function" ||
        typeof dockQuery.getFocusedWindowBounds !== "function") {
        return;
    }
    try {
        var appName = String(dockQuery.getFocusedApplicationName() || "").trim();
        var b = dockQuery.getFocusedWindowBounds();
        if (!appName || !b) return;
        if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0) return;
        setSavedWindowState(appName, { x: b.x, y: b.y, w: b.w, h: b.h });
    } catch (e) {
        // ignore
    }
}

function restoreWindowState(item) {
    if (!item || item.remember_window_state === false) return;

    var app = item.name || "";
    var state = getSavedWindowState(app);
    if (!state) return;

    if (!dockQuery || typeof dockQuery.moveApplicationWindow !== "function") return;
    try {
        dockQuery.moveApplicationWindow({
            name: app,
            x: state.x,
            y: state.y,
            w: state.w,
            h: state.h
        });
    } catch (e) {
        // ignore
    }
}

function getArrowAction(key, code) {
    if (ARROW_KEY_ACTIONS[key] !== undefined) return ARROW_KEY_ACTIONS[key];
    if (ARROW_KEY_ACTIONS[code] !== undefined) return ARROW_KEY_ACTIONS[code];
    return undefined;
}

function handleArrowWindowControl(key, code) {
    var action = getArrowAction(key, code);
    if (action === undefined) return;
    // Fire-and-forget to main process: hide + one-shot placement with no retry loops.
    electron.ipcRenderer.send("arrow-window-control", action);
}

$(function() {
    $(document).on("keydown", function(e) {
        if (getArrowAction(e.key, e.code) !== undefined) {
            handleArrowWindowControl(e.key, e.code);
        } else {
            // Hide first so launcher feels instant after key selection.
            electron.ipcRenderer.invoke('hide-window');
            // App-key path: open/focus app, then restore configured placement/window state.
            var key = e.key.toUpperCase();
            var item = DOCK_ITEMS.find(item => item.key == key);
            if (item == undefined) {
                return;
            }

            saveFrontmostWindowState();
            // new Notification(item.name, { body: key });
            if (item.placement) {
                electron.ipcRenderer.send("launch-app-with-placement", {
                    name: item.name,
                    placement: item.placement
                });
            } else {
                child_process.execFile("open", ["-a", item.name], () => {});
                setTimeout(() => {
                    restoreWindowState(item);
                }, 120);
            }
        }
    });

    electron.ipcRenderer.on("update-ui", (event, dock_items) => {
        $("#container").html("");
        DOCK_ITEMS = [];
        var k = 1;
        var visible_items = (dock_items || []).filter(item =>
            item &&
            item.name &&
            item.name !== "Trash" &&
            item.name !== "Downloads" &&
            item.pos &&
            Number.isFinite(item.pos.x)
        ).sort((a, b) => a.pos.x - b.pos.x);
        var base_x = visible_items.length > 0 ? visible_items[0].pos.x : 0;
        for (var i = 0; i < visible_items.length; i++) {
            // Reuse configured key mapping when available; otherwise assign fallback keys.
            var dockName = normalizeAppName(visible_items[i].name);
            var item = CONFIG.dock_items.find(item => normalizeAppName(item.name) == dockName);
            if (item == undefined) {
                item = {
                    name: visible_items[i].name,
                    key: k++,
                    screen: ""
                }
            }
            DOCK_ITEMS.push(item);
            var left = Math.max(0, Math.round(visible_items[i].pos.x - base_x));
            $("#container").append(util.format(ITEM_TPL, left, item.icon || item.key));
        }
    });

    electron.ipcRenderer.on("update-display", () => {});


});
