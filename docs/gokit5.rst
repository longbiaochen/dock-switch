GoKit5 Serial Control
=====================

``dock-switch`` can optionally listen to a connected GoKit5 / 机智云 controller over serial and convert host-button events into app launch and window placement actions.

Behavior
--------

- The serial listener starts automatically when dock-switch launches.
- Set ``DOCK_SWITCH_GOKIT5=0`` to disable serial listening.
- Set ``GOKIT5_SERIAL_PORT=/dev/cu.usbmodem...`` to pin the port when auto-detection is not reliable.
- ``dock-switch-cli gokit5-status`` reports whether the listener is enabled/running and which port it is using.

Button mapping
--------------

The firmware sends host-button events that map to Codex placement actions:

- ``minus`` -> ``Codex.app`` at ``side_left_fill``
- ``plus`` -> ``Codex.app`` at ``internal_fill``
- ``voice`` -> ``Codex.app`` at ``external_fill``
- ``green`` -> ``Codex.app`` at ``side_right_fill``
- ``switch`` -> ``Codex.app`` at ``side_right_fill``

If a requested external or side display is not connected, dock-switch falls back to the internal main display work area.

Firmware
--------

The matching firmware is published at ``https://github.com/longbiaochen/open-embodied``.
