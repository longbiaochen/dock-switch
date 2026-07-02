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

The firmware sends host-button events that map to app placement actions:

- ``minus`` -> ``SmartShadow.app`` at ``side_left_fill``
- ``plus`` -> ``X.app`` at ``internal_fill``
- ``voice`` -> ``Codex.app`` at ``external_fill``
- ``green`` -> ``Claude.app`` at ``side_right_fill``
- ``switch`` -> ``Claude.app`` at ``side_right_fill``

Firmware
--------

The matching firmware is published at ``https://github.com/longbiaochen/open-embodied``.
