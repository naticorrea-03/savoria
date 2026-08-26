# Task 7 Report: Pasta Plains Progression

## Status

DONE_WITH_CONCERNS from base commit `aa232c3`.

Planned commit message:

```text
fix: verify Pasta Plains transfers
```

## Authored Courses

### 1-1 Farfalle Fields

```js
[
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
]
```

The course teaches movement and a walking gap before its only enemy. The checkpoint follows the first combined sequence. The run prompt appears before the final run-assisted gap.

### 1-2 Penne Ridge

```js
[
  ['run', 10, { coins: 4, tutorial: 'move', deco: 'windmill' }],
  ['run', 4, { tutorial: 'jump' }],
  ['gap', 4, { arc: 5 }],
  ['run', 12, { enemy: 'meatball', tutorial: 'stomp' }],
  ['gap', 5, { mover: 1, safeGround: true, period: 4 }],
  ['run', 4],
  ['steps', 3],
  ['run', 12, { coins: 4, tutorial: 'run' }],
  ['gap', 6.5, { arc: 5, requiresRun: true }],
  ['checkpoint', 0],
  ['river', 10],
  ['blocks', 3, { enemy: 'meatball' }],
  ['gap', 7.5, { mover: 1, arc: 5, requiresRun: true, period: 5 }],
  ['run', 5],
  ['pillars', 3],
  ['goal', 0],
]
```

The safe mover starts at `x = 30`. The sauce mover starts at `x = 100.1`. Recovery ground follows both movers. Three stepped climbs demonstrate tall terrain before the run prompt at `x = 48`. The checkpoint at `x = 69.5` precedes the longer nine-jump combined sequence.

## Compiled Data

- Level 1-1: length `101.1`, checkpoint `[56.1, 0.2, 0]`, goal `[96.1, 0, 0]`, 24 tomatoes, 240 seconds.
- Level 1-2: length `148.6`, checkpoint `[69.5, 4.4, 0]`, goal `[143.6, 6.5, 0]`, 33 tomatoes, 280 seconds.
- Released IDs remain `1-1` and `1-2`.
- Save data and progression interfaces did not change.
- The compiler emits neutral `tutorials` and 21 complete `requiredJumps` transfers.
- Each session owns a fresh tutorial set. Each prompt emits once per course.
- Exact prompt copy is `Move`, `Jump`, `Hold Shift to run`, and `Stomp from above`.

## Measured Movement and Margins

The deterministic simulator steps `stepPlayerMotion()` at 60 Hz. It reaches steady speed before takeoff and holds the jump through landing.

- Walking same-height trajectory: `5.880` units.
- Running same-height trajectory: `8.657` units.
- Level 1-1 minimum landing margin: `2.380` units.
- Level 1-2 minimum landing margin: `1.880` units.
- Required minimum: `0.500` units.
- Unreachable required jumps: `0`.

The longest fixed gap is Penne Ridge's `6.5` unit run jump. Its measured margin is `2.157` units. Mover analysis solves the exact worst takeoff phase using actual width, travel, period, rise, and landing time. The sauce mover's worst board and exit edge gaps are `3.800` units. Its landing margins are `3.400` and `4.857` units. Each 1.4 unit step rise is checked against the descending jump trajectory and retains a 3 unit landing surface.

## TDD Evidence

Initial RED command:

```sh
node --test tests/unit/world-one-simulation.test.js
```

Result: 0 passed and 6 failed. Compiled levels had no `requiredJumps` or `tutorials`, and `GameSession` had no one-shot tutorial method.

Initial GREEN command:

```sh
node --test tests/unit/world-one-simulation.test.js
```

Result: 6 passed and 0 failed after adding compiled metadata, authored recipes, reachability analysis, and session prompts.

The keyboard traversal then exposed an unreachable `3.4` unit pillar in Penne Ridge's timed runway. A regression test was added first.

Focused pillar RED result: 8 passed and 1 failed. The failure printed the blocking pillar at `x = 50`.

Focused pillar GREEN result: 9 passed and 0 failed after removing the blocker. The stepped terrain remains before the timed run.

