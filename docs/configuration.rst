Configuration
=============

Config File
-----------

The app reads mapping data from:

- ``src/config.json``

Structure
---------

The top-level key is ``dock_items``, each containing:

- ``name``: app name expected from Dock metadata
- ``key``: keyboard key used to trigger app focus/launch
- ``screen``: legacy field retained for backward compatibility (not used by the current node-only runtime path)
- ``remember_window_state`` (optional): defaults to ``true``; when enabled, dock-switch restores last known window bounds for that app (in-memory for current app session)
- ``placement`` (optional): explicit placement policy (for example ``external_right_half`` or ``internal_fill``)
- ``kind`` (optional): built-in launch behavior tag. ``web_app`` defaults to ``external_right_half`` unless ``placement`` overrides it.
- ``open_path`` (optional): exact app bundle path to open instead of resolving by app name
- ``app_url`` (optional): exact Chrome ``--app=...`` URL used to identify a web app window by pid after launch

Notes
-----

- App names are matched exactly against Dock item names.
- Key matching in the renderer is case-insensitive (`event.key.toUpperCase()`).
- In the current default config, ``Tab`` is mapped to ``ChatGPT`` inside the launcher.
- `ArrowLeft` / `ArrowRight` tile the current display left/right half.
- `ArrowUp` moves the frontmost window to the external display work area.
- `ArrowDown` moves the frontmost window to the internal display work area, and maximizes it there when it is already on the internal display.
- `\` tiles to full size on the current display work area.
- Screen direction codes used by keyboard movement are: `0=external`, `1=internal`, `2=full`, `3=left`, `4=right`.
- If ``placement`` is set, placement behavior takes precedence over remembered bounds.
- If ``kind`` is ``web_app`` and ``placement`` is not set, dock-switch places the app at ``external_right_half``.
- If ``open_path`` is set, dock-switch launches that exact app bundle.
- If ``app_url`` is set, dock-switch can place a Chrome app window by pid even when Accessibility exposes it as ``Google Chrome``.
- If no external display is available, ``external_left_half`` falls back to the left half of the internal display work area.
- If no external display is available, ``external_right_half`` falls back to the right half of the internal display work area.

CLI
---

``dock-switch-cli`` is the canonical command-line interface for Codex and other automation.

Examples:

- ``dock-switch-cli displays``
- ``dock-switch-cli place --app "Terminal" --placement external_right_half``
- ``dock-switch-cli place --pid 12345 --placement external_right_half``
- ``dock-switch-cli move --app "Terminal" --x 0 --y 25 --w 1512 --h 875``
- ``dock-switch-cli move --pid 12345 --x 0 --y 25 --w 1512 --h 875``
- ``dock-switch-cli get-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX``
- ``dock-switch-cli move-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX --x 713 --y -1410 --w 1280 --h 1410``

Use ``--pid`` when you need to target one managed window from a multi-window app such as Google Chrome.
Use the Chrome profile commands for Playwright-managed Google Chrome windows, because the reported Playwright session pid is not the native Chrome window owner.
If the dock-switch control socket is unavailable, the CLI launches ``/Applications/dock-switch.app`` and retries automatically.
