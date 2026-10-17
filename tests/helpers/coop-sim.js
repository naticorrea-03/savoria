import {
  createCourseSimulation,
  createCourseSnapshot,
  stepCourseSimulation,
} from '../../js/gameplay/course-simulation.js';
import { MultiplayerRunLoop } from '../../js/multiplayer/run-loop.js';

const TICK_MS = 1000 / 60;
const PATCH_EVERY_TICKS = 3;

function toView(snapshot, localId, acceptedByPlayer) {
  return {
    phase: snapshot.phase,
    pauseReason: '',
    isHost: true,
    authoritativeTick: snapshot.tick,
    movingPlatforms: snapshot.movingPlatforms.map((platform) => ({
      id: platform.id,
      position: { x: platform.positionX, y: platform.positionY, z: platform.positionZ },
      width: platform.width,
      height: platform.height,
      depth: platform.depth,
    })),
    players: Object.values(snapshot.players).map((player) => ({
      sessionId: player.playerId,
      isLocal: player.playerId === localId,
      acceptedInputCount: acceptedByPlayer[player.playerId] ?? 0,
      snapRevision: player.snapRevision,
      snapReason: player.snapReason,
      position: { x: player.positionX, y: player.positionY, z: player.positionZ },
      velocity: { x: player.velocityX, y: player.velocityY, z: 0 },
      grounded: player.grounded,
      coyote: player.coyote,
      jumpBuffer: player.jumpBuffer,
      airJumpsRemaining: player.airJumpsRemaining,
      facing: player.facing,
      groundMoverId: player.groundMoverId,
      width: player.width,
      height: player.height,
      depth: player.depth,
      power: player.power ?? null,
      active: true,
    })),
  };
}

/**
 * Runs a server simulation (60 Hz, 20 Hz patches) against a real client run loop
 * with symmetric network latency. `script(timeMs)` returns the local controls.
 * Returns per-frame samples and per-reconcile correction sizes.
 */
export function runCoopSession({
  level,
  seconds = 10,
  latencyMs = 40,
  frameHz = 60,
  startOnMover = null,
  script = () => ({}),
  // Real rooms are uneven: patches arrive late or bunched and frames hitch.
  // patchJitterMs adds 0..n ms to each patch, hitchEveryMs drops a frame
  // budget of hitchMs now and then. Both use a fixed seed.
  patchJitterMs = 0,
  hitchEveryMs = 0,
  hitchMs = 45,
}) {
  let seed = 0x2f6e2b1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const localId = 'local';
  const server = createCourseSimulation({
    level,
    seed: 'coop-sim',
    players: { local: { characterId: 'fatsio' }, remote: { characterId: 'dinnerette' } },
  });
  if (startOnMover !== null) {
    const platform = server.movingPlatforms[startOnMover];
    const player = server.players.local;
    player.positionX = platform.positionX;
    player.positionY = platform.aabb.maxY;
    player.grounded = true;
    player.groundMoverId = platform.id;
    const other = server.players.remote;
    other.positionX = platform.positionX - 0.8;
    other.positionY = platform.aabb.maxY;
    other.grounded = true;
    other.groundMoverId = platform.id;
  }

  const accepted = { local: 0, remote: 0 };
  const latest = { local: { axis: 0, running: false, jumpPressed: false, jumpHeld: false }, remote: { axis: 0, running: false, jumpPressed: false, jumpHeld: false } };
  const toServer = [];
  const toClient = [];
  let clock = 0;
  const runLoop = new MultiplayerRunLoop({
    sendInput: (controls) => toServer.push({ at: clock + latencyMs, controls: { ...controls } }),
    requestFrame: () => 0,
    cancelFrame: () => {},
    inputTarget: { addEventListener() {}, removeEventListener() {} },
    level,
  });
  const frameMs = 1000 / frameHz;
  let nextFrame = 0;
  let nextTick = 0;
  let tick = 0;
  const corrections = [];
  const samples = [];
  const originalReconcile = runLoop.localPrediction?.reconcile;
  let wrapped = false;
  const totalMs = seconds * 1000;

  const publishPatch = () => {
    const snapshot = createCourseSnapshot(server);
    const at = clock + latencyMs + random() * patchJitterMs;
    // Keep delivery in order, the way one WebSocket does.
    const last = toClient.at(-1)?.at ?? 0;
    toClient.push({ at: Math.max(at, last), view: toView(snapshot, localId, { ...accepted }), snapshot });
  };
  publishPatch();

  for (clock = 0; clock <= totalMs; clock += 0.5) {
    while (toServer.length && toServer[0].at <= clock) {
      const { controls } = toServer.shift();
      latest.local = { ...controls, jumpPressed: latest.local.jumpPressed || controls.jumpPressed };
      accepted.local += 1;
    }
    while (nextTick <= clock) {
      stepCourseSimulation(server, latest, 1 / 60);
      latest.local = { ...latest.local, jumpPressed: false };
      tick += 1;
      nextTick += TICK_MS;
      if (tick % PATCH_EVERY_TICKS === 0) publishPatch();
    }
    while (toClient.length && toClient[0].at <= clock) {
      const { view } = toClient.shift();
      runLoop.updateState(view, clock);
      if (runLoop.localPrediction && !wrapped) {
        wrapped = true;
        const prediction = runLoop.localPrediction;
        const reconcile = prediction.reconcile.bind(prediction);
        prediction.reconcile = (authoritative, ack, options) => {
          const before = prediction.predicted;
          const result = reconcile(authoritative, ack, options);
          const replayed = prediction.predicted;
          corrections.push(Math.hypot(before.x - replayed.x, before.y - replayed.y));
          return result;
        };
      }
    }
    if (clock >= nextFrame) {
      nextFrame += frameMs;
      if (hitchEveryMs > 0 && random() < frameMs / hitchEveryMs) nextFrame += hitchMs;
      const held = script(clock);
      for (const code of ['ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft']) runLoop.release(code);
      if (held.axis < 0) runLoop.press('ArrowLeft');
      if (held.axis > 0) runLoop.press('ArrowRight');
      if (held.jump) runLoop.press('Space');
      runLoop.advance(clock);
      if (runLoop.presentation) {
        samples.push({
          at: clock,
          presentation: runLoop.presentation,
          platforms: runLoop.presentation.movingPlatforms ?? runLoop.lastView.movingPlatforms,
          server: createCourseSnapshot(server),
        });
      }
    }
  }
  return { samples, corrections, server, runLoop };
}
