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
     "key": "G",
     "screen": "4",
     "placement": "internal_fill"
   }

Current placement support:

- ``external_right_half``
- ``internal_fill``
- app names supported by built-in placement: ``Safari``, ``X``, ``Chrome`` / ``Google Chrome``

Notes
-----

- ``internal_fill`` maximizes to the internal display work area.
- If no external display is detected, ``external_right_half`` falls back to the internal display work area.
- You can map any convenient key to ``F20`` with Karabiner-Elements.
- For Playwright-managed Chrome, use the CLI Chrome profile commands instead of generic app-name placement.
