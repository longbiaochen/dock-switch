Development
===========

Prerequisites
-------------

- macOS (the helper binary and behavior are macOS-specific)
- Node.js and Yarn
- Electron build tooling

Setup
-----

1. Install dependencies:

   .. code-block:: bash

      yarn install

2. Run the app locally:

   .. code-block:: bash

      yarn go

Build
-----

- Unsigned build:

  .. code-block:: bash

     yarn dist

- Signed build (requires valid signing identity):

  .. code-block:: bash

     yarn dist:signed

Troubleshooting
---------------

- If the app does not respond to `F20`, verify your key remapping.
- If helper actions fail, re-check Accessibility/Privacy permissions.
- If the app does not relaunch after build scripts, close existing instances and retry.
