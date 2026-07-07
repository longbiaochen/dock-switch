var electron = require("electron");
var $ = require("jquery");
const child_process = require("child_process");
const path = require("path");
const { normalizeLauncherKey } = require("./launcher-key");
const {
    buildLauncherItems,
    normalizeAppName
} = require("./launcher-items");
const {
    isReservedLauncherShortcut,
    resolveAppShortcut,
    resolveWindowPlacementShortcut
} = require("./launcher-shortcuts");
const {
    buildReadableOverlayTarget
} = require("./launcher-overlay-view");

var CONFIG = { dock_items: [] };
var OVERLAY_LAYOUT = null;
var ARROW_KEY_ACTIONS = Object.freeze({
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    "[": "current_left",
    "【": "current_left",
    "BracketLeft": "current_left",
    "]": "current_right",
    "】": "current_right",
    "BracketRight": "current_right"
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

function focusApplicationWindow(appName) {
    if (!appName || !dockQuery ||
        typeof dockQuery.getApplicationWindows !== "function" ||
        typeof dockQuery.focusApplicationWindowByPid !== "function") {
        return false;
    }

    try {
        var windows = dockQuery.getApplicationWindows({ name: String(appName) });
        if (!Array.isArray(windows) || windows.length === 0) return false;
        var win = windows.find(w => w && w.focused) ||
            windows.find(w => w && w.main) ||
            windows[0];
        if (!win ||
            !Number.isFinite(win.pid) ||
            !Number.isFinite(win.windowIndex)) {
            return false;
        }
        return !!dockQuery.focusApplicationWindowByPid({
            pid: Math.round(win.pid),
            windowIndex: Math.round(win.windowIndex)
        });
    } catch (e) {
        return false;
    }
}

function focusApplicationWindowSoon(appName) {
    var deadline = Date.now() + 1600;
    var tryFocus = () => {
        if (focusApplicationWindow(appName)) return;
        if (Date.now() < deadline) {
            setTimeout(tryFocus, 60);
        }
    };
    setTimeout(tryFocus, 60);
}

function getItemPlacement(item) {
    if (!item) return "";
    if (item.placement) return String(item.placement);
    if (item.kind === "web_app") return "internal_fill";
    return "";
}

function openAndRestoreItem(item) {
    if (!item || !item.name) return;
    saveFrontmostWindowState();
    child_process.execFile("open", ["-a", item.name], () => {});
    setTimeout(() => {
        restoreWindowState(item);
        focusApplicationWindowSoon(item.name);
        electron.ipcRenderer.send("move-mouse-to-app-window-center", item.name);
    }, 120);
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

function activateLauncherItem(item) {
    if (!item) return;

    var placement = getItemPlacement(item);
    if (placement) {
        saveFrontmostWindowState();
        electron.ipcRenderer.send("launch-app-with-placement", {
            name: item.name,
            placement: placement,
            open_path: item.open_path,
            app_url: item.app_url
        });
    } else {
        openAndRestoreItem(item);
    }
}

function hideLauncher() {
    electron.ipcRenderer.invoke('hide-window');
}

function overlayItemForDockItem(dockItem, index) {
    if (!OVERLAY_LAYOUT || !Array.isArray(OVERLAY_LAYOUT.items) || !dockItem) {
        return null;
    }

    var exact = OVERLAY_LAYOUT.items.find(entry => entry && entry.name === dockItem.name);
    if (exact) return exact;
    return OVERLAY_LAYOUT.items[index] || null;
}

function updateDockReader(target) {
    if (!target) return;
    $(".dock-reader-key").text(target.key);
    $(".dock-reader-name").text(target.item.name || target.label || "");
}

function renderLauncherItems(dockItems, config) {
    CONFIG = config && Array.isArray(config.dock_items) ? config : { dock_items: [] };
    $("#container").empty();
    DOCK_ITEMS = [];

    var launcherItems = buildLauncherItems(dockItems, CONFIG.dock_items);
    var background = $("<div>").addClass("dock-cover");
    $("#container").append(background);
    var reader = $("<div>").addClass("dock-reader");
    $("<span>").addClass("dock-reader-key").appendTo(reader);
    $("<span>").addClass("dock-reader-name").appendTo(reader);
    $("#container").append(reader);
    var firstTarget = null;

    for (var i = 0; i < launcherItems.length; i++) {
        var item = launcherItems[i].item;
        var overlayItem = overlayItemForDockItem(launcherItems[i].dockItem, i);
        DOCK_ITEMS.push(item);
        if (!overlayItem || !overlayItem.relativeRect) {
            continue;
        }

        var target = buildReadableOverlayTarget(item, overlayItem, OVERLAY_LAYOUT, {
            reservedTop: 34
        });
        if (!target) {
            continue;
        }
        if (!firstTarget) firstTarget = target;

        var button = $("<button>")
            .attr("type", "button")
            .attr("title", target.title)
            .attr("aria-label", target.title)
            .addClass("dock-target")
            .css({
                left: `${target.targetStyle.left}px`,
                top: `${target.targetStyle.top}px`,
                width: `${target.targetStyle.width}px`,
                height: `${target.targetStyle.height}px`
            })
            .on("mousedown", event => {
                event.preventDefault();
                event.stopPropagation();
            })
            .on("mouseenter focus", { target }, event => {
                updateDockReader(event.data.target);
            })
            .on("click", { item }, event => {
                event.preventDefault();
                event.stopPropagation();
                hideLauncher();
                activateLauncherItem(event.data.item);
            });

        $("<span>")
            .addClass("dock-target-key")
            .text(target.key)
            .appendTo(button);
        $("<span>")
            .addClass("dock-target-label")
            .text(target.label)
            .appendTo(button);
        $("<span>")
            .addClass("dock-target-icon-zone")
            .css({
                top: `${target.iconStyle.top}px`,
                height: `${target.iconStyle.height}px`
            })
            .appendTo(button);

        $("#container").append(button);
    }

    updateDockReader(firstTarget);
}

$(function() {
    $(document).on("keydown", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (getArrowAction(e.key, e.code) !== undefined) {
            handleArrowWindowControl(e.key, e.code);
        } else {
            var normalizedKey = normalizeLauncherKey(e.key, e.code);
            // Hide first so launcher feels instant after key selection.
            hideLauncher();
            var item = DOCK_ITEMS.find(item => item.key == normalizedKey);
            if (item != undefined) {
                activateLauncherItem(item);
                return;
            }
            var shortcutApp = resolveAppShortcut(normalizedKey);
            if (shortcutApp) {
                var dockShortcut = DOCK_ITEMS.find(entry =>
                    normalizeAppName(entry.name) === normalizeAppName(shortcutApp)
                );
                var configuredShortcut = (CONFIG.dock_items || []).find(entry =>
                    normalizeAppName(entry.name) === normalizeAppName(shortcutApp)
                );
                activateLauncherItem(dockShortcut || configuredShortcut || { name: shortcutApp });
                return;
            }
            if (isReservedLauncherShortcut(normalizedKey)) {
                return;
            }
            var windowPlacement = resolveWindowPlacementShortcut(normalizedKey);
            if (windowPlacement) {
                electron.ipcRenderer.send("place-focused-window", windowPlacement);
                return;
            }
            // App-key path: open/focus app, then restore configured placement/window state.
        }
    });

    electron.ipcRenderer.on("update-ui", (event, dock_items, config, overlayLayout) => {
        OVERLAY_LAYOUT = overlayLayout || null;
        renderLauncherItems(dock_items, config);
    });

    electron.ipcRenderer.on("update-display", () => {});

    electron.ipcRenderer.on("activate-app-shortcut", (event, appName) => {
        hideLauncher();
        var dockShortcut = DOCK_ITEMS.find(entry =>
            normalizeAppName(entry.name) === normalizeAppName(appName)
        );
        var configuredShortcut = (CONFIG.dock_items || []).find(entry =>
            normalizeAppName(entry.name) === normalizeAppName(appName)
        );
        activateLauncherItem(dockShortcut || configuredShortcut || { name: appName });
    });


});
