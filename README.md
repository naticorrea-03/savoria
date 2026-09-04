# Savoria

Savoria is a desktop food platformer. Choose a chef, cross Pasta Plains and Sushi Shores, collect tomatoes, and clear four hand-built courses. Solo play is build-free. Online Co-op adds private two-player rooms with a server-authoritative simulation.

Play the hosted game at [savoria-online-coop.onrender.com](https://savoria-online-coop.onrender.com/).

## Play locally

Install Node 22 dependencies for combined solo and online play:

```bash
npm ci
npm start
```

Open <http://127.0.0.1:2567/>. The combined service hosts the game, WebSockets, and `GET /health`, which returns `{ "ok": true }`.

For offline solo development without Node, keep using:

```bash
python3 serve.py
```

Open <http://127.0.0.1:8977/>. Offline solo does not provide Online Co-op.

Use a desktop browser at least 900 by 620 pixels. Controls: A/D or Left/Right to move, Shift to run, Space or Up to jump, and Escape to pause.

## Online Co-op

Choose **Online Co-op** from the home screen to create a private room or join one with a six-character invite code. Share the resulting private invite link only with the person you want to play with. Rooms are unlisted, accept exactly two browser players, and do not offer public matchmaking or accounts.

The protocol is v1. The server simulates gameplay at 60 Hz and sends state patches at 20 Hz. Each client predicts local movement immediately, renders the other player with 100 ms interpolation, and smooths ordinary authoritative corrections over 65 ms. Respawns, doors, and checkpoints snap immediately.

If a player disconnects, the room pauses. They have 60 seconds to reconnect, then 5 seconds to complete the reconnect handshake. A restart cannot preserve reconnect tokens or active rooms.

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

Runtime play needs no browser build step. Tests need Node 22 and the package dependencies.

```bash
npm ci
npm test
npm run test:browser
```

`npm test` runs unit and server tests, including static hosting and `/health`. `npm run test:browser` starts `python3 serve.py` when no local server is already running.

## Architecture

- `index.html` is the landing page.
- `play/index.html` is the game shell.
- `js/levels/` contains the level DSL, validation, compiler, themes, and released World 1 and World 2 data.
- `js/core/`, `js/gameplay/`, and `js/ui/` own rendering, game rules, and screens.
- `js/multiplayer/` contains protocol v1, lobby, connection, prediction, and interpolation code.
- `server/` provides one Node process for static files, `/health`, WebSockets, private rooms, and the authoritative course simulation.
- `tests/unit/` covers game logic and netcode. `tests/server/` covers rooms, protocol behavior, static hosting, and packaging. `tests/browser/` covers the desktop flow.

## Docker and hosting

Build and run the provider-neutral Node 22 image:

```bash
docker build -t savoria .
docker run --rm -p 2567:2567 savoria
```

Then open <http://127.0.0.1:2567/> and verify <http://127.0.0.1:2567/health>. On another Node-capable host, build this Dockerfile, route its public port to the container port, and let the host set `PORT`. No secrets or database are required.

[`render.yaml`](./render.yaml) manages the free reference deployment at [savoria-online-coop.onrender.com](https://savoria-online-coop.onrender.com/). Free Render services can sleep after inactivity, quotas and plan terms can change, and any deploy or restart erases active in-memory rooms. Reconnect tokens cannot survive a restart. Completed local progress remains in each player's browser.

## Contribute

Start with [the contribution guide](./CONTRIBUTING.md). It includes a copyable Claude Code prompt, the DSL checks, and the local playtest flow.

## Project status

Released game content includes two complete worlds:

- World 1, Pasta Plains: **1-1 Farfalle Fields** and **1-2 Penne Ridge**
- World 2, Sushi Shores: **2-1 Nori Narrows** and **2-2 Wasabi Falls**

Worlds 3 through 6 live in `js/experimental/`. They are hidden experimental data. They are not part of the released game, public map, or progression.

The public repository includes the hosted Render Blueprint and provider-neutral Docker setup.

## Licensing

Original code is under the [MIT License](./LICENSE). Original images and synthesized audio are under [CC BY-NC 4.0](./ASSET-LICENSE.md). The Savoria name and logo are reserved. See [asset licensing](./ASSET-LICENSE.md) and [credits](./CREDITS.md) for the full split.

This is a project licensing choice, not legal advice.

## Credits

See [CREDITS.md](./CREDITS.md), including the retained Three.js and Colyseus SDK notices.
