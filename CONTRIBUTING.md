# Contributing to Savoria

## Start here

Released courses are defined in [`js/levels/world-one.js`](./js/levels/world-one.js). Read [`js/levels/validate.js`](./js/levels/validate.js) before changing a recipe. Read [`js/levels/compiler.js`](./js/levels/compiler.js) when you need to understand what a primitive creates.

Worlds 2 through 6 in `js/experimental/` are hidden experiments. Do not present them as released content or add them to the release registry.

## Claude Code prompt

Copy this into Claude Code after opening the repository root:

```text
Work on one compact Savoria level definition only. First read js/levels/validate.js, js/levels/compiler.js, and js/levels/world-one.js. Edit one definition in js/levels/world-one.js using only supported primitives. Then run:

npm install
node --input-type=module -e "import { WORLD_ONE_LEVELS } from './js/levels/world-one.js'; import { assertValidReleasedLevels } from './js/levels/validate.js'; assertValidReleasedLevels(WORLD_ONE_LEVELS); console.log('Released level DSL valid.');"
npm test
npm run test:browser

In another terminal, start python3 serve.py and playtest at http://127.0.0.1:8977/. Check the edited course on a desktop browser. If the DSL validator or the reachability tests fail, stop before committing. Report the failing output and do not commit. Do not change js/experimental/ or claim its worlds are released.
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

- Edit only one compact definition in `js/levels/world-one.js`.
- Use a supported primitive and a finite numeric size.
- Include `goal` or `boss`.
- Keep every required jump reachable through normal movement.
- Play the changed course locally on desktop.
- Keep hidden experimental worlds out of the release flow.

## Pull requests

Use the pull request template. Include the command output, a browser screenshot, and the scope of the change. Do not copy Nintendo artwork, audio, characters, branding, or level layouts.

Code contributions follow the [MIT License](./LICENSE). Original images and synthesized audio follow the [asset license](./ASSET-LICENSE.md). This is a project licensing choice, not legal advice.
