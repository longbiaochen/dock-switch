import AppKit
import Carbon
import DockSwitchCore
import QuartzCore
import SwiftUI

@main
final class DockSwitchApp: NSObject, NSApplicationDelegate {
    private static var sharedDelegate: DockSwitchApp?
    private let configStore = ConfigStore()
    private let displayService = DisplayService()
    private let dockSnapshotService = DockSnapshotService()
    private let dockVisibilityService = DockVisibilityService()
    private let overlayLayoutService = OverlayLayoutService()
    private let windowPlacementService = WindowPlacementService()
    private let codexDisplaySelectionService = CodexDisplaySelectionService()
    private lazy var launcherService = LauncherService(windowPlacement: windowPlacementService)
    private var controlServer: ControlServer?
    private var gokit5SerialListener: Gokit5SerialListener?
    private var statusItem: NSStatusItem?
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandler: EventHandlerRef?
    private var overlayPanel: OverlayPanel?
    private var keyMonitor: Any?
    private var currentTargets: [OverlayTarget] = []
    private var previousWindowOwnerPID: pid_t?
    private var lastModifierShortcut: (key: String, time: Date)?

    static func main() {
        let app = NSApplication.shared
        let delegate = DockSwitchApp()
        sharedDelegate = delegate
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.finishLaunching()
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        ProcessInfo.processInfo.disableAutomaticTermination("dock-switch runs a global launcher hotkey and control socket")
        NSApp.setActivationPolicy(.accessory)
        setupStatusItem()
        registerHotKey()
        startControlServer()
        startGokit5SerialListener()
        _ = ensureAccessibilityPermission(prompt: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        hideLauncher()
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let eventHandler { RemoveEventHandler(eventHandler) }
        gokit5SerialListener?.stop()
        controlServer?.stop()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let iconURL = Bundle.main.url(forResource: "icon", withExtension: "icns"),
           let image = NSImage(contentsOf: iconURL) {
            image.size = NSSize(width: 18, height: 18)
            image.isTemplate = false
            statusItem?.button?.image = image
            statusItem?.button?.imagePosition = .imageOnly
        } else {
            statusItem?.button?.title = "DS"
        }
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Launcher", action: #selector(showLauncherMenu), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        statusItem?.menu = menu
    }

    @objc private func showLauncherMenu() {
        _ = showLauncher()
    }

    @objc private func openSettings() {
        let candidates = [
            Bundle.main.resourceURL?.appendingPathComponent("DockSwitchSettings.app"),
            Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("Resources/DockSwitchSettings.app"),
            URL(fileURLWithPath: "/Applications/dock-switch.app/Contents/Resources/DockSwitchSettings.app")
        ].compactMap { $0 }
        if let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) {
            NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { _, error in
                if let error { NSLog("dock-switch: failed to open settings: \(error.localizedDescription)") }
            }
        }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private func startControlServer() {
        controlServer = ControlServer(
            displayService: displayService,
            windowPlacement: windowPlacementService,
            showLauncher: { [weak self] in
                guard let self else { return false }
                return self.runOnMain { self.showLauncher() }
            },
            hideLauncher: { [weak self] in
                guard let self else { return false }
                return self.runOnMain {
                    self.hideLauncher()
                    return true
                }
            },
            getGokit5Status: { [weak self] in
                guard let self, let listener = self.gokit5SerialListener else {
                    return ["enabled": false, "status": "disabled", "running": false, "portPath": ""]
                }
                return listener.snapshot().json()
            },
            selectCodexDisplay: { [weak self] command in
                guard let self else { return ["ok": false, "error": "dock-switch runtime is not ready"] }
                let target = command["target"] as? String ?? ""
                let appName = command["appName"] as? String ?? "Codex"
                let source = command["source"] as? String ?? ""
                return self.runOnMain {
                    self.codexDisplaySelectionService.select(target: target, appName: appName, source: source)
                }
            }
        )
        controlServer?.start()
    }

    private func startGokit5SerialListener() {
        if ProcessInfo.processInfo.environment["DOCK_SWITCH_GOKIT5"] == "0" {
            return
        }
        let listener = Gokit5SerialListener { [weak self] target, button, _ in
            guard let self, !target.isEmpty else { return }
            DispatchQueue.main.async {
                _ = self.codexDisplaySelectionService.select(
                    target: target,
                    appName: "Codex",
                    source: "gokit5:\(button)"
                )
            }
        }
        gokit5SerialListener = listener
        listener.start()
    }

    private func runOnMain<T>(_ work: @escaping () -> T) -> T {
        if Thread.isMainThread { return work() }
        let semaphore = DispatchSemaphore(value: 0)
        var result: T?
        DispatchQueue.main.async {
            result = work()
            semaphore.signal()
        }
        semaphore.wait()
        return result!
    }

    private func ensureAccessibilityPermission(prompt: Bool) -> Bool {
        if AXIsProcessTrusted() { return true }
        if prompt {
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            AXIsProcessTrustedWithOptions(options)
        }
        return false
    }

    private func registerHotKey() {
        let hotKeyID = EventHotKeyID(signature: fourCharCode("DS20"), id: 1)
        RegisterEventHotKey(UInt32(kVK_F20), 0, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let callback: EventHandlerUPP = { _, event, userData in
            guard let userData else { return noErr }
            let app = Unmanaged<DockSwitchApp>.fromOpaque(userData).takeUnretainedValue()
            var hotKeyID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
            if hotKeyID.id == 1 {
                DispatchQueue.main.async {
                    app.toggleLauncher()
                }
            }
            return noErr
        }
        InstallEventHandler(GetApplicationEventTarget(), callback, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), &eventHandler)
    }

    private func toggleLauncher() {
        if overlayPanel?.isVisible == true {
            hideLauncher()
        } else {
            _ = showLauncher()
        }
    }

    @discardableResult
    private func showLauncher() -> Bool {
        guard ensureAccessibilityPermission(prompt: true) else {
            NSLog("dock-switch: Accessibility permission is required to show launcher")
            return false
        }
        previousWindowOwnerPID = currentFrontmostPID()
        dockVisibilityService.showDock()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
            self?.showLauncherAfterDockSettles()
        }
        return true
    }

