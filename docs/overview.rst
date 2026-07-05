Overview
========

What It Does
------------

``dock-switch`` provides a keyboard-first launcher on top of Dock app data.
It is designed for fast app switching and display control on macOS.

Core Flow
---------

1. A global shortcut (`F20`) toggles the launcher window.
2. In the current default config, Safari, Feishu, WeChat, Google Chrome, Calendar, Notes, Contacts, Mail, Sublime Text, and configured web apps target ``internal_fill`` on the internal display, while symbolic shortcuts target ChatGPT, Codex, System Settings, Terminal, SmartShadow, and Claude.
3. The main process calls the native ``dock-query`` addon to fetch Dock app metadata.
4. The renderer builds a compact key map UI.
5. Key presses launch/focus apps; items with explicit placement or ``kind: "web_app"``
   use the placement path, while other apps restore remembered bounds.
   ``ArrowLeft``/``ArrowRight`` move to the left/right side-display work areas,
   ``ArrowUp`` moves to the external display, ``ArrowDown`` moves to the internal
   display, ``【``/``】`` tile the current display left/right half, and launcher keys open reserved apps through dock-switch itself: ``left_shift`` opens ``Codex`` on the external display, ``right_shift`` opens ``Claude`` on the right side display, ``F6`` opens
   ``ChatGPT`` on the right side display, left ``Command`` opens ``System Settings`` on the internal display, ``\`` opens
   ``Terminal`` on the right side display, and right ``Command`` is a reserved no-op. ``F3`` is a local Karabiner exception that directly opens ``SmartShadow`` and then uses dock-switch placement with ``side_left_fill``. ``Command`` shortcuts render as ``⌘`` in the HUD. ``Codex``, ``ChatGPT``, ``SmartShadow``, and ``Claude`` are excluded from the ordinary HUD
   item list, while numeric keys remain available for normal launcher selection.
6. Display-moving arrows move the pointer to the center of the target display.
   App activation shortcuts move it to the center of the activated or placed window.
7. The optional GoKit5 serial listener maps host-button events from
   ``longbiaochen/open-embodied`` firmware to Codex display-selection actions
   across the left side, internal, external, and right side displays. It brings
   forward a Codex window already on the selected display, or creates a new one
   there without moving existing Codex windows from other displays.

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
  Canonical automation CLI for display inspection, Codex display selection, AX-based app/pid movement, and lower-level Chrome profile targeting.
