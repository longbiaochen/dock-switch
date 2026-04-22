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
- Key matching in the renderer is case-insensitive, with symbolic support for launcher keys such as ``Tab``, ``Shift``, left ``Command``, right ``Command``, and ``Space``.
- In the current default config, ``S`` is mapped to Safari on ``external_left_half`` and ``B`` is mapped to Google Chrome on ``external_right_half``.
- In the current default config, both ``X`` and ``G`` are mapped to web apps that use ``internal_fill``.
- In the current launcher behavior, ``Tab`` focuses or creates ``Codex`` on the external display, ``Shift`` focuses or creates ``Codex`` on the internal display, and left ``Command`` focuses or creates ``Codex`` on the current left side display; each action also moves the mouse to the target display center and asks Codex to focus its composer with ``Escape`` instead of clicking the input box.
- ``Codex`` is intentionally excluded from the ordinary launcher HUD, so these symbolic keys cannot fall through to a stale generic app-placement entry.
- ``ChatGPT`` is intentionally excluded from the launcher HUD and does not receive a fallback numeric key.
- `ArrowLeft` / `ArrowRight` tile the current display left/right half.
- `ArrowUp` moves the frontmost window to the external display work area.
- `ArrowDown` moves the frontmost window to the internal display work area, and maximizes it there when it is already on the internal display.
- `1` / `2` / `3` are available again for ordinary launcher item selection when those keys are assigned or used as fallback numbers.
- When the target display already has a ``Codex`` window, dock-switch reuses the most relevant existing window there in the order ``focused > main > first usable``.
- When the target display has no ``Codex`` window, dock-switch triggers ``Codex > File > New Window`` and then fills the target display work area only if it can identify the newly created window; it does not move an old window from another display as a substitute.
- `\` tiles to full size on the current display work area.
- Screen direction codes used by keyboard movement are: `0=external`, `1=internal`, `2=full`, `3=left`, `4=right`.
- If ``placement`` is set, placement behavior takes precedence over remembered bounds.
- If ``kind`` is ``web_app`` and ``placement`` is not set, dock-switch places the app at ``external_right_half``.
- If ``open_path`` is set, dock-switch launches that exact app bundle.
- If ``app_url`` is set, dock-switch can place a Chrome app window by pid even when Accessibility exposes it as ``Google Chrome``.
- ``external_fill`` maximizes to the external display work area.
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
