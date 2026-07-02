const electron = require("electron");
const $ = require("jquery");
const { displayLauncherKey, normalizeLauncherKey } = require("./launcher-key");

let rows = [];
let dirty = false;

const SCREEN_OPTIONS = Object.freeze([
    { value: "", label: "不指定", target: "" },
    { value: "1", label: "内部屏幕", target: "internal" },
    { value: "0", label: "外接屏幕", target: "external" },
    { value: "side_left", label: "左侧屏幕", target: "side_left" },
    { value: "side_right", label: "右侧屏幕", target: "side_right" }
]);

const POSITION_OPTIONS = Object.freeze([
    { value: "", label: "不指定" },
    { value: "fill", label: "铺满" },
    { value: "left_half", label: "左半屏" },
    { value: "right_half", label: "右半屏" }
]);

function statusLabel(status) {
    if (status === "reserved") return "系统保留";
    if (status === "fallback") return "自动分配";
    return "已配置";
}

function normalizeInputKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return displayLauncherKey(raw);
}

function keyFromKeyboardEvent(event) {
    if (event.key === "Backspace" || event.key === "Delete") return "";
    if (event.key === "Escape" || event.key === "Enter") return null;
    if (event.key === "Tab") return null;
    return displayLauncherKey(normalizeLauncherKey(event.key, event.code));
}

function screenTargetForValue(value) {
    const option = SCREEN_OPTIONS.find(item => item.value === String(value || ""));
    return option ? option.target : "";
}

function screenValueForTarget(target) {
    const option = SCREEN_OPTIONS.find(item => item.target === String(target || ""));
    return option ? option.value : "";
}

function normalizeScreenValue(value) {
    const screen = String(value || "");
    if (screen === "4") return "side_right";
    return screen;
}

function parsePlacement(placement) {
    const match = String(placement || "").match(/^(internal|external|side_left|side_right)_(fill|left_half|right_half)$/);
    if (!match) return { screen: "", position: "" };
    return {
        screen: screenValueForTarget(match[1]),
        position: match[2]
    };
}

function placementForScreenPosition(screen, position) {
    const target = screenTargetForValue(screen);
    const mode = String(position || "");
    if (!target || !mode) return "";
    return `${target}_${mode}`;
}

function currentPlacementForRow(row) {
    const placement = placementForScreenPosition(row.currentScreen, row.currentPosition);
    if (placement) return placement;
    if (!row.currentScreen && !row.currentPosition) {
        return String(row.currentPlacement || "");
    }
    return "";
}

function selectWithOptions(className, dataName, options, selectedValue) {
    const select = $("<select>")
        .addClass(`native-select ${className}`)
        .attr("data-name", dataName);
    for (const option of options) {
        select.append(
            $("<option>")
                .attr("value", option.value)
                .text(option.label)
        );
    }
    select.val(String(selectedValue || ""));
    return select;
}

function renderRows() {
    const query = String($("#searchInput").val() || "").trim().toLowerCase();
    const list = $("#settingsRows");
    list.html("");

    let visibleCount = 0;
    for (const row of rows) {
        if (query && !String(row.name).toLowerCase().includes(query)) continue;
        visibleCount += 1;

        const rowEl = $("<div>")
            .addClass("setting-row")
            .attr("role", "row")
            .attr("data-name", row.name);
        const appCell = $("<div>").addClass("setting-cell app-cell").attr("role", "cell");
        appCell.append($("<div>").addClass("app-name").text(row.name));
        if (row.fallback) {
            appCell.append($("<div>").addClass("app-subtext").text("不保存时继续使用自动数字键"));
        }

        const keyCell = $("<div>").addClass("setting-cell key-column").attr("role", "cell");
        if (row.readonly) {
            keyCell.append($("<span>").addClass("reserved-key").text(row.displayKey || row.key));
        } else {
            keyCell.append(
                $("<input>")
                    .addClass("key-input")
                    .attr("type", "text")
                    .attr("data-name", row.name)
                    .attr("autocomplete", "off")
                    .attr("spellcheck", "false")
                    .val(row.currentKey)
            );
        }

        const screenCell = $("<div>").addClass("setting-cell screen-column").attr("role", "cell");
        const positionCell = $("<div>").addClass("setting-cell position-column").attr("role", "cell");
        if (row.readonly) {
            screenCell.append($("<span>").addClass("settings-muted").text("保留"));
            positionCell.append($("<span>").addClass("settings-muted").text("保留"));
        } else {
            screenCell.append(selectWithOptions("screen-input", row.name, SCREEN_OPTIONS, row.currentScreen));
            positionCell.append(selectWithOptions("position-input", row.name, POSITION_OPTIONS, row.currentPosition));
        }

        const statusCell = $("<div>").addClass("setting-cell status-column").attr("role", "cell");
        statusCell.append(
            $("<span>")
                .addClass(`badge-status ${row.status}`)
                .text(statusLabel(row.status))
        );

        rowEl.append(appCell, keyCell, screenCell, positionCell, statusCell);
        list.append(rowEl);
    }

    $("#emptyState").toggle(visibleCount === 0);
    validateRows();
}

