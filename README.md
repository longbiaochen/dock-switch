# dock-switch
Quickly switch among applications in the macOS Dock with one global hotkey.

## Screenshot
![Dock switch UI](help/screenshot-1.jpg)

## How It Works
- Press `F20` to open the floating launcher UI.
- Press the shown key for an app to focus it.
- Press an arrow key to fill the frontmost window on a physical display:
  - `←` left side display (`Mi Monitor (1)` on this Mac)
  - `→` right side display (`Mi Monitor (2)` on this Mac)
  - `↑` external display (`DELL U3219Q` on this Mac)
  - `↓` internal display (`Built-in Retina Display` on this Mac)
- Press `【` to tile the frontmost window to the left half of its current display.
- Press `】` to tile the frontmost window to the right half of its current display.
- Press `Shift` to focus or open `Codex`, then restore its remembered window bounds when available.
- Press `Tab` to focus or open `ChatGPT`, then restore its remembered window bounds when available.
- Press left `Command` to focus or open `System Settings`, then restore its remembered window bounds when available.
- Press right `Command` for a reserved no-op.
- Press `\` to enter macOS native fullscreen (same as the green window button).
- App activation and arrow display moves move the pointer to the center of the target display.
- A connected GoKit5 controller flashed with [open-embodied](https://github.com/longbiaochen/open-embodied) can select Codex display focus: minus = left side display, voice = external display, green = right side display, plus = internal display.
- The UI closes automatically after a selection.

## Browser Fixed Placement
This project supports per-app window placement through `src/config.json`.

Example:

```json
{
  "name": "Safari",
  "key": "S",
  "screen": "3",
  "placement": "external_left_half"
}
```

```json
{
  "name": "Google Chrome",
  "key": "B",
  "screen": "4",
  "placement": "external_right_half"
}
```

```json
{
  "name": "GitHub",
  "key": "G",
  "screen": "3",
  "kind": "web_app",
  "placement": "internal_fill",
  "open_path": "~/Applications/Chrome Apps.localized/GitHub.app",
  "app_url": "https://github.com/"
}
```

When triggered from dock-switch, Safari lands on the left half of the external display.
Web apps with `kind: "web_app"` use the same placement by default.
The `X` web app is maximized on the internal display work area.
The `GitHub` web app is maximized on the internal display work area.
Google Chrome lands on the right half of the external display.
The `X` and `GitHub` web app bundles can target the signed-in Google Chrome `Default` profile.
GitHub Web App is available on `G` in the current default config.
ChatGPT and Codex are intentionally excluded from the ordinary HUD app list; use `Tab` for ChatGPT and `Shift` for Codex.
Left `Command` opens System Settings. Right `Command` is intentionally reserved as a no-op.
If no external display is available, `external_right_half` falls back to the right half of the internal display work area.
If no external display is available, `external_left_half` falls back to the left half of the internal display work area.

## Remember Last Window Size/Position
By default, dock-switch remembers the last known window bounds (x/y/width/height) for each app and restores them when that app is reopened from dock-switch.

- Window state is kept in memory for the current app session (no disk persistence).
- This includes maximized-like window sizes because the actual bounds are restored.
- Apps with explicit `placement` (for example `external_right_half` or `internal_fill`) keep that placement behavior.
- Apps with `kind: "web_app"` default to `external_right_half` unless `placement` overrides it.
- `open_path` can pin a launcher item to an exact app bundle, which is useful for Chrome web app shims stored under `~/Applications/Chrome Apps.localized`.
- `app_url` lets dock-switch identify a Chrome `--app=...` window by pid when Accessibility sees only `Google Chrome`.

To disable restore for a specific app, add:

```json
{
  "name": "Terminal",
  "key": "T",
  "screen": "4",
  "remember_window_state": false
}
```

## Installation
- Download a release from [GitHub Releases](https://github.com/longbiaochen/dock-switch/releases).

## Build From Source
1. Clone this repository.
2. Install dependencies:
   - `yarn install`
3. Run locally:
   - `yarn go`
4. Build unsigned app bundle:
   - `yarn dist`
5. Build signed app bundle (requires signing identity):
   - `yarn dist:signed`

## CLI
`dock-switch-cli` is the canonical command-line entrypoint for window placement, display inspection, and Playwright-managed Chrome targeting.

Examples:

```bash
dock-switch-cli displays
dock-switch-cli gokit5-status
dock-switch-cli codex-display --target external
dock-switch-cli place --app "Terminal" --placement external_right_half
dock-switch-cli place --pid 12345 --placement external_right_half
dock-switch-cli move --app "Terminal" --x 0 --y 25 --w 1512 --h 875
dock-switch-cli move --pid 12345 --x 0 --y 25 --w 1512 --h 875
dock-switch-cli get-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX
dock-switch-cli move-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX --x 713 --y -1410 --w 1280 --h 1410
```

Notes:

- `--pid` is useful when you need to target one managed window from a multi-window app, but it is not sufficient for Playwright-managed Chrome.
- `get-chrome-window` and `move-chrome-window` target the exact Chrome window for a specific `--user-data-dir` profile through Chrome DevTools, which is the reliable path for Playwright-managed Chrome windows.
- If the dock-switch control socket is not running, the CLI launches `/Applications/dock-switch.app` and retries automatically.
- `displays` prints JSON with Electron display bounds and work areas.
- `gokit5-status` prints the runtime serial listener state and selected port.
- `codex-display` focuses an existing Codex window on the target display when available; otherwise it moves a reusable Codex window there, activates it, and centers the pointer on that display.
- The GoKit5 serial listener auto-detects the Espressif USB JTAG/serial device and can be pinned with `GOKIT5_SERIAL_PORT=/dev/cu.usbmodem...`; set `DOCK_SWITCH_GOKIT5=0` to disable it. The matching firmware lives at [longbiaochen/open-embodied](https://github.com/longbiaochen/open-embodied).

## Playwright Integration
Headed Playwright Chrome should be targeted by profile, not by generic app name and not by the Playwright session pid reported in CLI output.

Typical flow:

```bash
dock-switch-cli displays
dock-switch-cli get-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX
dock-switch-cli move-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX --x 713 --y -1410 --w 1280 --h 1410
```

This is the path used by the shared Codex Playwright wrapper.

## Configuration
App key/display mapping is stored in `src/config.json` under `dock_items`.

## Permissions and First Run
- Map a key to `F20` (for example with [Karabiner-Elements](https://github.com/pqrs-org/Karabiner-Elements)).
- A direct hotkey can call the CLI without opening the launcher. Example: `F3 -> dock-switch-cli place --app "Terminal" --placement external_right_half`.
- Keep the installed app in macOS `Open at Login` so the global shortcut and control socket are available after login.
- On first use, dock-switch prompts for required macOS permissions:
  - Accessibility (control UI elements / Dock metadata)
- If previously denied, re-enable in Privacy & Security:
  - Accessibility: `Privacy & Security > Accessibility`
- macOS may warn about an unidentified developer depending on how the app is built/signed.

## Project Notes
- Electron entry point: `src/main.js`
- Renderer/UI logic: `src/index.js`
- Dock metadata provider: native Node addon (`native/dock-query`)
- Canonical automation entrypoint: `bin/dock-switch-cli.js`
