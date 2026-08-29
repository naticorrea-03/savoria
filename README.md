# Savoria

Savoria is a desktop food platformer. Choose a chef, cross Pasta Plains and Sushi Shores, collect tomatoes, and clear four hand-built courses.

## Play

The game route is [`/play/`](./play/). It is not hosted or published from this repository yet. Run it locally first:

```bash
python3 serve.py
```

Open <http://127.0.0.1:8977/>. Use a desktop browser at least 900 by 620 pixels.

Controls: A/D or Left/Right to move, Shift to run, Space or Up to jump, and Escape to pause.

## Why the browser build

Savoria began as a Godot project. That work shaped the game art and direction. Its GUI scene trees and export process made text review and contribution slower. The browser build keeps levels as data, which makes review simple and local play build-free. Both versions are part of the project story.

## How levels work

A level is data. `js/levels/validate.js` checks the recipe, `js/levels/compiler.js` turns it into neutral game data, and the runtime renders it.

Released definitions live in [`js/levels/world-one.js`](./js/levels/world-one.js) and [`js/levels/world-two.js`](./js/levels/world-two.js). This is the current compact definition for released course 1-1:

```js
level(1, 1, 'Farfalle Fields', 'pasta', 240, [
  ['run', 12, { coins: 5, tutorial: 'move', deco: 'cypress' }],
  ['run', 6, { tutorial: 'jump' }],
  ['gap', 3.5, { arc: 5 }],
  ['run', 14, { enemy: 'meatball', tutorial: 'stomp', deco: 'windmill', decoS: 1.2 }],
  ['blocks', 3],
  ['checkpoint', 0],
  ['river', 9],
  ['run', 16, { tutorial: 'run', coins: 4, deco: 'cypress' }],
  ['gap', 5, { arc: 5, requiresRun: true }],
  ['goal', 0],
]);
```

The starter contribution flow revises one existing World 1 course, 1-1 or 1-2. A new released course needs a proposal and explicit release-test updates. The current suite does not accept a drop-in course.

Supported primitives are `run`, `gap`, `rise`, `steps`, `river`, `plats`, `roll`, `blocks`, `tier`, `pillars`, `bonus`, `checkpoint`, `goal`, and `boss`.

## Local setup

Runtime play needs no build step. Tests need Node and the package dependencies.

```bash
npm install
npm test
npm run test:browser
```

`npm test` includes validator, compiler, save, rendering, and released-course reachability coverage. `npm run test:browser` starts `python3 serve.py` when no local server is already running.

## Architecture

- `index.html` is the landing page.
- `play/index.html` is the game shell.
- `js/levels/` contains the level DSL, validation, compiler, themes, and released World 1 and World 2 data.
- `js/core/`, `js/gameplay/`, and `js/ui/` own rendering, game rules, and screens.
- `tests/unit/` covers game logic and level reachability. `tests/browser/` covers the desktop flow.

## Contribute

Start with [the contribution guide](./CONTRIBUTING.md). It includes a copyable Claude Code prompt, the DSL checks, and the local playtest flow.

## Project status

Released game content includes two complete worlds:

- World 1, Pasta Plains: **1-1 Farfalle Fields** and **1-2 Penne Ridge**
- World 2, Sushi Shores: **2-1 Nori Narrows** and **2-2 Wasabi Falls**

Worlds 3 through 6 live in `js/experimental/`. They are hidden experimental data. They are not part of the released game, public map, or progression.

This repository does not claim a hosted build, public repository, remote CI run, or Pages deployment.

## Licensing

Original code is under the [MIT License](./LICENSE). Original images and synthesized audio are under [CC BY-NC 4.0](./ASSET-LICENSE.md). The Savoria name and logo are reserved. See [asset licensing](./ASSET-LICENSE.md) and [credits](./CREDITS.md) for the full split.

This is a project licensing choice, not legal advice.

## Credits

See [CREDITS.md](./CREDITS.md), including the retained Three.js notice.