    private func showLauncherAfterDockSettles() {
        let items = (try? dockSnapshotService.queryDockItems()) ?? []
        guard !items.isEmpty else {
            NSLog("dock-switch: no Dock items available for launcher")
            return
        }
        dockSnapshotService.writeCache(items)
        let config = configStore.load()
        let launcherItems = LauncherRules.buildLauncherItems(dockItems: items, config: config)
        guard let layout = overlayLayoutService.resolve(
            launcherItems: launcherItems,
            displays: displayService.displays()
        ) else {
            NSLog("dock-switch: failed to resolve launcher overlay layout")
            return
        }
        currentTargets = layout.targets
        showOverlay(layout)
    }

    private func showOverlay(_ layout: OverlayLayout) {
        let frame = appKitFrame(fromAX: layout.windowFrameAX)
        let panel = overlayPanel ?? OverlayPanel()
        overlayPanel = panel
        let view = LauncherOverlayView(
            targets: layout.targets,
            onSelect: { [weak self] item in
                self?.activate(item)
            }
        )
        panel.contentView = NSHostingView(rootView: view)
        let startFrame = NSRect(x: frame.minX, y: frame.minY, width: frame.width, height: min(6, frame.height))
        panel.alphaValue = 0
        panel.setFrame(startFrame, display: true)
        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKey()
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.16
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().setFrame(frame, display: true)
            panel.animator().alphaValue = 1
        }
        startKeyMonitor()
    }

    private func hideLauncher() {
        overlayPanel?.orderOut(nil)
        stopKeyMonitor()
        currentTargets = []
        dockVisibilityService.restoreDock()
    }

    private func activate(_ item: LauncherItem) {
        hideLauncher()
        launcherService.activate(item)
    }

    private func startKeyMonitor() {
        stopKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged]) { [weak self] event in
            guard let self else { return event }
            if event.type == .flagsChanged {
                return self.handleFlagsChanged(event)
            }
            if event.keyCode == UInt16(kVK_Escape) {
                self.hideLauncher()
                return nil
            }
            if let action = self.windowAction(for: event) {
                self.runWindowAction(action)
                return nil
            }
            if self.handleAppShortcut(for: event) {
                return nil
            }
            if let item = self.item(for: event) {
                self.activate(item)
                return nil
            }
            return event
        }
    }

    private func stopKeyMonitor() {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
    }

    private func item(for event: NSEvent) -> LauncherItem? {
        let text = (event.charactersIgnoringModifiers ?? event.characters ?? "").uppercased()
        return currentTargets.first { target in
            target.item.key.uppercased() == text || target.item.displayKey.uppercased() == text
        }?.item
    }

    private func handleFlagsChanged(_ event: NSEvent) -> NSEvent? {
        if event.keyCode == UInt16(kVK_Shift), event.modifierFlags.contains(.shift) {
            activateShortcut("SHIFT")
            return nil
        }
        if event.keyCode == UInt16(kVK_Command), event.modifierFlags.contains(.command) {
            activateShortcut("COMMAND_LEFT")
            return nil
        }
        if event.keyCode == UInt16(kVK_RightCommand), event.modifierFlags.contains(.command) {
            activateShortcut("COMMAND_RIGHT")
            return nil
        }
        return event
    }

    private func handleAppShortcut(for event: NSEvent) -> Bool {
        let normalized: String
        if event.keyCode == UInt16(kVK_Tab) {
            normalized = "TAB"
        } else {
            normalized = LauncherRules.normalizeKey(event.charactersIgnoringModifiers ?? event.characters ?? "")
        }
        guard LauncherShortcutRules.isReserved(normalized) else { return false }
        activateShortcut(normalized)
        return true
    }

    private func activateShortcut(_ normalizedKey: String) {
        if let lastModifierShortcut,
           lastModifierShortcut.key == normalizedKey,
           Date().timeIntervalSince(lastModifierShortcut.time) < 0.25 {
            return
        }
        lastModifierShortcut = (normalizedKey, Date())
        hideLauncher()
        guard let appName = LauncherShortcutRules.appName(for: normalizedKey) else {
            return
        }
        let item = LauncherItem(
            name: appName,
            key: normalizedKey,
            icon: nil,
            kind: nil,
            placement: nil,
            openPath: nil,
            appURL: nil,
            dockItem: DockItemSnapshot(name: appName, pos: .zero, size: .zero)
        )
        launcherService.activate(item)
    }

    private func windowAction(for event: NSEvent) -> String? {
        switch Int(event.keyCode) {
        case kVK_UpArrow:
            return "up"
        case kVK_DownArrow:
            return "down"
        case kVK_LeftArrow:
            return "left"
        case kVK_RightArrow:
            return "right"
        case kVK_ANSI_LeftBracket:
            return "current_left"
        case kVK_ANSI_RightBracket:
            return "current_right"
        case kVK_ANSI_Backslash:
            return "fill"
        default:
            let text = event.charactersIgnoringModifiers ?? event.characters ?? ""
            return LauncherShortcutRules.windowAction(key: text)
        }
    }

    private func runWindowAction(_ action: String) {
        let preferredPID = previousWindowOwnerPID
        hideLauncher()
        NSApp.hide(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) { [weak self] in
            guard let self else { return }
            if !self.windowPlacementService.placeWindowByAction(action, preferredPID: preferredPID) {
                _ = self.windowPlacementService.placeWindowByAction(action)
            }
        }
    }

    private func currentFrontmostPID() -> pid_t? {
        guard let app = NSWorkspace.shared.frontmostApplication,
              LauncherRules.normalizeAppName(app.localizedName ?? "") != "dock-switch" else {
            return previousWindowOwnerPID
        }
        return app.processIdentifier
    }

    private func appKitFrame(fromAX rect: DSRect) -> NSRect {
        let displays = displayService.displays()
        let targetDisplay = DisplayGeometry.display(containing: rect, displays: displays)
        if let targetDisplay,
           let screen = NSScreen.screens.first(where: { screen in
               let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
               return id == targetDisplay.id
           }) {
            let converted = DisplayGeometry.appKitFrame(
                fromAX: rect,
                inDisplay: targetDisplay.bounds,
                appKitDisplayFrame: DSRect(
                    x: Double(screen.frame.origin.x),
                    y: Double(screen.frame.origin.y),
                    width: Double(screen.frame.width),
                    height: Double(screen.frame.height)
                )
            )
            return NSRect(x: converted.x, y: converted.y, width: converted.width, height: converted.height)
        }
        let mainHeight = NSScreen.main?.frame.height ?? 0
        return NSRect(x: rect.x, y: Double(mainHeight) - rect.y - rect.height, width: rect.width, height: rect.height)
    }
}

