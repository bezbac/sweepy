# Contributing

## File Organization

Every file in `src/commands/` must implement an actual CLI subcommand registered in `src/cli.ts`.

## Testing

For successful transformations, assert the exit status and resulting fixture files. Do not assert informational CLI output as this is less stable. Reserve output assertions for diagnostics on failure paths.

Keep each command's tests in its matching `tests/<command>.test.ts` file, including shared command behavior such as `--dry-run`. Reserve `tests/cli.test.ts` for root CLI behavior such as help and version output.

## Install the CLI

Build and install the local CLI globally:

```sh
pnpm build
pnpm add -g "file:$PWD"
sweepy --help
```

## Validation

Run these checks before submitting changes:

```sh
pnpm format
pnpm knip
pnpm test
pnpm typecheck
pnpm build
```
