# dock-switch
Quickly switch among applications in the macOS Dock with one global hotkey.

## Screenshot
![Dock switch UI](help/screenshot-1.jpg)

## How It Works
- Press `F20` to open the floating launcher UI.
- Press the shown key for an app to focus it.
- Press an arrow key to move/focus windows on another display.
- The UI closes automatically after a selection.

## Browser Fixed Placement (External Monitor Right Half)
This project supports per-app window placement through `src/config.json`.

Example:

```json
{
  "name": "Safari",
  "key": "S",
  "screen": "3",
  "placement": "external_right_half"
}
```

```json
{
  "name": "Chrome",
  "key": "G",
  "screen": "4",
  "placement": "external_right_half"
}
```

When triggered from dock-switch, supported browser windows are moved to the right half of the detected external display.

## Remember Last Window Size/Position
By default, dock-switch remembers the last known window bounds (x/y/width/height) for each app and restores them when that app is reopened from dock-switch.

- Window state cache location: Electron `userData` directory (`window-state.json`)
- This includes maximized-like window sizes because the actual bounds are restored.
- Apps with explicit `placement` (for example `external_right_half`) keep that placement behavior.

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

## Configuration
App key/display mapping is stored in `src/config.json` under `dock_items`.

## Permissions and First Run
- Map a key to `F20` (for example with [Karabiner-Elements](https://github.com/pqrs-org/Karabiner-Elements)).
- In macOS Privacy settings, allow accessibility/control permissions for `dock-switch.app` and related tooling.
- macOS may warn about an unidentified developer depending on how the app is built/signed.

## Project Notes
- `src/ui-helper` is a prebuilt helper binary from: https://github.com/longbiaochen/ui-helper
- Electron entry point: `src/main.js`
- Renderer/UI logic: `src/index.js`
