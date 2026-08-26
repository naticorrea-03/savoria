# Savoria

Savoria is a desktop food platformer. Choose a chef, cross Pasta Plains, collect tomatoes, and clear two hand-built courses.

## Play

The game route is [`/play/`](./play/). It is not hosted or published from this repository yet. Run it locally first:

```bash
python3 serve.py
```

Open <http://127.0.0.1:8977/>. Use a desktop browser at least 900 by 620 pixels.

Controls: A/D or Left/Right to move, Shift to run, Space or Up to jump, and Escape to pause.

## Why the browser build

Savoria began as a Godot project. That work shaped the game art and direction. The current browser build makes a course easy to review, run locally, and change through a compact level recipe. Both versions are part of the project story.

## How levels work

A level is data. `js/levels/validate.js` checks the recipe, `js/levels/compiler.js` turns it into neutral game data, and the runtime renders it.

World 1 definitions live in [`js/levels/world-one.js`](./js/levels/world-one.js). This is a valid compact recipe in that file:

```js
level(1, 3, 'Your Course', 'pasta', 240, [
  ['run', 18, { coins: 5 }],
  ['gap', 3, { arc: 4 }],
  ['checkpoint', 0],
  ['goal', 0],
]);
```

Supported primitives are `run`, `gap`, `rise`, `steps`, `river`, `plats`, `roll`, `blocks`, `tier`, `pillars`, `bonus`, `checkpoint`, `goal`, and `boss`.

## Local setup

Runtime play needs no build step. Tests need Node and the package dependencies.

```bash
npm install
npm test
npm run test:browser
```

`npm test` includes validator, compiler, and World 1 reachability coverage. `npm run test:browser` starts `python3 serve.py` when no local server is already running.

## Architecture

- `index.html` is the landing page.
- `play/index.html` is the game shell.
- `js/levels/` contains the level DSL, validation, compiler, themes, and released World 1 data.
- `js/core/`, `js/gameplay/`, and `js/ui/` own rendering, game rules, and screens.
- `tests/unit/` covers game logic and level reachability. `tests/browser/` covers the desktop flow.

## Contribute

Start with [the contribution guide](./CONTRIBUTING.md). It includes a copyable Claude Code prompt, the DSL checks, and the local playtest flow.

## Project status

Released game content is World 1, Pasta Plains: **1-1 Farfalle Fields** and **1-2 Penne Ridge**. The release registry contains only those levels.

Worlds 2 through 6 live in `js/experimental/`. They are hidden experimental data. They are not part of the released game, public map, or progression.

This repository does not claim a hosted build, public repository, remote CI run, or Pages deployment.

## Licensing

Original code is under the [MIT License](./LICENSE). Original images and synthesized audio are under [CC BY-NC 4.0](./ASSET-LICENSE.md). The Savoria name and logo are reserved. See [asset licensing](./ASSET-LICENSE.md) and [credits](./CREDITS.md) for the full split.

This is a project licensing choice, not legal advice.

## Credits

See [CREDITS.md](./CREDITS.md), including the retained Three.js notice.
