# Contributing

## File Organization

Every file in `src/commands/` must implement an actual CLI subcommand registered in `src/cli.ts`.

## Testing

For successful transformations, assert the exit status and resulting fixture files. Do not assert informational CLI output as this is less stable. Reserve output assertions for diagnostics on failure paths.

## Validation

Run these checks before submitting changes:

```sh
pnpm format
pnpm knip
pnpm test
pnpm typecheck
pnpm build
```