final class OverlayPanel: NSPanel {
    init() {
        super.init(
            contentRect: .zero,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

struct LauncherOverlayView: View {
    let targets: [OverlayTarget]
    let onSelect: (LauncherItem) -> Void
    @State private var focusedItem: LauncherItem?

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(.white.opacity(0.24), lineWidth: 1)
                }
            ForEach(targets) { target in
                Text(target.item.displayKey)
                    .font(.system(size: target.item.displayKey.count > 1 ? 18 : 21, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(width: target.frame.width, height: target.frame.height)
                    .background(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(Color(red: 0.03, green: 0.48, blue: 0.62).opacity(0.96))
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(.white.opacity(0.38), lineWidth: 1)
                    }
                    .shadow(color: .black.opacity(0.28), radius: 8, y: 4)
                    .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .onTapGesture {
                        onSelect(target.item)
                    }
                .position(x: target.frame.x + target.frame.width / 2, y: target.frame.y + target.frame.height / 2)
                .onHover { hovering in
                    focusedItem = hovering ? target.item : focusedItem
                }
                .accessibilityLabel(Text(target.item.name))
                .accessibilityAddTraits(.isButton)
            }
            if let item = focusedItem {
                HStack(spacing: 7) {
                    Text(item.displayKey)
                        .font(.system(size: 13, weight: .black, design: .rounded))
                        .padding(.horizontal, 9)
                        .frame(height: 24)
                        .background(Capsule().fill(Color(red: 0.03, green: 0.48, blue: 0.62)))
                    Text(item.name)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .frame(height: 24)
                        .background(Capsule().fill(.black.opacity(0.42)))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.top, -30)
            }
        }
        .padding(0)
    }
}

private func fourCharCode(_ string: String) -> OSType {
    var result: OSType = 0
    for scalar in string.unicodeScalars.prefix(4) {
        result = (result << 8) + OSType(scalar.value)
    }
    return result
}
