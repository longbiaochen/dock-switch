Overview
========

What It Does
------------

``dock-switch`` provides a keyboard-first launcher on top of Dock app data.
It is designed for fast app switching and display control on macOS.

Core Flow
---------

1. A global shortcut (`F20`) toggles the launcher window.
2. The main process calls the native ``dock-query`` addon to fetch Dock app metadata.
3. The renderer builds a compact key map UI.
4. Key presses launch/focus apps; ``ArrowLeft``/``ArrowRight`` tile left/right
   half on the current display, ``ArrowUp`` moves to the external display,
   ``ArrowDown`` moves to or maximizes on the internal display, and ``\``
   fills current display work area.

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