Final unit command:

```sh
npm run test:unit
```

Result after the initial implementation: 41 passed and 0 failed.

### Fix round 1

Reviewer tests were written before the production fix. The first focused RED run passed 10 tests and failed 5. Failures covered missing mover mechanics, the omitted pillar exit, incomplete transfer counts, and late jump prompts.

A later landing-surface RED run passed 15 tests and failed 1. It exposed that both movers exited directly into raised terrain without an authored recovery bank.

Focused GREEN command:

```sh
node --test tests/unit/world-one-simulation.test.js
```

Result: 16 passed and 0 failed after adding recovery ground, vertical trajectory evidence, phase-aware mover evidence, the pillar exit, safe prompt timing, and real session progression tests.

Final full unit result: 48 passed and 0 failed.

## Real Browser Results

A real local Chrome process ran at 1440 by 900. Playwright used actual key-down and key-up durations against `http://127.0.0.1:8977/play/`.

- 700 ms walk from rest: `5.255` units.
- 700 ms run from rest: `5.756` units.
- 35 ms short jump: `2.855` units traveled and `0.850` units peak height.
- 650 ms walking jump: `5.495` units traveled and `1.742` units peak height.
- 650 ms run-assisted jump: `7.699` units traveled and `1.625` units peak height.
- Farfalle's Jump prompt appeared at `x = 12.055`, on ground and 5.945 units before takeoff.
- Penne's Jump prompt appeared at `x = 10.135`, on ground and 3.865 units before takeoff.
- The safe mover carried the grounded player from `x = 32.165` to `32.715` with 3 hearts.
- The sauce mover carried the grounded player from `x = 102.479` to `103.923` with 3 hearts.
- All three river transfers landed on their intended surface with 3 hearts.
- All three 1.4 unit steps landed at heights `1.4`, `2.8`, and `4.2`.
- All four pillar transfers landed at heights `5.4`, `6.5`, `7.6`, and `6.5`.
- Missed stomp: normal collision reduced hearts from 3 to 2 and applied rebound.
- Death: crossing `killY` with one heart set hearts to 0 and finished the session.
- Checkpoint respawn: Penne Ridge death after checkpoint returned the player to `x = 69.5` with 2 hearts.
- Both `1-1` and `1-2` goal collisions produced the visible `Course Clear!` overlay.
- Savoria console warnings and errors: 0.
- External requests: 0.

Headless Chrome emitted four known SwiftShader `GPU stall due to ReadPixels` warnings. They came from Chrome's software WebGL driver, not Savoria code.

## Self-Review

- Confirmed movement prompts precede the first enemy in both courses.
- Confirmed walking jumps precede every run-assisted jump.
- Confirmed Penne Ridge's run prompt precedes every required run jump.
- Confirmed a safe mover appears before the sauce mover.
- Confirmed the timed runway is clear after the browser-found pillar fix.
- Confirmed the checkpoint precedes Penne Ridge's longest combined sequence.
- Confirmed every fixed landing maps to an authored collision surface.
- Confirmed all 5 Farfalle and 16 Penne Ridge mandatory transfers are represented.
- Confirmed mover mutations fail at an unsafe sampled phase or invalid period.
- Confirmed an unsafe 3.5 unit step rise fails the actual jump trajectory.
- Confirmed tutorial duplicates stay suppressed after checkpoint respawn and reset in a fresh session.
- Confirmed all required jumps retain more than the 0.5 unit margin.
- Confirmed tutorial state belongs to the session lifecycle.
- Confirmed no texture ownership, renderer disposal, save schema, released scope, or movement constants changed.
- Confirmed no external URLs, dependencies, analytics, CDNs, or requests were added to the game.

## Concerns

Automation cannot prove human feel. A simple continuous run-and-jump driver reached `x = 89.593` in 1-1 and `x = 108.716` in 1-2, but it could not vary takeoff timing, wait for mover phases, or select short versus held jumps. It did not finish either course. Both completion handlers were verified separately through normal goal collision after placing the player at each goal with the existing test hook. A human keyboard pass through every obstacle remains the exact unverified judgment.
