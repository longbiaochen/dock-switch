CLI
===

``dock-switch-cli`` is the canonical command-line entrypoint for window placement, display inspection, and Playwright-managed Chrome targeting.

Examples
--------

.. code-block:: bash

   dock-switch-cli displays
   dock-switch-cli gokit5-status
   dock-switch-cli codex-display --target external
   dock-switch-cli place --app "Terminal" --placement external_right_half
   dock-switch-cli place --pid 12345 --placement external_right_half
   dock-switch-cli move --app "Terminal" --x 0 --y 25 --w 1512 --h 875
   dock-switch-cli move --pid 12345 --x 0 --y 25 --w 1512 --h 875

If ``dock-switch-cli`` is not on your PATH, run it from this repo as ``node bin/dock-switch-cli.js ...``.

Playwright-managed Chrome
-------------------------

Headed Playwright Chrome should be targeted by profile, not by generic app name and not by the Playwright session pid reported in CLI output.

.. code-block:: bash

   dock-switch-cli displays
   dock-switch-cli get-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX
   dock-switch-cli move-chrome-window --profile-dir /tmp/playwright_chromiumdev_profile-XXXXXX --x 713 --y -1410 --w 1280 --h 1410

Notes
-----

- Use ``--pid`` when you need to target one managed window from a multi-window app such as Google Chrome.
- Use the Chrome profile commands for Playwright-managed Google Chrome windows, because the reported Playwright session pid is not the native Chrome window owner.
- If the dock-switch control socket is unavailable, the CLI launches ``/Applications/dock-switch.app`` and retries automatically.
