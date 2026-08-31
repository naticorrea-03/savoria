import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourseSimulation, stepCourseSimulation } from '../../js/gameplay/course-simulation.js';
import { MultiplayerRunLoop } from '../../js/multiplayer/run-loop.js';

function view({
  tick = 1,
  accepted = 0,
  localX = 0,
  remoteX = 8,
  phase = 'playing',
  isHost = true,
  pauseReason = '',
  snapRevision = 0,
  snapReason = '',
} = {}) {
  return {
    phase,
    pauseReason,
    isHost,
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
        snapRevision,
        snapReason,
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

class LoopbackAuthority {
  constructor() {
    this.now = 0;
    this.nextSimulationAt = 1000 / 60;
    this.nextPatchAt = 50;
    this.nextPatchNumber = 0;
    this.connected = false;
    this.firstPatchReceived = false;
    this.rejectedTicks = 0;
    this.maxPendingInputs = 0;
    this.latestInput = neutralInput();
    this.acceptedInputCount = 0;
    this.outbound = [];
    this.inbound = [];
    this.lastCorrectionAt = null;
    this.simulation = createCourseSimulation({
      level: loopbackLevel(),
      seed: 'loopback-rtt',
      players: [
        { playerId: 'local', characterId: 'fatsio' },
        { playerId: 'remote', characterId: 'chefno' },
      ],
    });
    this.loop = new MultiplayerRunLoop({
      sendInput: (controls) => this.outbound.push({
        controls,
        deliverAt: this.now + 75,
      }),
      onPresentation: (presentation) => { this.presentation = presentation; },
    });
  }

  get pendingInputCount() {
    return this.loop.pendingInputCount;
  }

  get authoritativePosition() {
    const player = this.simulation.players.local;
    return { x: player.positionX, y: player.positionY, z: player.positionZ };
  }

  connect() {
    this.connected = true;
    this.deliverView(this.view());
  }

  drop() {
    this.connected = false;
    this.outbound = [];
    this.inbound = [];
    this.loop.reset();
  }

  reconnect() {
    this.connected = true;
    this.deliverView(this.view());
  }

  press(code) {
    this.loop.press(code);
  }

  release(code) {
    this.loop.release(code);
  }

  advanceTo(target) {
    for (this.now += 1; this.now <= target; this.now += 1) {
      this.loop.advance(this.now);
      this.maxPendingInputs = Math.max(this.maxPendingInputs, this.loop.pendingInputCount);
      this.deliverOutbound();
      while (this.now + Number.EPSILON >= this.nextSimulationAt) {
        stepCourseSimulation(this.simulation, {
          local: this.latestInput,
          remote: neutralInput(),
        }, 1 / 60);
        this.nextSimulationAt += 1000 / 60;
      }
      while (this.now + Number.EPSILON >= this.nextPatchAt) {
        this.queuePatch();
        this.nextPatchAt += 50;
      }
      this.deliverInbound();
    }
  }

  correctionOffsetAt(milliseconds) {
    const prediction = this.loop.localPrediction;
    const sample = prediction.sample(this.lastCorrectionAt + milliseconds);
    return Math.abs(sample.x - prediction.predicted.x)
      + Math.abs(sample.y - prediction.predicted.y)
      + Math.abs(sample.z - prediction.predicted.z);
  }

  deliverOutbound() {
    if (!this.connected) return;
    const delivered = this.outbound.filter(({ deliverAt }) => deliverAt <= this.now);
    this.outbound = this.outbound.filter(({ deliverAt }) => deliverAt > this.now);
    for (const message of delivered) {
      this.latestInput = message.controls;
      this.acceptedInputCount += 1;
    }
  }

  queuePatch() {
    if (!this.connected) return;
    this.nextPatchNumber += 1;
    const delay = this.nextPatchNumber === 2 ? 175 : 75;
    this.inbound.push({ view: this.view(), deliverAt: this.now + delay });
  }

  deliverInbound() {
    if (!this.connected) return;
    const delivered = this.inbound
      .filter(({ deliverAt }) => deliverAt <= this.now)
      .sort((left, right) => left.deliverAt - right.deliverAt);
    this.inbound = this.inbound.filter(({ deliverAt }) => deliverAt > this.now);
    for (const patch of delivered) this.deliverView(patch.view);
  }

  deliverView(next) {
    const applied = this.loop.updateState(next, this.now);
    if (this.firstPatchReceived && !applied) this.rejectedTicks += 1;
    if (applied && next.authoritativeTick > 0) {
      this.firstPatchReceived = true;
      this.lastCorrectionAt = this.now;
    }
  }

  view() {
    const local = this.simulation.players.local;
    const remote = this.simulation.players.remote;
    return {
      phase: this.simulation.phase,
      pauseReason: '',
      isHost: true,
      authoritativeTick: this.simulation.tick,
      players: [
        playerView('local', local, true, this.acceptedInputCount),
        playerView('remote', remote, false, 0),
      ],
    };
  }
}

function playerView(sessionId, player, isLocal, acceptedInputCount) {
  return {
    sessionId,
    guestName: sessionId,
    characterId: player.characterId,
    color: '#111111',
    isLocal,
    connected: true,
    acceptedInputCount,
    position: { x: player.positionX, y: player.positionY, z: player.positionZ },
  };
}

function neutralInput() {
  return { axis: 0, running: false, jumpPressed: false, jumpHeld: false };
}

function loopbackLevel() {
  return {
    id: 'loopback',
    spawn: [0, 0, 0],
    boxes: [[0, -0.5, 0, 200, 1, 4, 'ground']],
    movers: [],
    hazards: [],
    coins: [],
    items: [],
    enemies: [],
    checkpoint: null,
    goal: null,
    boss: null,
    killY: -20,
    time: 240,
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

test('a new authoritative snap revision bypasses correction smoothing once', () => {
  let presentation;
  const loop = new MultiplayerRunLoop({
    sendInput: () => {},
    onPresentation: (next) => { presentation = next; },
  });
  loop.updateState(view({ localX: 0 }), 1_000);
  loop.press('ArrowRight');
  loop.advance(1_000);
  loop.advance(1_017);
  loop.updateState(view({ tick: 2, accepted: 1, localX: 8, snapRevision: 1, snapReason: 'door' }), 1_020);

  assert.equal(presentation.local.position.x, 8);
  loop.updateState(view({ tick: 3, accepted: 1, localX: 4, snapRevision: 1, snapReason: 'door' }), 1_030);
  assert.equal(presentation.local.position.x, 8);
  loop.release('ArrowRight');
  loop.advance(1_095);
  assert.equal(presentation.local.position.x, 4);
});

test('running loop ignores a reordered authoritative room tick', () => {
  const sent = [];
  let presentation;
  const loop = new MultiplayerRunLoop({
    sendInput: (input) => sent.push(input),
    onPresentation: (next) => { presentation = next; },
  });
  loop.updateState(view({ tick: 10, localX: 4, remoteX: 12 }), 1_000);
  loop.updateState(view({
    tick: 9,
    phase: 'paused',
    localX: 99,
    remoteX: 99,
  }), 1_050);
  loop.press('ArrowRight');
  loop.advance(1_050);
  loop.advance(1_067);

  assert.notEqual(presentation.local.position.x, 99);
  assert.notEqual(presentation.players.find(({ isLocal }) => !isLocal).position.x, 99);
  assert.equal(sent.length, 1);
});

test('loopback authority keeps production input prediction stable across 150 ms RTT, reordering, and reconnect', () => {
  const harness = new LoopbackAuthority();

  harness.connect();
  harness.press('ArrowRight');
  harness.advanceTo(18);

  assert.ok(harness.presentation.local.position.x > 0);
  assert.equal(harness.firstPatchReceived, false);
  assert.ok(harness.pendingInputCount > 0);

  harness.advanceTo(300);
  assert.equal(harness.firstPatchReceived, true);
  assert.ok(harness.maxPendingInputs <= 18, String(harness.maxPendingInputs));
  assert.ok(harness.rejectedTicks >= 1);

  harness.drop();
  assert.equal(harness.pendingInputCount, 0);
  harness.advanceTo(380);
  harness.reconnect();
  harness.advanceTo(660);
  harness.release('ArrowRight');
  harness.advanceTo(940);

  assert.ok(harness.pendingInputCount <= 6, String(harness.pendingInputCount));
  assert.ok(harness.loop.lastView.players.find(({ isLocal }) => isLocal).acceptedInputCount > 0);
  assert.equal(harness.correctionOffsetAt(65), 0);
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

test('only the host requests one automatic resume after both players reconnect', () => {
  let hostResumes = 0;
  let guestResumes = 0;
  const hostLoop = new MultiplayerRunLoop({
    sendInput: () => {},
    requestResume: () => { hostResumes += 1; },
  });
  const guestLoop = new MultiplayerRunLoop({
    sendInput: () => {},
    requestResume: () => { guestResumes += 1; },
  });
  const hostPaused = view({ tick: 2, phase: 'paused', isHost: true, pauseReason: 'disconnect' });
  const guestPaused = view({ tick: 2, phase: 'paused', isHost: false, pauseReason: 'disconnect' });

  hostLoop.updateState(hostPaused, 1_000);
  guestLoop.updateState(guestPaused, 1_000);
  hostLoop.updateState(hostPaused, 1_010);
  guestLoop.updateState(guestPaused, 1_010);

  assert.equal(hostResumes, 1);
  assert.equal(guestResumes, 0);
});

test('a deliberate host pause stays paused until the host resumes it', () => {
  let resumes = 0;
  const loop = new MultiplayerRunLoop({
    sendInput: () => {},
    requestResume: () => { resumes += 1; },
  });

  loop.updateState(view({
    tick: 2,
    phase: 'paused',
    isHost: true,
    pauseReason: 'host',
  }), 1_000);

  assert.equal(resumes, 0);
  assert.equal(loop.authorityPlaying, false);
});

test('pause snaps to authority and discards in-flight prediction before clean resume', () => {
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
  assert.equal(loop.pendingInputCount, 1);

  loop.updateState(view({ tick: 2, phase: 'paused', accepted: 0, localX: 4 }), 1_020);

  assert.equal(loop.pendingInputCount, 0);
  assert.equal(presentation.local.position.x, 4);
  loop.updateState(view({ tick: 3, accepted: 0, localX: 4 }), 1_030);
  loop.press('ArrowRight');
  loop.advance(1_030);
  loop.advance(1_047);
  assert.equal(loop.pendingInputCount, 1);
  assert.equal(sent.length, 2);

  loop.updateState(view({ tick: 4, accepted: 1, localX: 4.12 }), 1_060);
  assert.equal(loop.pendingInputCount, 0);
});
