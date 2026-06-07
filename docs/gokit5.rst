GoKit5 Serial Control
=====================

``dock-switch`` can optionally listen to a connected GoKit5 / 机智云 controller over serial and convert host-button events into display focus actions (for Codex display selection and pointer centering).

Behavior
--------

- The serial listener starts automatically when dock-switch launches.
- Set ``DOCK_SWITCH_GOKIT5=0`` to disable serial listening.
- Set ``GOKIT5_SERIAL_PORT=/dev/cu.usbmodem...`` to pin the port when auto-detection is not reliable.
- ``dock-switch-cli gokit5-status`` reports whether the listener is enabled/running and which port it is using.

Button mapping
--------------

The firmware sends host-button events that map to display targets:

- ``minus`` -> left side display (``side_left``)
- ``voice`` -> external display (``external``)
- ``green`` -> right side display (``side_right``)
- ``plus`` / ``volume_up`` -> internal display (``internal``)

Firmware
--------

The matching firmware is published at ``https://github.com/longbiaochen/open-embodied``.
