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
     "placement": "external_right_half"
   }

.. code-block:: json

   {
     "name": "Google Chrome",
     "key": "B",
     "screen": "4",
     "placement": "internal_fill"
   }

.. code-block:: json

   {
     "name": "GitHub",
     "key": "G",
     "screen": "3",
     "kind": "web_app",
     "placement": "external_left_half",
     "open_path": "~/Applications/Chrome Apps.localized/GitHub.app",
     "app_url": "https://github.com/repos?q=owner%3A%40me+sort%3Aupdated"
   }

Current placement support:

- ``external_left_half``
- ``external_right_half``
- ``internal_fill``
- item kind supported by built-in placement default: ``web_app``

Notes
-----

- ``internal_fill`` maximizes to the internal display work area.
- If no external display is detected, ``external_left_half`` falls back to the left half of the internal display work area.
- If no external display is detected, ``external_right_half`` falls back to the right half of the internal display work area.
- In the current default config, ``G`` is mapped to the ``GitHub`` web app on the left half, while ``X`` uses the built-in right-half default.
- You can map any convenient key to ``F20`` with Karabiner-Elements.
- For Playwright-managed Chrome, use the CLI Chrome profile commands instead of generic app-name placement.
