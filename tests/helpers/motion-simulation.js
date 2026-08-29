import { AABB } from '../../js/core/aabb.js';
import {
  DEFAULT_MOTION,
  createPlayerMotion,
  stepPlayerMotion,
} from '../../js/gameplay/player-motion.js';

const STEP_SECONDS = 1 / 60;
const REQUIRED_LANDING_MARGIN = 0.5;

function runUp(motion, running) {
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
  return state;
}

export function measureJumpTrajectory(motion, running, landingRise = 0) {
  let state = runUp(motion, running);
  const takeoffX = state.positionX;
  let previous = state;
  let elapsed = 0;
  let peakHeight = 0;

  for (let frame = 0; frame < 300; frame += 1) {
    state = stepPlayerMotion(
      state,
      {
        axis: 1,
        running,
        jumpPressed: frame === 0,
        jumpHeld: true,
      },
      { solids: [] },
      STEP_SECONDS,
      motion,
    );
    elapsed += STEP_SECONDS;
    peakHeight = Math.max(peakHeight, state.positionY);

    if (
      state.velocityY <= 0
      && previous.positionY >= landingRise
      && state.positionY <= landingRise
    ) {
      const heightDelta = previous.positionY - state.positionY;
      const ratio = heightDelta === 0
        ? 0
        : (previous.positionY - landingRise) / heightDelta;
      const landingX = previous.positionX
        + (state.positionX - previous.positionX) * ratio;
      return {
        distance: landingX - takeoffX,
        time: elapsed - STEP_SECONDS + STEP_SECONDS * ratio,
        peakHeight,
      };
    }
    previous = state;
  }

  return null;
}

export function measureJumpCapabilities(motion) {
  return {
    walk: measureJumpTrajectory(motion, false, 0).distance,
    run: measureJumpTrajectory(motion, true, 0).distance,
  };
}

function worstMoverGap(jump, trajectory) {
  const mover = jump.mover;
  if (
    !mover
    || !Number.isFinite(mover.period)
    || mover.period <= 0
    || !Number.isFinite(mover.travel)
    || !Number.isFinite(mover.width)
    || mover.width <= 0
  ) {
    return { gap: Infinity, phase: null };
  }

  if (mover.transfer === 'board') {
    const landingProgress = mover.travel >= 0 ? 1 : 0;
    const landingPhase = landingProgress === 1 ? 0.5 : 0;
    const phase = (
      landingPhase - trajectory.time / mover.period + 1
    ) % 1;
    const landingLeft = mover.startOffset
      + mover.travel * landingProgress
      - mover.width / 2;
    return { gap: Math.max(0, landingLeft), phase };
  }

  const takeoffProgress = mover.travel >= 0 ? 0 : 1;
  const phase = takeoffProgress === 0 ? 0 : 0.5;
  const takeoffRight = mover.startOffset
    + mover.travel * takeoffProgress
    + mover.width / 2;
  return { gap: Math.max(0, mover.span - takeoffRight), phase };
}

export function analyzeRequiredJumps(
  level,
  capabilities,
  motion = DEFAULT_MOTION,
) {
  const analyzed = (level.requiredJumps || []).map((jump) => {
    const trajectory = measureJumpTrajectory(
      motion,
      jump.requiresRun,
      jump.rise || 0,
    );
    if (!trajectory) {
      return {
        ...jump,
        availableTravel: 0,
        requiredTravel: jump.gap || 0,
        landingMargin: -Infinity,
        reason: 'rise exceeds jump trajectory',
      };
    }

    const moverWorst = jump.movingPlatform
      ? worstMoverGap(jump, trajectory)
      : { gap: jump.gap || 0, phase: null };
    const availableTravel = (jump.rise || 0) === 0
      ? (jump.requiresRun ? capabilities.run : capabilities.walk)
      : trajectory.distance;
    const landingMargin = Math.min(
      availableTravel - moverWorst.gap,
      jump.landingWidth ?? Infinity,
    );
    return {
      ...jump,
      availableTravel,
      requiredTravel: moverWorst.gap,
      landingMargin,
      worstPhase: moverWorst.phase,
      reason: landingMargin < REQUIRED_LANDING_MARGIN
        ? 'landing margin below 0.5 units'
        : null,
    };
  });

  return {
    analyzed,
    unreachable: analyzed.filter((jump) => jump.reason),
  };
}
