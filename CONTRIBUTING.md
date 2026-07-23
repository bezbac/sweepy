# Contributing

## File Organization

Every file in `src/commands/` must implement an actual CLI subcommand registered in `src/cli.ts`.

## Error Handling

Define expected failures as documented `Data.TaggedError` classes in `src/errors.ts`. Errors must contain structured context such as component names, prop names, paths, or underlying causes, but no user-facing message. Construct the specific error class directly; `Data.TaggedError` supplies `_tag` automatically.

```ts
throw new PropNotFoundError({ propName, propsTypeName });
```

Preserve known errors when wrapping synchronous or asynchronous dependencies. Use `preserveSweepyError` only at boundaries that may also throw unknown dependency failures; it converts unknown values to `UnexpectedFailureError` while leaving known errors intact. Infrastructure errors should retain their original `cause` for boundary reporting.

Generate all user-facing error text in the exhaustive `formatCommandError` function in `src/cli.ts`. Adding an error requires adding its formatter branch. Commands and shared transformation code must not generate error messages or include command presentation details in error values.

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
pnpm validate
```
