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
- ``kind`` (optional): built-in launch behavior tag. ``web_app`` defaults to ``internal_fill`` unless ``placement`` overrides it.
- ``open_path`` (optional): exact app bundle path to open instead of resolving by app name
- ``app_url`` (optional): exact Chrome ``--app=...`` URL used to identify a web app window by pid after launch

Notes
-----

- App names are matched exactly against Dock item names.
- Key matching in the renderer is case-insensitive, with symbolic support for launcher keys such as ``Tab``, ``Shift``, left ``Command``, right ``Command``, and ``Space``.
- In the current default config, Safari, Feishu, WeChat, Google Chrome, Calendar, Notes, Contacts, Mail, Sublime Text, and configured web apps are mapped to ``internal_fill`` on the internal display.
- In the current launcher behavior, ``Shift`` opens ``Codex``, ``Tab`` opens ``ChatGPT``, left ``Command`` opens ``System Settings`` with ``internal_fill``, ``\`` opens ``Terminal`` with ``side_right_fill``, ``F3`` opens ``SmartShadow`` with ``side_left_fill``, and right ``Command`` is a reserved no-op. App shortcuts restore remembered window bounds when available.
- ``Codex``, ``ChatGPT``, and Command shortcuts render in the launcher HUD as symbolic shortcut labels: ``⇧`` for ``Shift`` / Codex, ``⇥`` for ``Tab`` / ChatGPT, and ``⌘`` for left/right ``Command``. They remain excluded from ordinary fallback numbering, so their symbolic keys cannot fall through to a stale generic app-placement entry.
- ``ArrowLeft`` moves the frontmost window to the left side-display work area.
- ``ArrowRight`` moves the frontmost window to the right side-display work area.
- ``ArrowUp`` moves the frontmost window to the external display work area.
- ``ArrowDown`` moves the frontmost window to the internal display work area.
- Arrow display moves also move the pointer to the center of the target display.
- ``【`` / ``】`` tile the frontmost window to the left or right half of its current display.
- ``1`` / ``2`` / ``3`` are available again for ordinary launcher item selection when those keys are assigned or used as fallback numbers.
- ``\`` is available as an ordinary launcher key and is assigned to ``Terminal`` in the default config.
- Screen direction codes used by keyboard movement are: ``0=external``, ``1=internal``, ``2=full``, ``3=left``, ``4=right``.
- If ``placement`` is set, placement behavior takes precedence over remembered bounds.
- App activation shortcuts move the pointer to the center of the activated or placed window.
- If ``kind`` is ``web_app`` and ``placement`` is not set, dock-switch places the app at ``internal_fill``.
- If ``open_path`` is set, dock-switch launches that exact app bundle.
- If ``app_url`` is set, dock-switch can place a Chrome app window by pid even when Accessibility exposes it as ``Google Chrome``.
- ``external_fill`` maximizes to the external display work area.
- ``side_fill`` remains a compatibility alias for ``side_left_fill``.
- ``side_left_fill`` maximizes to the left side-display work area.
- ``side_right_fill`` maximizes to the right side-display work area.
- GoKit5 host-button events select Codex display focus with ``minus`` -> ``side_left``, ``voice`` -> ``external``, ``green`` -> ``side_right``, and ``plus`` / ``volume_up`` -> ``internal``.
- If no external display is available, ``external_left_half`` falls back to the left half of the internal display work area.
- If no external display is available, ``external_right_half`` falls back to the right half of the internal display work area.

CLI and GoKit5
--------------

See :doc:`cli` for the command-line interface and :doc:`gokit5` for serial-button control.
