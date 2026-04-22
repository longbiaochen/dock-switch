# dock-switch Maintenance Notes

- This is a legacy repo retained for explicit maintenance only.
- Do not treat it as part of the default Codex workflow on this machine unless the user explicitly asks to work in this repo.

## Execution Rules

- Always debug and verify the real user interaction path first.
- CLI verification is supplementary; it does not replace verifying the actual hotkey, launcher, or visible app behavior.
- Always install and test the built app when changing this repo.

## Canonical CLI

- `dock-switch-cli displays`
- `dock-switch-cli place --app <AppName> --placement external_right_half`
- `dock-switch-cli place --pid <Pid> --placement external_right_half`
- `dock-switch-cli move --app <AppName> --x <X> --y <Y> --w <W> --h <H>`
- `dock-switch-cli move --pid <Pid> --x <X> --y <Y> --w <W> --h <H>`

## Maintenance Rules

- Prefer `AXUIElement`-based movement over AppleScript for normal window movement.
- Keep repo docs aligned with the behavior of the currently installed `/Applications/dock-switch.app`.
