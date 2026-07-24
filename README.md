<p align="center">
  <img src="./resources/logo.svg" alt="Sweepy" width="640" />
</p>

---

# Introduction

Sweepy is a TypeScript CLI for safely refactoring React components and their usages.

## Installation

```sh
pnpm install
pnpm build
pnpm add -g "file:$PWD"
```

## Commands

- `materialize-prop` derives a strict prop type from static usages.
- `replace-prop-value` replaces one static prop value with another.
- `lift-prop-value` moves a static prop value to a wrapper.
- `narrow-props` limits component props to the keys in use.

Run `sweepy --help` or `sweepy <command> --help` for available options. Changes require confirmation by default; use `--dry-run` to preview them or `--yes` to apply them without confirmation.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project conventions.

## AI-Assisted Development

This project was developed using AI-assisted coding tools to accelerate implementation, refactoring, testing, and documentation.

All code was reviewed, modified where appropriate, tested, and accepted by the project maintainers. Responsibility for the design, correctness, security, and licensing of this repository remains with the human authors.

## Attribution

This project's logo contains a stylized depiction of the React logo.

The React logo is licensed under the **Creative Commons Attribution 4.0 International (CC BY 4.0)** license, as described in the React documentation repository:
https://github.com/reactjs/reactjs.org/blob/master/LICENSE-DOCS.md

React is a trademark of Meta Platforms, Inc. This project is not affiliated with, endorsed by, or sponsored by Meta or the React project.
