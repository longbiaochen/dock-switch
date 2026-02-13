# dock-switch
Quickly switching among applications in the Dock.

## How to Use
![A picture is worth a thousand words](https://github.com/longbiaochen/dock-switch/blob/master/help/screenshot-1.jpg)

### Shortcut flow
1. Trigger dock-switch (default global shortcut is `F20`; you can map another key to `F20` via Karabiner-Elements).
2. Press the app key shown in the HUD (for example `S` for Safari, `G` for Chrome).

### Browser fixed placement (external monitor right half)
This project now supports per-app window placement through `src/config.json`.

For Safari/Chrome, use:

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

When triggered from dock-switch, the app window will be resized/moved to:
- external display
- right half of that display

Notes:
- Supported now: `Safari`, `Chrome` / `Google Chrome`
- If no external display is detected, placement is skipped safely.

## Installation
- Download the latest release: <https://github.com/longbiaochen/dock-switch/releases>

## Build from source
1. `git clone ${this-repo}`
2. `cd dock-switch`
3. `npm run dist`

`/app/ui-helper` is a pre-built binary from this repo: <https://github.com/longbiaochen/ui-helper>

## Note
- You can use [Karabiner-Elements](https://github.com/tekezo/Karabiner-Elements) to map any key to `F20`
- For first-time use, go to `System Preferences -> Security & Privacy -> Privacy`, unlock and tick for `dock-switch.app`
- You may need to allow apps from `unidentified developer (i.e., me)` several times during installation, because I didn't pay [the Apple Tax](https://www.urbandictionary.com/define.php?term=Apple%20Tax).