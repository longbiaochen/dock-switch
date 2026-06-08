// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DockSwitchNative",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "DockSwitchCore", targets: ["DockSwitchCore"]),
        .executable(name: "DockSwitch", targets: ["DockSwitch"]),
        .executable(name: "DockSwitchGokit5Serial", targets: ["DockSwitchGokit5Serial"])
    ],
    targets: [
        .target(name: "DockSwitchCore"),
        .executableTarget(
            name: "DockSwitch",
            dependencies: ["DockSwitchCore"],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "AppInfo.plist"
                ])
            ]
        ),
        .executableTarget(name: "DockSwitchGokit5Serial"),
        .testTarget(
            name: "DockSwitchCoreTests",
            dependencies: ["DockSwitchCore"]
        )
    ]
)
