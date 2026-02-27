var electron = require("electron");
var util = require("util");
var $ = require("jquery");
var bootstrap = require("bootstrap");
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");

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

function getUserDataPath() {
    try {
        return electron.ipcRenderer.sendSync("get-user-data-path");
    } catch (e) {
        return path.join(process.env.HOME || "~", "Library", "Application Support", "dock-switch");
    }
}

var WINDOW_STATE_PATH = path.join(getUserDataPath(), "window-state.json");
var WINDOW_STATE_CACHE = loadWindowStateCache();

function normalizeAppName(name) {
    return (name || "")
        .trim()
        .replace(/\.app$/i, "")
        .toLowerCase();
}

function loadWindowStateCache() {
    try {
        if (!fs.existsSync(WINDOW_STATE_PATH)) {
            return {};
        }
        var raw = fs.readFileSync(WINDOW_STATE_PATH, "utf8");
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (e) {
        console.error("Failed to read window state cache:", e.message);
        return {};
    }
}

function saveWindowStateCache() {
    try {
        fs.mkdirSync(path.dirname(WINDOW_STATE_PATH), { recursive: true });
        fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(WINDOW_STATE_CACHE, null, 2));
    } catch (e) {
        console.error("Failed to persist window state cache:", e.message);
    }
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
    saveWindowStateCache();
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
        setSavedWindowState(app, { x: x, y: y, w: w, h: h });
    }
}

function saveFrontmostWindowState() {
    var script =
        `tell application \"System Events\"\n` +
        `  set frontApps to (application processes where frontmost is true)\n` +
        `  if (count of frontApps) = 0 then return \"\"\n` +
        `  set frontProc to item 1 of frontApps\n` +
        `  set frontName to name of frontProc\n` +
        `  tell frontProc\n` +
        `    if (count of windows) = 0 then return \"\"\n` +
        `    set winPos to position of window 1\n` +
        `    set winSize to size of window 1\n` +
        `    return frontName & \"|\" & (item 1 of winPos as text) & \"|\" & (item 2 of winPos as text) & \"|\" & (item 1 of winSize as text) & \"|\" & (item 2 of winSize as text)\n` +
        `  end tell\n` +
        `end tell`;

    try {
        var output = child_process
            .execSync(`osascript -e \"${shellEscapeAppleScript(script)}\"`)
            .toString()
            .trim();

        if (!output) return;

        var parts = output.split("|");
        if (parts.length !== 5) return;

        var appName = parts[0].trim();
        var x = Number(parts[1]);
        var y = Number(parts[2]);
        var w = Number(parts[3]);
        var h = Number(parts[4]);

        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
            return;
        }

        setSavedWindowState(appName, { x: x, y: y, w: w, h: h });
    } catch (e) {
        // Ignore transient accessibility/automation errors.
    }
}

function restoreWindowState(item) {
    if (!item || item.remember_window_state === false) return;

    var app = item.name || "";
    var state = getSavedWindowState(app);
    if (!state) return;

    var script =
        `tell application \"System Events\"\n` +
        `  repeat 12 times\n` +
        `    if exists (application process \"${shellEscapeAppleScript(app)}\") then\n` +
        `      tell application process \"${shellEscapeAppleScript(app)}\"\n` +
        `        if (count of windows) > 0 then\n` +
        `          set position of window 1 to {${state.x}, ${state.y}}\n` +
        `          set size of window 1 to {${state.w}, ${state.h}}\n` +
        `          return \"ok\"\n` +
        `        end if\n` +
        `      end tell\n` +
        `    end if\n` +
        `    delay 0.1\n` +
        `  end repeat\n` +
        `end tell\n` +
        `return \"\"`;

    try {
        child_process.execSync(`osascript -e \"${shellEscapeAppleScript(script)}\"`);
    } catch (e) {
        // Ignore apps/windows that don't expose AX position/size.
    }
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
            if (item != undefined) {
                item.screen = KEY_MAP[e.key];
                child_process.execSync(util.format(MOUSE_TPL, item.screen));
            }
        } else {
            // App-key path: open/focus app, then place focus/mouse on mapped display.
            var key = e.key.toUpperCase();
            var item = DOCK_ITEMS.find(item => item.key == key);
            if (item == undefined) {
                return;
            }

            saveFrontmostWindowState();
            // new Notification(item.name, { body: key });
            child_process.execSync(util.format(APP_TPL, item.name));
            // var screen_id = (DISPLAY_ITEMS.length == 1) ? 0 : item.screen;
            child_process.execSync(util.format(SCREEN_TPL, item.screen));
            child_process.execSync(util.format(MOUSE_TPL, item.screen));

            if (item.placement) {
                applyWindowPlacement(item);
            } else {
                restoreWindowState(item);
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

    electron.ipcRenderer.on("update-display", (event, display_items) => {
        // Display metadata is kept for future UI logic and parity with main-process updates.
        DISPLAY_ITEMS = display_items;
    });


});
