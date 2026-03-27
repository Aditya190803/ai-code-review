# Production Readiness Notes

## Terminal UX

- Mouse-wheel input is translated into navigation anywhere arrow keys are already supported.
- Long views support `PgUp` and `PgDn` to reduce repetitive scrolling in larger result sets.
- Settings now reopen a real configuration wizard instead of clearing the existing API key.

## Configuration

- Provider definitions are centralized so adding or updating providers is no longer spread across the wizard and runtime config.
- Review output language, UI language preference, and review tone are persisted in the user config file.
- Provider keys are stored per provider so switching models or providers no longer destroys existing credentials.

## Demo Surface

- The repository includes a lightweight static demo/docs site under `site/`.
- `bun run site:dev` serves the demo locally.
- `bun run site:build` copies the static site into `dist/site` for deployment alongside the CLI build output.
