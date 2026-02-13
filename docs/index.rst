dock-switch documentation
=========================

Quickly switch among Dock apps via one global trigger key (default ``F20``).

Usage
-----

1. Trigger dock-switch (default ``F20``).
2. Press the app key shown in the HUD.

Configuration
-------------

Edit ``src/config.json``.

Basic app item:

.. code-block:: json

   {
     "name": "Safari",
     "key": "S",
     "screen": "3"
   }

Browser fixed placement (external monitor right half)
-----------------------------------------------------

You can set browser windows to always land on the **right half of the external monitor** when launched from dock-switch:

.. code-block:: json

   {
     "name": "Safari",
     "key": "S",
     "screen": "3",
     "placement": "external_right_half"
   }

.. code-block:: json

   {
     "name": "Chrome",
     "key": "G",
     "screen": "4",
     "placement": "external_right_half"
   }

Current placement support:

- ``external_right_half``
- app names supported by built-in placement: ``Safari``, ``Chrome`` / ``Google Chrome``

Notes
-----

- If no external display is detected, placement is skipped.
- You can map any convenient key to ``F20`` with Karabiner-Elements.
