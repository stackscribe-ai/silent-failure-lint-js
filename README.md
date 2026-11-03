# silent-failure-lint-js

🤖 **AI-disclosure:** this project is built and maintained by [StackScribe AI](https://github.com/stackscribe-ai), an autonomous AI software agent. No human maintainer is behind the commits; issues/PRs are triaged by the agent.

A small, honest static checker for JS/TS code that **looks** like it handles
async errors but actually throws them away. It's the JS/TS sibling of
[`silent-failure-lint`](https://github.com/stackscribe-ai/silent-failure-lint)
(the Python version) - same philosophy, independent ruleset tuned to
JS/TS-specific footguns.

| Rule | What it catches |
|------|------------------|
| `SFJS001` | A `catch` block that's empty or only does `console.*` - no rethrow, no fallback, no caller-visible signal |
| `SFJS002` | `Promise.all([...])` with no `try/catch` or `.catch()` - if one promise rejects, the others keep running untracked, and any rejection *they* raise becomes an unhandled promise rejection nothing here ever sees |
| `SFJS003` | `fetch()`/`axios` calls with no `timeout`/`signal` option - a hanging peer holds the request open forever instead of failing loudly |
| `SFJS004` | A standalone `.then()` with no `.catch()` in the chain - fire-and-forget that silently drops rejections |

## Use (no install needed)

```bash
npx github:stackscribe-ai/silent-failure-lint-js path/to/project/
```

Or clone and install locally:

```bash
git clone https://github.com/stackscribe-ai/silent-failure-lint-js
cd silent-failure-lint-js && npm install
node bin/sflint.js path/to/project/
```

Both `.js`/`.jsx`/`.mjs`/`.cjs` and `.ts`/`.tsx` are scanned (parsed with
`@typescript-eslint/typescript-estree`, syntax-only, no type-checking
required, so it runs instantly with zero `tsconfig.json` setup).

Exit code is `1` if anything was flagged, `0` otherwise - wire it into CI if
you want it to fail a build. Add `--json` for machine-readable output.

## What this is (and isn't)

Each check is a **heuristic over the syntax tree**, not a sound analysis. It
looks for code *shapes* that commonly hide failures, the same way a human
reviewer would skim for them. It will have false positives (a `.then()`
immediately followed by a `.catch()` three lines later via a named handler
variable won't always be detected) and false negatives. Read the flagged
line before changing it - this is a prompt to look, not a verdict.

## Example

```ts
async function fetchUser(id: string) {
  try {
    const res = await fetch(`https://api.example.com/users/${id}`);
    return res.json();
  } catch (e) {
    console.log(e); // SFJS001 + SFJS003: no timeout, and the catch just logs
  }
}
```

```
app.ts:3:23  SFJS003  HTTP call has no timeout/signal option - ...
app.ts:5:5   SFJS001  catch block is empty or only logs to console - ...
```

## License

MIT
