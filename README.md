# ts-shape-action

> Never ship breaking changes by accident again.

A GitHub Action that analyzes the **public API surface** of TypeScript packages in npm workspaces and posts a diff comment on pull requests showing added, removed, and changed exports.

## Features

- Automatically analyzes base and head branches on PRs
- Posts collapsible PR comments with API changes
- Supports npm workspace monorepos
- Follows re-export chains (`export * from`, `export { x } from`)
- Handles function overloads
- Deterministic, sorted output for reliable diffs

## Usage

Add this workflow to your repository at `.github/workflows/api-surface.yml`:

```yaml
name: Public API Surface

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  api-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: janniks/ts-shape-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it! The action will:

1. Checkout the base branch and analyze all packages
2. Checkout the head branch and analyze all packages
3. Compute the diff
4. Post a PR comment with the changes

## PR Comment Example

The action posts a comment like this:

---

## Public API Surface Changes

**2** packages affected · **+3** added · **-1** removed · **~2** changed

<details>
<summary><strong>@acme/core</strong> (+2, -1)</summary>

#### Added

```diff
+ parse: function = (input: string, opts?: Options) => Result
+ Config: type = { debug: boolean; timeout: number }
```

#### Removed

```diff
- deprecated: function = () => void
```

</details>

<details>
<summary><strong>@acme/utils</strong> (~1)</summary>

#### Changed

**`format`** (function)

```diff
- (value: number) => string
+ (value: number, locale?: string) => string
```

</details>

---

## Inputs

| Input                   | Description                             | Required | Default               |
| ----------------------- | --------------------------------------- | -------- | --------------------- |
| `github-token`          | GitHub token for posting PR comments    | Yes      | `${{ github.token }}` |
| `root`                  | Root directory of the workspace         | No       | `.`                   |
| `packages`              | Glob pattern to filter packages         | No       | -                     |
| `fail-on-changes`       | Fail the action if API changes detected | No       | `false`               |
| `comment-on-no-changes` | Post comment even when no changes       | No       | `false`               |

## Outputs

| Output              | Description                     |
| ------------------- | ------------------------------- |
| `has-changes`       | `"true"` if API changed         |
| `packages-affected` | Number of packages with changes |
| `exports-added`     | Number of exports added         |
| `exports-removed`   | Number of exports removed       |
| `exports-changed`   | Number of exports changed       |

## Advanced Usage

### Filter to specific packages

```yaml
- uses: janniks/ts-shape-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    packages: "@acme/*"
```

### Fail on breaking changes

```yaml
- uses: janniks/ts-shape-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-changes: "true"
```

### Use output in subsequent steps

```yaml
- uses: janniks/ts-shape-action@v1
  id: api-check
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Check for breaking changes
  if: steps.api-check.outputs.exports-removed != '0'
  run: |
    echo "Warning: ${{ steps.api-check.outputs.exports-removed }} exports were removed!"
```

## How It Works

### What's Analyzed

The action analyzes the **public API surface** - what consumers can import from your packages:

- Direct exports (`export const`, `export function`, `export class`, etc.)
- Named re-exports (`export { a, b as c } from "./x"`)
- Star re-exports (`export * from "./x"`)
- Namespace re-exports (`export * as ns from "./x"`)

### What's Excluded

- Internal files not reached via export declarations
- Private class members
- Build outputs (`.d.ts`, `dist/` files)

### Entrypoint Resolution

Package entrypoints are resolved in this order:

1. **`exports` field** - Parses subpath exports with condition priority: `types` > `import` > `default`
2. **Fallback fields** - `types` → `module` → `main`
3. **Convention** - `src/index.ts` or `src/index.tsx`

## Output Format

The action generates a `public-api.jsonl` file with one JSON array per line:

```json
["@acme/foo", ".", "named", "parse", "function", "(input: string) => Result"]
```

Fields: `[package, subpath, exportType, name, kind, shape]`

Function overloads produce multiple lines with the same identity but different shapes.

## Local Development

```bash
# Install
npm install

# Build
npm run build

# Test against fixtures
node dist/index.js --root ./fixtures --output ./test-output
```

## CLI Usage

The action can also be used as a CLI tool:

```bash
# Analyze a workspace
npx ts-shape-action --root ./my-monorepo --output ./api

# Compare two snapshots
npx ts-shape-action diff ./base-api ./head-api --output ./diff
```

## License

MIT
