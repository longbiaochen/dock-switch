# AGENTS.md

These instructions apply to all Codex threads in this repository.

## Execution Rules

- Always test and validate until the requested behavior works.
- Always install and test the built app.
- Always build and distribute to `/Applications`.
- Keep repo docs aligned with the currently installed `/Applications/dock-switch.app` behavior.

## macOS Window Control Policy

- Prefer OS-native Accessibility API (`AXUIElement`) for window movement/resizing.
- Use deterministic cross-display sequence: `size -> position -> size`.
- Use minimal retries (at most one correction pass after a short settle delay).
- Use display `workArea` for maximize-like bounds.
- Detect source/target display from window rect center, with nearest-display fallback.

## Do Not Use AppleScript For Window Movement

- Do not use `AppleScript` / `osascript` for normal movement logic.
- Reason: slower, more animated, less deterministic, and app-specific failure modes.
- Only use AppleScript if the user explicitly asks for it.

## AXEnhancedUserInterface

- Before frame updates, check and temporarily disable app-level `AXEnhancedUserInterface` when enabled.
- Restore it to the original value after movement.

## Practical Notes

- Explicit bounds placement is generally more predictable than app-native zoom/fullscreen toggles.
- Keep one native movement path; avoid mixed fallback trees that introduce visible multi-step behavior.
- Validate with real apps (for example Safari and Chrome) from known internal-display starting bounds.
- For Playwright-managed Chrome, do not assume the reported Playwright session pid owns the native macOS window. Prefer Chrome profile targeting through `dock-switch-cli get-chrome-window` / `move-chrome-window`.

## Canonical CLI

- `dock-switch-cli` is the canonical automation interface for this repo.
- Prefer `dock-switch-cli` over raw socket payloads when Codex or scripts need display info or window movement.
- Core commands:
  - `dock-switch-cli displays`
  - `dock-switch-cli place --app <AppName> --placement external_right_half`
  - `dock-switch-cli place --pid <Pid> --placement external_right_half`
  - `dock-switch-cli move --app <AppName> --x <X> --y <Y> --w <W> --h <H>`
  - `dock-switch-cli move --pid <Pid> --x <X> --y <Y> --w <W> --h <H>`
  - `dock-switch-cli get-chrome-window --profile-dir <Dir>`
  - `dock-switch-cli move-chrome-window --profile-dir <Dir> --x <X> --y <Y> --w <W> --h <H>`

## Local Control Socket Commands

- `dock-switch` starts a Unix socket server at `~/Library/Application Support/dock-switch/control.sock`.
- Use newline-terminated JSON over `nc -U` only for low-level debugging when the CLI is not sufficient.
- `printf '%s\n' '{"command":"place-app","appName":"Google Chrome","placement":"external_right_half"}' | nc -U "$HOME/Library/Application Support/dock-switch/control.sock"`
- `printf '%s\n' '{"command":"move-app","appName":"Google Chrome","x":0,"y":25,"w":1440,"h":875}' | nc -U "$HOME/Library/Application Support/dock-switch/control.sock"`
- `printf '%s\n' '{"command":"debug-displays"}' | nc -U "$HOME/Library/Application Support/dock-switch/control.sock"`
