# Contributing to Savoria

## Start here

Released courses are defined in [`js/levels/world-one.js`](./js/levels/world-one.js) and [`js/levels/world-two.js`](./js/levels/world-two.js). Read [`js/levels/validate.js`](./js/levels/validate.js) before changing a recipe. Read [`js/levels/compiler.js`](./js/levels/compiler.js) when you need to understand what a primitive creates.

Worlds 3 through 6 in `js/experimental/` are hidden experiments. Do not present them as released content or add them to the release registry.

## Claude Code prompt

Copy this into Claude Code after opening the repository root:

```text
Revise one existing released Savoria course only. First read js/levels/validate.js, js/levels/compiler.js, and js/levels/world-one.js. Edit either 1-1 Farfalle Fields or 1-2 Penne Ridge in js/levels/world-one.js. Keep its ID and revise one compact definition using only supported primitives. Do not add 1-3 or another released course. Then run:

npm install
node --input-type=module -e "import { WORLD_ONE_LEVELS } from './js/levels/world-one.js'; import { assertValidReleasedLevels } from './js/levels/validate.js'; assertValidReleasedLevels(WORLD_ONE_LEVELS); console.log('Released level DSL valid.');"
npm test
npm run test:browser

In another terminal, start python3 serve.py and playtest the edited course at http://127.0.0.1:8977/ in a desktop browser. If the DSL validator or the reachability tests fail, stop before committing. Report the failing output and do not commit. Do not change js/experimental/ or claim its worlds are released. A brand-new released course requires a proposal and explicit release-test updates.
```

## Local workflow

Install dependencies once:

```bash
npm install
```

Run the validator against the released recipes:

```bash
node --input-type=module -e "import { WORLD_ONE_LEVELS } from './js/levels/world-one.js'; import { assertValidReleasedLevels } from './js/levels/validate.js'; assertValidReleasedLevels(WORLD_ONE_LEVELS); console.log('Released level DSL valid.');"
```

Run unit and reachability tests:

```bash
npm test
```

Start the local server in one terminal:

```bash
python3 serve.py
```

Open <http://127.0.0.1:8977/> and play the changed course. Then run browser tests:

```bash
npm run test:browser
```

Stop before committing if the validator or reachability tests fail.

## Recipe checklist

- Revise only 1-1 or 1-2 in `js/levels/world-one.js`.
- Use a supported primitive and a finite numeric size.
- Include `goal` or `boss`.
- Keep every required jump reachable through normal movement.
- Play the changed course locally on desktop.
- Keep Worlds 3 through 6 out of the release flow.

## New-course proposals

Future courses are welcome. Propose the course before adding it to the released registry. A new released course needs explicit release-test updates and is outside the starter revision flow.

## Pull requests

Use the pull request template. Include the command output, a browser screenshot, and the scope of the change. Do not copy Nintendo artwork, audio, characters, branding, or level layouts.

By submitting a pull request, you represent that you have authority to contribute its contents. You license contributed code under the [MIT License](./LICENSE). You license accepted original images and synthesized audio under [CC BY-NC 4.0](./ASSET-LICENSE.md). Trademark submissions are not accepted through this contribution process, including the Savoria name, wordmark, and logo.

This is a project licensing choice, not legal advice.
