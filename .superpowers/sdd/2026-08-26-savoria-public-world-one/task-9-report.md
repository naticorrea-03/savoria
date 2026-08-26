# Task 9 report: Browser quality gates and CI

Date: 2026-08-26
Status: Implemented and verified locally

## Outcome

- Added a Playwright configuration for `python3 serve.py` on `127.0.0.1:8977`.
- Added four browser release-flow tests against the public UI.
- Added a reproducible npm lockfile for the pinned browser runner.
- Added GitHub Actions CI that runs unit tests before browser tests on Node 22.

## Installed versions

- Local Node: `v24.15.0`
- Local npm: `11.12.1`
- `@playwright/test`: `1.55.0`, exact in `package.json` and `package-lock.json`
- Local Chromium: `140.0.7339.16`, Playwright build `1187`

`npm install` completed, then `npx playwright install chromium` downloaded Chromium, its headless shell, and the required Playwright FFmpeg helper. `npm ci` also completed from the generated lockfile.

## Browser coverage

- Landing page to Play Savoria, title screen, chef selection, and saved chef reload.
- Exactly one World 1 strip and exactly two released nodes, with 1-2 initially locked.
- 1-1 loads through the public map action and owns one canvas.
- Escape pause, Space activation of Resume, and a running session after resume.
- Restart replaces the old canvas and leaves exactly one attached canvas.
- Completing 1-1 unlocks 1-2, writes production save state, and preserves that unlock after reload.
- 390 by 844 shows only the desktop-required blocker.
- Every test asserts no page errors, no external HTTP requests, and no application console warnings or errors.

The completion test uses only `window.__savoriaTest.session`, one of the existing four allowed test-surface properties, to position the player at the authored goal. The following production frame emits the normal completion event, which exercises the reducer and save write. No test writes local storage, edits the DOM, or dispatches reducer events directly.

Chromium sometimes emits its own `GPU stall due to ReadPixels` process diagnostic during WebGL rendering. The browser test excludes only that exact non-page diagnostic. All page-originated warnings and errors remain test failures.

## Verification

Final local commands:

```text
npm ci
added 4 packages, and audited 5 packages

npm test
60 passed, 0 failed

npm run test:browser
4 passed, 0 failed

node --check playwright.config.js
node --check tests/browser/savoria.spec.js
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml')"
git diff --check
```

The syntax, YAML, and whitespace checks all exited successfully. The browser run used one worker and completed in 5.0 seconds.

## CI behavior

`.github/workflows/ci.yml` runs for pull requests and pushes to `main`:

1. Checks out the repository.
2. Uses Node 22 with the npm cache.
3. Runs `npm ci` from the lockfile.
4. Installs Chromium and its Linux dependencies with `npx playwright install --with-deps chromium`.
5. Runs `npm test`.
6. Runs `npm run test:browser`.

## Self-review

- The configured server is bound by `serve.py` to `127.0.0.1:8977`.
- Browser tests use user-visible controls except for the existing, approved session getter used for deterministic authored-level completion.
- Tests do not add production runtime hooks, network calls, or state mutations.
- The CI order guarantees unit failures stop the browser job before Playwright runs.
- No deployment, Pages configuration, or remote push was performed.

## Concerns

- Local verification used Node 24.15.0. CI intentionally fixes Node 22, as required, but has not run remotely yet.
- `npm install` and `npm ci` report two high-severity audit findings in transitive dependencies. No audit upgrade was attempted because that would exceed this testing task and could alter the pinned browser toolchain.
