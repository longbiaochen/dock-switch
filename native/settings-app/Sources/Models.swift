import Foundation

enum RowStatus: String {
    case configured
    case fallback
    case reserved

    var label: String {
        switch self {
        case .configured: return "已配置"
        case .fallback: return "自动分配"
        case .reserved: return "系统保留"
        }
    }
}

struct SettingsRow: Identifiable, Equatable {
    let id: String
    var name: String
    var key: String
    var displayKey: String
    var screen: String
    var position: String
    var placement: String
    var status: RowStatus
    var readonly: Bool
    var configured: Bool
    var fallback: Bool
}

struct ScreenOption: Identifiable, Equatable {
    let id: String
    let label: String
    let target: String
}

struct PositionOption: Identifiable, Equatable {
    let id: String
    let label: String
}

let screenOptions: [ScreenOption] = [
    ScreenOption(id: "", label: "不指定", target: ""),
    ScreenOption(id: "1", label: "内部屏幕", target: "internal"),
    ScreenOption(id: "0", label: "外接屏幕", target: "external"),
    ScreenOption(id: "side_left", label: "左侧屏幕", target: "side_left"),
    ScreenOption(id: "side_right", label: "右侧屏幕", target: "side_right")
]

let positionOptions: [PositionOption] = [
    PositionOption(id: "", label: "不指定"),
    PositionOption(id: "fill", label: "铺满"),
    PositionOption(id: "left_half", label: "左半屏"),
    PositionOption(id: "right_half", label: "右半屏")
]

func normalizeAppName(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

func normalizeLauncherKey(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "" }
    let lower = trimmed.lowercased()
        .replacingOccurrences(of: "-", with: "_")
        .replacingOccurrences(of: " ", with: "_")
    if lower == "space" { return "SPACE" }
    if lower == "tab" { return "TAB" }
    if lower == "left_shift" || lower == "shift_left" { return "LEFT_SHIFT" }
    if lower == "right_shift" || lower == "shift_right" { return "RIGHT_SHIFT" }
    if trimmed == "⌘" { return "COMMAND_LEFT" }
    if trimmed == "L⇧" || trimmed == "⇧L" { return "LEFT_SHIFT" }
    if trimmed == "R⇧" || trimmed == "⇧R" { return "RIGHT_SHIFT" }
    if ["cmd", "command", "cmd_left", "left_cmd", "command_left", "left_command", "meta_left", "left_meta"].contains(lower) {
        return "COMMAND_LEFT"
    }
    if ["cmd_right", "right_cmd", "command_right", "right_command", "meta_right", "right_meta"].contains(lower) {
        return "COMMAND_RIGHT"
    }
    if lower.hasPrefix("f"), lower.dropFirst().allSatisfy({ $0.isNumber }) {
        return lower.uppercased()
    }
    if trimmed.count == 1 {
        return trimmed.uppercased()
    }
    return trimmed.uppercased()
}

func launcherKeyIcon(_ value: String) -> String? {
    switch normalizeLauncherKey(value) {
    case "TAB":
        return "⇥"
    case "LEFT_SHIFT":
        return "L⇧"
    case "RIGHT_SHIFT":
        return "R⇧"
    case "COMMAND", "COMMAND_LEFT", "COMMAND_RIGHT":
        return "⌘"
    default:
        return nil
    }
}

func displayLauncherKey(_ value: String) -> String {
    let normalized = normalizeLauncherKey(value)
    return launcherKeyIcon(normalized) ?? normalized
}

func defaultSettingsItem(for name: String) -> SettingsRow? {
    let normalized = normalizeAppName(name)
    let itemName: String
    let displayKey: String
    let placement: String
    switch normalized {
    case "chatgpt":
        itemName = "ChatGPT"
        displayKey = "F6"
        placement = "side_right_fill"
    case "codex":
        itemName = "Codex"
        displayKey = "L⇧"
        placement = "external_fill"
    case "smartshadow":
        itemName = "SmartShadow"
        displayKey = "F3"
        placement = "side_left_fill"
    case "claude":
        itemName = "Claude"
        displayKey = "R⇧"
        placement = "external_fill"
    default:
        return nil
    }
    let parsedPlacement = parsePlacement(placement)
    return SettingsRow(
        id: name,
        name: itemName,
        key: displayKey,
        displayKey: displayKey,
        screen: parsedPlacement.screen,
        position: parsedPlacement.position,
        placement: placement,
        status: .configured,
        readonly: false,
        configured: true,
        fallback: false
    )
}

func normalizeScreenValue(_ value: String) -> String {
    if value == "4" { return "side_right" }
    return value
}

func parsePlacement(_ placement: String) -> (screen: String, position: String) {
    let parts = placement.split(separator: "_").map(String.init)
    guard parts.count >= 2 else { return ("", "") }
    let position: String
    let screen: String
    if parts.last == "fill" {
        position = "fill"
        screen = parts.dropLast().joined(separator: "_")
    } else {
        position = parts.suffix(2).joined(separator: "_")
        screen = parts.dropLast(2).joined(separator: "_")
    }
    guard ["internal", "external", "side_left", "side_right"].contains(screen),
          ["fill", "left_half", "right_half"].contains(position) else {
        return ("", "")
    }
    let screenValue = screenOptions.first(where: { $0.target == screen })?.id ?? ""
    return (screenValue, position)
}

func placementFor(screen: String, position: String) -> String {
    guard !screen.isEmpty, !position.isEmpty else { return "" }
    guard let target = screenOptions.first(where: { $0.id == screen })?.target, !target.isEmpty else {
        return ""
    }
    return "\(target)_\(position)"
}