function collectUpdates() {
    return rows
        .filter(row => !row.readonly)
        .map(row => {
            let key = normalizeInputKey(row.currentKey);
            if (!row.configured && key === String(row.key || "")) {
                key = "";
            }
            return {
                name: row.name,
                key,
                screen: String(row.currentScreen || ""),
                placement: currentPlacementForRow(row)
            };
        });
}

function validateRows() {
    const byKey = new Map();
    const errors = [];

    $(".key-input").removeClass("is-invalid");
    for (const update of collectUpdates()) {
        if (!update.key) continue;
        if (
            ["TAB", "SHIFT", "COMMAND_RIGHT"].includes(update.key) ||
            (update.key === "COMMAND_LEFT" && String(update.name || "").trim().toLowerCase() !== "system settings")
        ) {
            errors.push(`${update.key} 是系统保留键`);
            $(`.key-input[data-name="${cssEscape(update.name)}"]`).addClass("is-invalid");
            continue;
        }
        if (!byKey.has(update.key)) byKey.set(update.key, []);
        byKey.get(update.key).push(update.name);
    }

    for (const [key, names] of byKey.entries()) {
        if (names.length <= 1) continue;
        errors.push(`${key} 被 ${names.join("、")} 重复使用`);
        for (const name of names) {
            $(`.key-input[data-name="${cssEscape(name)}"]`).addClass("is-invalid");
        }
    }

    if (errors.length > 0) {
        $("#statusText").removeClass("saved").addClass("error").text(errors[0]);
        $("#saveButton").prop("disabled", true);
    } else {
        $("#statusText")
            .removeClass("error saved")
            .text(dirty ? "有未保存修改" : `${rows.length} 个 Dock App`);
        $("#saveButton").prop("disabled", false);
    }
    return errors;
}

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
}

async function loadState() {
    $("#statusText").removeClass("error saved").text("读取中...");
    $("#saveButton").prop("disabled", true);
    const state = await electron.ipcRenderer.invoke("settings:get-state");
    if (!state || !state.ok) {
        $("#statusText").addClass("error").text("读取失败");
        return;
    }
    rows = (state.rows || []).map(row => Object.assign({}, row, {
        currentKey: String(row.key || ""),
        currentPlacement: String(row.placement || ""),
        currentScreen: normalizeScreenValue(row.screen || parsePlacement(row.placement).screen),
        currentPosition: String(parsePlacement(row.placement).position)
    }));
    dirty = false;
    renderRows();
}

async function saveState() {
    if (validateRows().length > 0) return;
    $("#statusText").removeClass("error saved").text("保存中...");
    $("#saveButton").prop("disabled", true);
    const result = await electron.ipcRenderer.invoke("settings:save-config", collectUpdates());
    if (!result || !result.ok) {
        const message = result && result.errors && result.errors[0]
            ? result.errors[0].message || "保存失败"
            : "保存失败";
        $("#statusText").removeClass("saved").addClass("error").text(message);
        $("#saveButton").prop("disabled", false);
        return;
    }

    rows = (result.rows || []).map(row => Object.assign({}, row, {
        currentKey: String(row.key || ""),
        currentPlacement: String(row.placement || ""),
        currentScreen: normalizeScreenValue(row.screen || parsePlacement(row.placement).screen),
        currentPosition: String(parsePlacement(row.placement).position)
    }));
    dirty = false;
    renderRows();
    $("#statusText").removeClass("error").addClass("saved").text("已保存，快捷键已刷新");
}

$(function() {
    $("#searchInput").on("input", renderRows);
    $("#refreshButton").on("click", loadState);
    $("#saveButton").on("click", saveState);
    $("#cancelButton").on("click", () => {
        window.close();
    });

    $(document).on("keydown", ".key-input", function(event) {
        const nextKey = keyFromKeyboardEvent(event);
        if (nextKey === null) return;
        event.preventDefault();
        const name = $(this).attr("data-name");
        const row = rows.find(item => item.name === name);
        if (!row) return;
        row.currentKey = nextKey;
        $(this).val(nextKey);
        dirty = true;
        validateRows();
    });

    $(document).on("input", ".key-input", function() {
        const name = $(this).attr("data-name");
        const row = rows.find(item => item.name === name);
        if (!row) return;
        row.currentKey = normalizeInputKey($(this).val());
        $(this).val(row.currentKey);
        dirty = true;
        validateRows();
    });

    $(document).on("change", ".screen-input", function() {
        const name = $(this).attr("data-name");
        const row = rows.find(item => item.name === name);
        if (!row) return;
        row.currentScreen = String($(this).val() || "");
        row.currentPlacement = "";
        if (!row.currentScreen) {
            row.currentPosition = "";
        } else if (!row.currentPosition) {
            row.currentPosition = "fill";
        }
        $(`.position-input[data-name="${cssEscape(name)}"]`).val(row.currentPosition);
        dirty = true;
        validateRows();
    });

    $(document).on("change", ".position-input", function() {
        const name = $(this).attr("data-name");
        const row = rows.find(item => item.name === name);
        if (!row) return;
        row.currentPosition = String($(this).val() || "");
        row.currentPlacement = "";
        if (row.currentPosition && !row.currentScreen) {
            row.currentScreen = "1";
            $(`.screen-input[data-name="${cssEscape(name)}"]`).val(row.currentScreen);
        }
        dirty = true;
        validateRows();
    });

    loadState();
});
