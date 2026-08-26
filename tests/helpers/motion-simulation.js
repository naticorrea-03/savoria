import { AABB } from '../../js/core/aabb.js';
import {
  createPlayerMotion,
  stepPlayerMotion,
} from '../../js/gameplay/player-motion.js';

const STEP_SECONDS = 1 / 60;
const REQUIRED_LANDING_MARGIN = 0.5;

function measureJump(motion, running) {
  const world = {
    solids: [{ aabb: new AABB(0, -2.5, 0, 2000, 5, 10) }],
  };
  let state = createPlayerMotion({ positionY: 0, grounded: true });

  for (let frame = 0; frame < 180; frame += 1) {
    state = stepPlayerMotion(
      state,
      { axis: 1, running, jumpHeld: true },
      world,
      STEP_SECONDS,
      motion,
    );
  }

  const takeoffX = state.positionX;
  let leftGround = false;
  for (let frame = 0; frame < 300; frame += 1) {
    state = stepPlayerMotion(
      state,
      {
        axis: 1,
        running,
        jumpPressed: frame === 0,
        jumpHeld: true,
      },
      world,
      STEP_SECONDS,
      motion,
    );
    leftGround ||= !state.grounded;
    if (leftGround && state.grounded) return state.positionX - takeoffX;
  }

  throw new Error('Jump simulation did not land within 300 frames');
}

export function measureJumpCapabilities(motion) {
  return {
    walk: measureJump(motion, false),
    run: measureJump(motion, true),
  };
}

export function analyzeRequiredJumps(level, capabilities) {
  const requiredJumps = level.requiredJumps || [];
  return {
    unreachable: requiredJumps.filter((jump) => {
      const capability = jump.requiresRun ? capabilities.run : capabilities.walk;
      return jump.distance > capability - REQUIRED_LANDING_MARGIN;
    }),
  };
}
