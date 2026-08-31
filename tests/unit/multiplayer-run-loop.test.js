import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRunLoop } from '../../js/multiplayer/run-loop.js';

function view({ tick = 1, accepted = 0, localX = 0, remoteX = 8 } = {}) {
  return {
    phase: 'playing',
    authoritativeTick: tick,
    players: [
      {
        sessionId: 'local',
        guestName: 'Nati',
        characterId: 'fatsio',
        color: '#111111',
        isLocal: true,
        connected: true,
        acceptedInputCount: accepted,
        position: { x: localX, y: 2, z: 0 },
      },
      {
        sessionId: 'remote',
        guestName: 'Alex',
        characterId: 'fatsio',
        color: '#222222',
        isLocal: false,
        connected: true,
        acceptedInputCount: 0,
        position: { x: remoteX, y: 2, z: 0 },
      },
    ],
  };
}

test('running loop sends exact input, predicts locally, and follows the local presentation', () => {
  const sent = [];
  let presentation;
  const loop = new MultiplayerRunLoop({
    sendInput: (input) => sent.push(input),
    onPresentation: (next) => { presentation = next; },
  });
  loop.updateState(view(), 1_000);
  loop.press('ArrowRight');

  loop.advance(1_000);
  loop.advance(1_017);

  assert.deepEqual(sent[0], {
    axis: 1,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
  });
  assert.ok(presentation.local.position.x > 0);
  assert.deepEqual(presentation.cameraTarget, presentation.local.position);
  assert.equal(presentation.players.length, 2);
});

test('state acknowledgements retire pending inputs and reconnect reset clears histories', () => {
  let presentation;
  const loop = new MultiplayerRunLoop({
    sendInput: () => {},
    onPresentation: (next) => { presentation = next; },
  });
  loop.updateState(view(), 1_000);
  loop.press('ArrowRight');
  loop.advance(1_000);
  loop.advance(1_017);
  assert.equal(loop.pendingInputCount, 1);

  loop.updateState(view({ tick: 2, accepted: 1, localX: 0.08, remoteX: 9 }), 1_050);
  assert.equal(loop.pendingInputCount, 0);

  loop.reset();
  assert.equal(loop.pendingInputCount, 0);
  assert.equal(loop.remoteSampleCount, 1);
  assert.deepEqual(presentation.cameraTarget, presentation.local.position);
});

test('running loop ignores a reordered authoritative room tick', () => {
  let presentation;
  const loop = new MultiplayerRunLoop({
    sendInput: () => {},
    onPresentation: (next) => { presentation = next; },
  });
  loop.updateState(view({ tick: 10, localX: 4, remoteX: 12 }), 1_000);
  loop.updateState(view({ tick: 9, localX: 99, remoteX: 99 }), 1_050);

  assert.notEqual(presentation.local.position.x, 99);
  assert.notEqual(presentation.players.find(({ isLocal }) => !isLocal).position.x, 99);
});

test('paused room state stops input sends until authority resumes play', () => {
  const sent = [];
  const loop = new MultiplayerRunLoop({ sendInput: (input) => sent.push(input) });
  loop.updateState(view(), 1_000);
  loop.advance(1_000);
  loop.updateState({ ...view({ tick: 2 }), phase: 'paused' }, 1_010);

  loop.advance(1_017);

  assert.equal(sent.length, 0);
});

test('high-refresh presentation never exceeds the sixty hertz input stream', () => {
  const sent = [];
  const loop = new MultiplayerRunLoop({ sendInput: (input) => sent.push(input) });
  loop.updateState(view(), 0);

  for (let now = 0; now <= 1_000; now += 5) loop.advance(now);

  assert.ok(sent.length >= 59, String(sent.length));
  assert.ok(sent.length <= 60, String(sent.length));
});

test('a fully reconnected paused room requests one resume without duplicate messages', () => {
  let resumes = 0;
  const loop = new MultiplayerRunLoop({
    sendInput: () => {},
    requestResume: () => { resumes += 1; },
  });
  const paused = { ...view({ tick: 2 }), phase: 'paused' };

  loop.updateState(paused, 1_000);
  loop.updateState(paused, 1_010);

  assert.equal(resumes, 1);
  loop.updateState(view({ tick: 3 }), 1_020);
  loop.updateState({ ...view({ tick: 4 }), phase: 'paused' }, 1_030);
  assert.equal(resumes, 2);
});
