# Contributing

## Scope
This project is a small Electron utility for macOS. Keep changes focused and minimal.

## Development Setup
1. Install dependencies:
   - `yarn install`
2. Start locally:
   - `yarn go`

## Pull Request Guidelines
- Keep PRs small and single-purpose.
- Document behavior changes in `README.md` when needed.
- Avoid committing generated artifacts (`dist/`, `docs/_build/`, `node_modules/`).
- Test the core flow manually:
  - Trigger launcher with `F20`
  - Launch/focus at least one app by key
  - Verify display switching keys

## Commit Guidance
- Use clear commit messages describing intent and impact.
- Prefer imperative style, for example: `docs: clarify first-run permissions`.
