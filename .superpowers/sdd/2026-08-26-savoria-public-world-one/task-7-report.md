# Task 7 Report: Pasta Plains Progression

## Status

DONE_WITH_CONCERNS from base commit `aa232c3`.

Planned commit message:

```text
feat: polish Pasta Plains progression
```

## Authored Courses

### 1-1 Farfalle Fields

```js
[
  ['run', 18, { coins: 5, tutorial: 'move', deco: 'cypress' }],
  ['gap', 3.5, { arc: 5, tutorial: 'jump' }],
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
  ['run', 14, { coins: 4, tutorial: 'move', deco: 'windmill' }],
  ['gap', 4, { arc: 5, tutorial: 'jump' }],
  ['run', 12, { enemy: 'meatball', tutorial: 'stomp' }],
  ['gap', 5, { mover: 1, safeGround: true, period: 4 }],
  ['steps', 3],
  ['run', 12, { coins: 4, tutorial: 'run' }],
  ['gap', 6.5, { arc: 5, requiresRun: true }],
  ['checkpoint', 0],
  ['river', 10],
  ['blocks', 3, { enemy: 'meatball' }],
  ['gap', 7.5, { mover: 1, arc: 5, requiresRun: true, period: 5 }],
  ['pillars', 3],
  ['goal', 0],
]
```

The safe mover starts at `x = 30`. The sauce mover starts at `x = 96.1`. Three stepped climbs demonstrate tall terrain before the run prompt at `x = 44`. The checkpoint at `x = 65.5` precedes the longer eight-jump combined sequence.

## Compiled Data

- Level 1-1: length `101.1`, checkpoint `[56.1, 0.2, 0]`, goal `[96.1, 0, 0]`, 24 tomatoes, 240 seconds.
- Level 1-2: length `139.6`, checkpoint `[65.5, 4.4, 0]`, goal `[134.6, 6.5, 0]`, 33 tomatoes, 280 seconds.
- Released IDs remain `1-1` and `1-2`.
- Save data and progression interfaces did not change.
- The compiler emits neutral `tutorials` and `requiredJumps` data.
- Each session owns a fresh tutorial set. Each prompt emits once per course.
- Exact prompt copy is `Move`, `Jump`, `Hold Shift to run`, and `Stomp from above`.

## Measured Movement and Margins

The deterministic simulator steps `stepPlayerMotion()` at 60 Hz. It reaches steady speed before takeoff and holds the jump through landing.

- Walking jump capability: `6.000` units.
- Running jump capability: `8.833` units.
- Level 1-1 minimum landing margin: `2.500` units.
- Level 1-2 minimum landing margin: `2.000` units.
- Required minimum: `0.500` units.
- Unreachable required jumps: `0`.

The longest fixed gap is Penne Ridge's `6.5` unit run jump. Its measured margin is `2.333` units. The sauce mover divides its `7.5` unit crossing into two `2.05` unit transfers.

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

Result: 41 passed and 0 failed.

## Real Browser Results

A real local Chrome process ran at 1440 by 900. Playwright used actual key-down and key-up durations against `http://127.0.0.1:8977/play/`.

- 700 ms walk from rest: `5.255` units.
- 700 ms run from rest: `5.756` units.
- 35 ms short jump: `2.855` units traveled and `0.850` units peak height.
- 650 ms walking jump: `5.495` units traveled and `1.742` units peak height.
- 650 ms run-assisted jump: `7.699` units traveled and `1.625` units peak height.
- Missed stomp: normal collision reduced hearts from 3 to 2 and applied rebound.
- Death: crossing `killY` with one heart set hearts to 0 and finished the session.
- Checkpoint respawn: death after checkpoint returned the player to `x = 56.1` with 2 hearts.
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
- Confirmed all required jumps retain more than the 0.5 unit margin.
- Confirmed tutorial state belongs to the session lifecycle.
- Confirmed no texture ownership, renderer disposal, save schema, released scope, or movement constants changed.
- Confirmed no external URLs, dependencies, analytics, CDNs, or requests were added to the game.

## Concerns

Automation cannot prove human feel. A simple continuous run-and-jump driver reached `x = 89.59` in 1-1 and `x = 63.26` in 1-2, but it could not model deliberate takeoff timing and did not finish either course. Both completion handlers were verified separately through normal goal collision after placing the player at each goal with the existing test hook. A human keyboard pass through every obstacle remains the exact unverified judgment.
