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
- ``screen``: display identifier used by ``ui-helper screen <id>``
- ``remember_window_state`` (optional): defaults to ``true``; when enabled, dock-switch restores last known window bounds for that app
- ``placement`` (optional): explicit placement policy (for example ``external_right_half``)

Notes
-----

- App names are matched exactly against Dock item names.
- Key matching in the renderer is case-insensitive (`event.key.toUpperCase()`).
- Arrow keys use an internal map for display switching (`ArrowUp/Down/Left/Right`).
- If ``placement`` is set, placement behavior takes precedence over remembered bounds.
