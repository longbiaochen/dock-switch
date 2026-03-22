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
- ``placement`` (optional): explicit placement policy (for example ``external_right_half``)

Notes
-----

- App names are matched exactly against Dock item names.
- Key matching in the renderer is case-insensitive (`event.key.toUpperCase()`).
- `ArrowLeft` / `ArrowRight` tile the current display left/right half.
- `ArrowUp` moves the frontmost window to the external display work area.
- `ArrowDown` moves the frontmost window to the internal display work area, and maximizes it there when it is already on the internal display.
- `\` tiles to full size on the current display work area.
- Screen direction codes used by keyboard movement are: `0=external`, `1=internal`, `2=full`, `3=left`, `4=right`.
- If ``placement`` is set, placement behavior takes precedence over remembered bounds.
