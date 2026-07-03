GoKit5 Serial Control
=====================

``dock-switch`` can optionally listen to a connected GoKit5 / 机智云 controller over serial and convert host-button events into Codex display-selection actions.

Behavior
--------

- The serial listener starts automatically when dock-switch launches.
- Set ``DOCK_SWITCH_GOKIT5=0`` to disable serial listening.
- Set ``GOKIT5_SERIAL_PORT=/dev/cu.usbmodem...`` to pin the port when auto-detection is not reliable.
- ``dock-switch-cli gokit5-status`` reports whether the listener is enabled/running and which port it is using.

Button mapping
--------------

The firmware sends host-button events that map to Codex display targets:

- ``minus`` -> left side display
- ``plus`` -> internal display
- ``voice`` -> external display
- ``green`` -> right side display
- ``switch`` -> right side display

If the selected display already has a Codex window, dock-switch brings that window forward. If not, it creates a new Codex window on that display and fills the display work area without moving existing Codex windows from other displays. If a requested external or side display is not connected, dock-switch falls back to the internal main display work area.

Firmware
--------

The matching firmware is published at ``https://github.com/longbiaochen/open-embodied``.
