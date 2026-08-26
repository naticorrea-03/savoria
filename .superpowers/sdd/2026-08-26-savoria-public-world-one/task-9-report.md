# Task 9 report: Browser quality gates and CI

Date: 2026-08-26
Status: Fix round 1 implemented and verified locally

## Outcome

- Added a Playwright configuration for `python3 serve.py` on `127.0.0.1:8977`.
- Added five browser release-flow and diagnostics tests against the public UI.
- Added a reproducible npm lockfile for the pinned browser runner.
- Added GitHub Actions CI that runs unit tests before browser tests on Node 22.

## Installed versions

- Local Node: `v24.15.0` (Node 22 was not installed locally)
- Local npm: `11.12.1`
- `@playwright/test`: `1.62.1`, exact in `package.json` and `package-lock.json`
- Local Chromium: `151.0.7922.34`, Playwright Chromium build `1234`

`npm install --save-dev --save-exact @playwright/test@1.62.1` completed, then `npx playwright install chromium` installed the matching browser and headless shell. A clean `npm ci` also completed from the regenerated lockfile.

## Browser coverage

- Landing page to Play Savoria, title screen, chef selection, and saved chef reload.
- Exactly one World 1 strip and exactly two released nodes, with 1-2 initially locked.
- 1-1 loads through the public map action and owns one canvas.
- Escape pause, visible pause dialog, Resume focus, Space activation of Resume, restored game-stage focus, visible canvas, and a resumed timer.
- Restart replaces the old canvas and leaves exactly one attached canvas.
- Completing 1-1 unlocks 1-2, writes production save state, and preserves that unlock after reload.
- 390 by 844 shows only the desktop-required blocker.
- Every release-flow test asserts no page errors, no non-local HTTP requests, no local HTTP 4xx or 5xx responses, no failed requests, no WebSocket connections, and no application `console.warn` or `console.error` calls.

The completion test uses only `window.__savoriaTest.session`, one of the existing four allowed test-surface properties, to position the player at the authored goal. The following production frame emits the normal completion event, which exercises the reducer and save write. No test writes local storage, edits the DOM, or dispatches reducer events directly.

The monitor installs before app scripts and wraps only page-level `console.warn` and `console.error`. It does not filter browser-process diagnostics by text. A focused mutation test calls `console.warn('GPU stall due to ReadPixels from page code')` and proves that the monitor fails on it. The upgraded Chromium did not emit the earlier GPU process message in the final suite.

## Verification

Final local commands:

```text
npm ci
completed from package-lock.json

npm test
60 passed, 0 failed

npm run test:browser
5 passed, 0 failed

npx playwright test --grep "landing reaches chef selection" --repeat-each=12 --workers=4
12 passed, 0 failed

npm audit
found 0 vulnerabilities

node --check playwright.config.js
node --check tests/browser/savoria.spec.js
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml')"
git diff --check
```

The syntax, YAML, and whitespace checks all exited successfully. The final normal browser run used one worker and completed in 6.9 seconds. The parallel landing stress run completed in 3.7 seconds.

## CI behavior

`.github/workflows/ci.yml` runs for pull requests and pushes to `main`:

1. Checks out the repository.
2. Uses Node 22 with the npm cache.
3. Runs `npm ci` from the lockfile.
4. Installs Chromium and its Linux dependencies with `npx playwright install --with-deps chromium`.
5. Runs `npm test` after browser installation.
6. Runs `npm run test:browser` after unit tests pass.

## Self-review

- The configured server is bound by `serve.py` to `127.0.0.1:8977`.
- Browser tests use user-visible controls except for the existing, approved session getter used for deterministic authored-level completion.
- Pause and resume assertions no longer inspect `session.running`.
- The public `#app[data-screen="title"]` state is awaited before title interactions, and the landing flow passed 12 repeats across four workers.
- Tests do not add production runtime hooks, network calls, or state mutations.
- The CI order installs the browser first, then guarantees unit failures stop browser tests.
- No deployment, Pages configuration, or remote push was performed.

## Concerns

- Local verification used Node 24.15.0 because Node 22 was unavailable in this environment. CI intentionally fixes Node 22, but remote CI remains unverified.
- Before the required upgrade, the audit's direct `@playwright/test` and transitive `playwright` entries represented one advisory, not two independent findings. With exact `@playwright/test@1.62.1`, the final `npm audit` reports zero vulnerabilities, including zero high or critical findings.
