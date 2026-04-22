Overview
========

What It Does
------------

``dock-switch`` provides a keyboard-first launcher on top of Dock app data.
It is designed for fast app switching and display control on macOS.

Core Flow
---------

1. A global shortcut (`F20`) toggles the launcher window.
2. In the current default config, ``S`` targets Safari on the left half, ``B`` targets Google Chrome on the right half, ``X`` and ``G`` target internal-fill web apps, and ``Tab`` / ``Shift`` / left ``Command`` target Codex on external / internal / current-left-side displays.
3. The main process calls the native ``dock-query`` addon to fetch Dock app metadata.
4. The renderer builds a compact key map UI.
5. Key presses launch/focus apps; items with explicit placement or ``kind: "web_app"``
   use the placement path, while other apps restore remembered bounds.
   ``ArrowLeft``/``ArrowRight`` tile left/right
   half on the current display, ``ArrowUp`` moves to the external display,
   ``ArrowDown`` moves to or maximizes on the internal display, and
   ``Tab``/``Shift``/left ``Command`` focus or create ``Codex`` windows on
   external/internal/current-left-side displays, move the mouse to the target display
   center, and ask Codex to focus its composer with ``Escape``. ``Codex`` is excluded
   from the ordinary HUD item list, while numeric keys remain available for normal
   launcher selection.

Startup
-------

Keep the installed app in macOS Open at Login so the global shortcut is available after login.
The CLI also auto-launches ``/Applications/dock-switch.app`` when the control socket is not available.

Architecture
------------

- ``src/main.js``:
  Electron main process, tray setup, global shortcut registration, IPC, and dock-query integration.
- ``src/index.js``:
  Renderer process for key handling, rendering mapped items, and native dock-switch placement triggers.
- ``native/dock-query``:
  Native Node addon that reads live Dock metadata directly in-process.
- ``bin/dock-switch-cli.js``:
  Canonical automation CLI for display inspection, AX-based app/pid movement, and Chrome-profile targeting for Playwright-managed windows.
