# Savoria Free Open-Source Online Co-op

## Goal

Add private two-player online co-op beside the existing offline solo game.
Use plain JavaScript, Colyseus, free Render hosting, and Docker. Keep the
browser client build-free. Exclude Supabase, accounts, paid services, public
matchmaking, chat, databases, and proprietary backend dependencies.

## Global constraints

- Solo Adventure remains the primary action and works through `python3 serve.py`.
- Online supports exactly two desktop-browser players in private invite rooms.
- Worlds 1 and 2, containing four released courses, are supported.
- Worlds 3 through 6 stay visible and locked.
- Use native ES modules in the browser.
- Use Node 22 with `colyseus@0.18.5`, `@colyseus/sdk@0.18.2`,
  `@colyseus/schema@5.0.25`, `@colyseus/testing@0.18.5`, and
  `@colyseus/loadtest@0.18.2`.
- Vendor the browser SDK and its license in `vendor/`.
- One Node process serves the site, `/health`, and WebSockets.
- Keep room state in memory and require no secrets.
- Simulate authoritatively at 60 Hz and patch state at 20 Hz.
- Use local prediction, 100 ms remote interpolation, and 65 ms correction
  smoothing. Respawns, doors, and checkpoints snap immediately.
- Never reduce local campaign progress after co-op completion.
- Use seeded randomness for gameplay decisions.

## Required shared interfaces

```js
createCourseSimulation({ level, seed, players })
stepCourseSimulation(state, inputsByPlayer, seconds)
createPlayerState({ playerId, characterId, spawn })
applyPlayerInput(player, input, world, seconds)
createCourseSnapshot(state)
```

Network input:

```js
{
  axis: -1 | 0 | 1,
  running: boolean,
  jumpPressed: boolean,
  jumpHeld: boolean
}
```

Room state must expose phase, protocol version, host, selected level, shared
timer, shared tomato count, shared checkpoint, players, enemies, projectiles,
collectibles, moving platforms, and boss state.

### Task 1: Shared deterministic gameplay

- Add plain-JavaScript simulation state under `js/gameplay/` using the required
  interfaces.
- Reuse the existing player movement rules on client and server.
- Represent enemy, collectible, hazard, checkpoint, goal, projectile, moving
  platform, and boss decisions without Three.js objects.
- Preserve the existing level DSL and collision coordinates.
- Replace random gameplay timing with a seeded generator.
- Keep particles, sounds, decorations, and render animations client-side.
- Route solo movement through the same shared player-input implementation.
- Add deterministic, collision, checkpoint, goal, team-failure, and save
  compatibility tests.

### Task 2: Authoritative Colyseus server and private rooms

- Add the exact dependencies and scripts, plus `server/` JavaScript modules.
- Serve static files, `/health`, and Colyseus from one process.
- Generate unique six-character codes from
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` through presence-backed reservations.
- Limit rooms to two players. Reject public listings, third players, invalid
  codes, protocol mismatches, and new joins after play begins.
- Add create, join, ready, host-only course selection, start, input, pause,
  resume, and leave messages with validation and rate limits.
- Run the shared simulation at 60 Hz and state patches at 20 Hz.
- Pause for disconnects and allow a 60-second reconnection window.
- Restore the same player state on reconnect. Cancel after expiry, return the
  connected player to the lobby, promote them when needed, and dispose empty
  rooms.
- Add room, protocol, input, reconnect, cancellation, host-reassignment, and
  ten-room tests.

### Task 3: Browser lobby and multiplayer client

- Add Solo Adventure and Online Co-op actions to the home screen.
- Add accessible create-room and join-room controls.
- Support `/play/?room=ABC123`, local guest names, and stable local player IDs.
- Allow duplicate characters with colored rings and nameplates.
- Show the private room code, host course controls, and two ready states.
- Add Colyseus connection code under `js/multiplayer/` using the vendored SDK.
- Implement immediate local prediction, 100 ms remote interpolation, and 65 ms
  authoritative correction smoothing.
- Reset prediction buffers on reconnect and show expired-room recovery.
- Keep the local camera on the local player.

### Task 4: Co-op course behavior and persistence

- Give each player three hearts and four individual lives.
- Disable player-to-player collision.
- Share tomatoes and checkpoint progress.
- Make basil and timed powers collector-only.
- Target the nearest active player with enemies.
- Let projectiles and hazards damage either player.
- Respawn players individually at the shared checkpoint.
- Fail the team when either player reaches zero lives.
- Make the first goal player safe while waiting. Complete after both arrive.
- Calculate stars from shared tomatoes and require both players to finish with
  two hearts for the survival star.
- Let only the host pause globally. Escape leaves for guests.
- After completion, call the existing local completion logic in both browsers.
  Saves may gain stars and unlocks, but never lose progress.
- Add two-context browser coverage for independent chefs, shared and local
  pickups, checkpoint respawns, goals, failure, pause, reconnect, recovery,
  and progress.

### Task 5: Open-source packaging and hosting

- Add `npm start` for the combined app.
- Keep `python3 serve.py` for offline solo development.
- Add a provider-neutral Node 22 Dockerfile and `.dockerignore`.
- Add a free `render.yaml` template with Render config outside gameplay code.
- Add health-check coverage.
- Document Render sleeping, restart, quota, and in-memory-room limitations.
- Document Docker deployment on a Node-capable host.
- Add architecture, protocol, testing, and contribution guidance.
- Credit and preserve licenses for all added packages.

### Task 6: End-to-end acceptance and hardening

- Run all existing and new unit, server, browser, and multiplayer tests.
- Exercise every released course with two independent browser contexts.
- Simulate 150 ms round-trip latency, delayed inputs, disconnects, reordered
  snapshots, forced shutdown, and ten simultaneous two-player rooms.
- Verify immediate local response, bounded reconciliation, single-consumption
  collectibles, single completion events, and five-minute deterministic sync.
- Verify keyboard access, no browser console errors, and no solo regressions.
- Verify a Docker health check.
- Prepare a free Render two-browser smoke test, but do not publish externally
  without explicit approval and valid account access.

## Acceptance boundary

Local implementation is complete only after the repository tests, two-browser
tests, rendered browser QA, and Docker health check pass. A Render deployment
is a separate external release step and requires explicit approval.
