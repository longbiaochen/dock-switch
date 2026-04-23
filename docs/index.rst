dock-switch Documentation
=========================

``dock-switch`` is a macOS Electron utility for quickly switching Dock
applications and controlling display focus with a global hotkey.

Usage
-----

1. Trigger dock-switch (default ``F20``).
2. Press the app key shown in the HUD.

Reference
=========

.. toctree::
   :maxdepth: 2

   overview
   development
   configuration

Browser fixed placement
-----------------------

You can set browser windows to always land on a specific display region when launched from dock-switch:

.. code-block:: json

   {
     "name": "Safari",
     "key": "S",
     "screen": "3",
     "placement": "external_left_half"
   }

.. code-block:: json

   {
     "name": "Google Chrome",
     "key": "B",
     "screen": "4",
     "placement": "external_right_half"
   }

.. code-block:: json

   {
     "name": "GitHub",
     "key": "G",
     "screen": "3",
     "kind": "web_app",
     "placement": "internal_fill",
     "open_path": "~/Applications/Chrome Apps.localized/GitHub.app",
     "app_url": "https://github.com/"
   }

Current placement support:

- ``external_left_half``
- ``external_right_half``
- ``external_fill``
- ``internal_fill``
- ``side_fill`` / ``side_left_fill`` (full left side-display work area, with external-display fallback)
- ``side_right_fill`` (full right side-display work area, with external-display fallback)
- item kind supported by built-in placement default: ``web_app``

Notes
-----

- ``internal_fill`` maximizes to the internal display work area.
- ``external_fill`` maximizes to the external display work area.
- ``side_fill`` is a compatibility alias for ``side_left_fill``.
- ``side_left_fill`` and ``side_right_fill`` maximize to the left and right side-display work areas when those displays are available, and fall back to the external display work area otherwise.
- If no external display is detected, ``external_left_half`` falls back to the left half of the internal display work area.
- If no external display is detected, ``external_right_half`` falls back to the right half of the internal display work area.
- In the current default config, ``S`` targets Safari on the left half and ``B`` targets Google Chrome on the right half.
- In the current launcher behavior, ``Tab``/``Shift``/left ``Command``/right ``Command`` focus or create ``Codex`` windows on external/internal/left-side/right-side displays, move the mouse to the target display center, and ask Codex to focus its composer with ``Escape`` instead of clicking the input box.
- ``Codex`` is intentionally hidden from the ordinary HUD item list; its symbolic keys do not fall through to generic app launch or placement.
- ``ChatGPT`` is intentionally hidden from the launcher HUD and receives no dock-switch hotkey or fallback numeric key.
- Numeric keys remain available for ordinary launcher selection and fallback numbering.
- In the current default config, both ``G`` and ``X`` are mapped to web apps that use ``internal_fill`` on the internal display.
- You can map any convenient key to ``F20`` with Karabiner-Elements.
- For Playwright-managed Chrome, use the CLI Chrome profile commands instead of generic app-name placement.
