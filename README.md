# Sweepy

## Commands

All commands share these flags:

- `--component` — Component name. Defaults to `Button`.
- `--props-type` — Props type/interface name. Defaults to `${ComponentName}Props`.
- `--search-root` — Usage search root. Defaults to `src`.
- `--tsconfig` — TypeScript config path. Defaults to `tsconfig.json`.
- `--component-file` — Component definition file path. Auto-detected when omitted.

Relative paths are resolved from the repository root.

### `materialize-prop`

Materializes a prop's type definition based on its current usages, turning a loose type into a strict union of discovered values.

```sh
materialize-prop --component Button --prop className
```

Flags:

- `--prop` — Prop name to materialize.
- `--yes`, `-y` — Save changes without asking for confirmation.

- Finds JSX usages and destructured prop defaults with supported string or numeric prop values.
- Rewrites the prop type to a strict union of discovered values. Inline object props are first extracted to a named `type` above the component.
- Rewrites supported JSX usages so finite dynamic expressions become explicit prop variants.
- Asks before saving files.

Supported `className` expressions are limited to finite class string variants. This includes string literals, ternaries with static branches, `condition && "class"`, and template literals whose interpolations are also finite class string variants. Multiple conditionals are expanded into a nested conditional prop expression. Constants, object style class names, function calls, and dynamic arguments are reported and left unchanged.

Other props support string and numeric literals, plus ternaries whose branches are also supported literal values. Constants and function calls are reported and left unchanged.

### `replace-prop-value`

Replaces one static component prop value with another prop value.

```sh
replace-prop-value \
  --component Logo \
  --source-prop className --source-value "h-8 w-8" \
  --target-prop size --target-value 32
```

Flags:

- `--source-prop` — Prop to replace from.
- `--source-value` — Value to replace from.
- `--target-prop` — Prop to replace to.
- `--target-value` — Value to replace to.

For example, the above rewrites:

```tsx
<Logo className="h-8 w-8" />
```

to:

```tsx
<Logo size={32} />
```

If a selected prop is typed as `string`, `number`, or another non-literal type, the command stops and asks you to run `materialize-prop` first.

If the target prop already exists with the requested value, the source prop is removed. If it exists with a different value, the usage is reported and left unchanged.

The source value is also removed from the component prop definition. The target value is added to the target prop definition when it is missing.

### `lift-prop-value`

Moves one static component prop value from matching component usages to a wrapper component or tag.

```sh
lift-prop-value \
  --component Logo \
  --source-prop className --source-value "hidden scale-120" \
  --wrapper div
```

Flags:

- `--source-prop` — Prop to lift from.
- `--source-value` — Value to lift.
- `--wrapper` — Wrapper component or tag. Defaults to `div`.

For example, the above rewrites:

```tsx
<Logo
  size={28}
  className="hidden scale-120 group-data-[collapsible=icon]:block"
/>
```

to:

```tsx
<div className="hidden scale-120 group-data-[collapsible=icon]:block">
  <Logo size={28} />
</div>
```

The source value is removed from the component prop definition. Dynamic or unsupported usages are reported and left unchanged.
