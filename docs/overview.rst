Overview
========

What It Does
------------

``dock-switch`` provides a keyboard-first launcher on top of Dock app data.
It is designed for fast app switching and display control on macOS.

Core Flow
---------

1. A global shortcut (`F20`) toggles the launcher window.
2. The main process calls ``ui-helper`` to fetch Dock app metadata.
3. The renderer builds a compact key map UI.
4. Key presses launch/focus apps and optionally move focus across displays.

Architecture
------------

- ``src/main.js``:
  Electron main process, tray setup, global shortcut registration, and IPC.
- ``src/index.js``:
  Renderer process for key handling, rendering mapped items, and helper calls.
- ``src/ui-helper``:
  Native helper binary used to query Dock details and set display/mouse state.
