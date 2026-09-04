import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.SAVORIA_ORIGIN ?? 'http://127.0.0.1:8977';
const OUTPUT = resolve(process.argv[2] ?? 'docs/verification/results/2026-08-26-keyboard-playthroughs.json');
const CHEFS = ['Hungrio', 'Dinnerette', 'Chefno'];
const COURSES = ['1-1', '1-2'];
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 20 * 60_000;
const startedAt = Date.now();

const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const results = [];
const heldKeys = new Set();

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const screen = () => page.locator('#app').getAttribute('data-screen');

// This getter copies scalar and authored geometry values only. It never writes to
// the session, player, level, save store, DOM, or localStorage.
async function readState() {
  return page.evaluate(() => {
    const session = window.__savoriaTest?.session;
    const appScreen = document.querySelector('#app')?.dataset.screen ?? 'none';
    if (!session) return { screen: appScreen };
    return {
      screen: appScreen,
      levelId: session.level?.id,
      x: session.player?.pos?.x,
      y: session.player?.pos?.y,
      vx: session.player?.vel?.x,
      vy: session.player?.vel?.y,
      grounded: session.player?.grounded,
      hearts: session.hearts,
      checkpoint: session.passedCheckpoint,
      finished: session.finished,
      jumps: (session.level?.requiredJumps ?? []).map((jump) => ({ ...jump })),
      enemies: (session.level?.enemies ?? []).map((enemy) => enemy.p?.[0]),
      enemyDead: (session.enemies ?? []).map((enemy) => enemy.dead),
      goalX: session.level?.goal?.x,
      inputAxis: session.input?.axis,
      inputRunning: session.input?.running,
      jumpHeld: session.input?.jumpHeld,
    };
  });
}

async function keyDown(key, trace, attemptStart) {
  if (heldKeys.has(key)) return;
  await page.keyboard.down(key);
  heldKeys.add(key);
  trace.push({ tMs: Date.now() - attemptStart, type: 'key-down', key });
}

async function keyUp(key, trace, attemptStart) {
  if (!heldKeys.has(key)) return;
  await page.keyboard.up(key);
  heldKeys.delete(key);
  trace.push({ tMs: Date.now() - attemptStart, type: 'key-up', key });
}

async function releaseAll(trace, attemptStart) {
  for (const key of [...heldKeys]) await keyUp(key, trace, attemptStart);
}

async function chooseChef(chef) {
  await page.goto(`${ORIGIN}/play/`);
  await page.locator('#app[data-screen="title"]').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start Adventure' }).click();
  await page.getByRole('button', { name: new RegExp(`^${chef}`) }).click();
  await page.locator('#app[data-screen="world"]').waitFor({ timeout: 10_000 });
}

async function startCourse(levelId) {
  await page.getByRole('button', { name: new RegExp(`${levelId} `) }).click();
  await page.locator('#app[data-screen="playing"]').waitFor({ timeout: 15_000 });
  await page.locator('#game-stage').focus();
}

async function recoverForRetry() {
  const current = await screen();
  if (current === 'error') {
    await page.getByRole('button', { name: 'Retry course' }).click();
  } else if (current === 'playing') {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Restart course' }).click();
  } else {
    throw new Error(`Cannot retry from screen ${current}`);
  }
  await page.locator('#app[data-screen="playing"]').waitFor({ timeout: 15_000 });
  await page.locator('#game-stage').focus();
}

async function heldJump(holdMs, trace, attemptStart) {
  await keyDown('Space', trace, attemptStart);
  await sleep(holdMs);
  await keyUp('Space', trace, attemptStart);
}

async function driveCourse(chef, levelId, attempt) {
  const trace = [];
  const attemptStart = Date.now();
  let furthestX = -Infinity;
  let previousX;
  let lastX = -Infinity;
  let lastProgressAt = Date.now();
  let lastJumpAt = 0;
  let lastSampleAt = 0;
  let didShort = false;
  let didFull = false;
  let sawWalk = false;
  let sawRun = false;
  let sawDamage = false;
  let sawRespawn = false;
  let previousHearts;
  const triggered = new Set();

  // Begin walking so every successful run exercises the production walk path.
  await keyDown('ArrowRight', trace, attemptStart);
  await sleep(500);
  sawWalk = true;
  await keyDown('Shift', trace, attemptStart);

  try {
    while (Date.now() - attemptStart < ATTEMPT_TIMEOUT_MS && Date.now() - startedAt < RUN_TIMEOUT_MS) {
      const state = await readState();
      const now = Date.now();

      if (now - lastSampleAt >= 250) {
        trace.push({
          tMs: now - attemptStart,
          type: 'sample',
          screen: state.screen,
          x: state.x,
          y: state.y,
          vx: state.vx,
          vy: state.vy,
          grounded: state.grounded,
          hearts: state.hearts,
          checkpoint: state.checkpoint,
          enemyDead: state.enemyDead,
          inputAxis: state.inputAxis,
          inputRunning: state.inputRunning,
          jumpHeld: state.jumpHeld,
        });
        lastSampleAt = now;
      }

      if (state.screen === 'complete') {
        trace.push({ tMs: now - attemptStart, type: 'complete', x: state.x, hearts: state.hearts, checkpoint: state.checkpoint, enemyDead: state.enemyDead });
        return { completed: true, furthestX, final: state, trace, coverage: { sawWalk, sawRun, didShort, didFull, sawDamage, sawRespawn } };
      }
      if (state.screen === 'error') {
        trace.push({ tMs: now - attemptStart, type: 'game-over', x: state.x, hearts: state.hearts, checkpoint: state.checkpoint });
        return { completed: false, reason: 'game-over', furthestX, final: state, trace, coverage: { sawWalk, sawRun, didShort, didFull, sawDamage, sawRespawn } };
      }
      if (state.screen !== 'playing' || typeof state.x !== 'number') {
        await sleep(50);
        continue;
      }

      furthestX = Math.max(furthestX, state.x);
      sawRun ||= state.inputRunning === true;
      if (Number.isFinite(previousHearts) && state.hearts < previousHearts) sawDamage = true;
      previousHearts = state.hearts;

      if (Number.isFinite(previousX) && previousX - state.x > 10) {
        sawRespawn = true;
        trace.push({ tMs: now - attemptStart, type: 'respawn', fromX: previousX, toX: state.x, hearts: state.hearts, checkpoint: state.checkpoint });
        triggered.clear();
        await keyUp('ArrowRight', trace, attemptStart);
        await keyUp('Shift', trace, attemptStart);
        await keyDown('Shift', trace, attemptStart);
        await keyDown('ArrowRight', trace, attemptStart);
      }
      previousX = state.x;

      if (state.inputAxis !== 1) {
        await keyUp('ArrowRight', trace, attemptStart);
        await keyDown('ArrowRight', trace, attemptStart);
      }
      if (levelId === '1-2' && state.x >= 108 && state.inputRunning) await keyUp('Shift', trace, attemptStart);
      if ((levelId !== '1-2' || state.x < 108) && !state.inputRunning) {
        await keyUp('Shift', trace, attemptStart);
        await keyDown('Shift', trace, attemptStart);
      }

      if (state.x > lastX + 0.18) {
        lastX = state.x;
        lastProgressAt = now;
      }

      const nextJump = (state.jumps ?? []).find((item) => !triggered.has(item.id) && state.x <= item.takeoffX + 1.2);
      const nextEnemy = (state.enemies ?? []).filter((x) => Number.isFinite(x) && x > state.x).sort((a, b) => a - b)[0];
      const settlingAtCheckpoint = levelId === '1-2' && !state.checkpoint && state.x >= 66.3 && state.x < 71.3;
      if (settlingAtCheckpoint && state.x > 68.3 && !state.grounded) {
        await keyUp('ArrowRight', trace, attemptStart);
        await sleep(35);
        continue;
      }
      if (settlingAtCheckpoint && state.inputAxis !== 1 && state.grounded) await keyDown('ArrowRight', trace, attemptStart);

      // The 6.5-unit checkpoint gap needs the authored late takeoff. Starting it
      // four units early reaches the landing lip but falls before activation.
      const transferDistance = nextJump?.id === '1-2:8:6'
        ? 1.2
        : (levelId === '1-2' && state.x >= 108 ? 1.8 : (nextJump?.requiresRun ? 4.1 : 3.2));
      const nearTransfer = nextJump && !settlingAtCheckpoint && nextJump.takeoffX - state.x <= transferDistance;
      const nearEnemy = Number.isFinite(nextEnemy) && nextEnemy - state.x <= 3.1;
      const stuck = now - lastProgressAt > 700;
      const safeShort = !didShort && state.x > 3.5 && state.x < 8;
      const safeFull = !didFull && state.x > 8 && state.x < 12.5;

      if (state.grounded && now - lastJumpAt > 260 && (nearTransfer || nearEnemy || stuck || safeShort || safeFull)) {
        let holdMs = levelId === '1-2' && state.x >= 108 ? 280 : 430;
        let reason = 'full';
        if (safeShort) {
          holdMs = 120;
          reason = 'short';
          didShort = true;
        } else {
          didFull = true;
        }
        if (nearTransfer) triggered.add(nextJump.id);
        trace.push({ tMs: now - attemptStart, type: 'jump', reason, holdMs, x: state.x, y: state.y, transfer: nextJump?.id, enemyX: nearEnemy ? nextEnemy : undefined });
        lastJumpAt = now;
        await heldJump(holdMs, trace, attemptStart);
      } else {
        await sleep(35);
      }
    }

    const final = await readState();
    return { completed: false, reason: Date.now() - startedAt >= RUN_TIMEOUT_MS ? 'run-timeout' : 'attempt-timeout', furthestX, final, trace, coverage: { sawWalk, sawRun, didShort, didFull, sawDamage, sawRespawn } };
  } finally {
    await releaseAll(trace, attemptStart);
  }
}

let runError;
try {
  for (const chef of CHEFS) {
    await chooseChef(chef);
    for (const levelId of COURSES) {
      let outcome;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (await screen() === 'world') await startCourse(levelId);
        outcome = await driveCourse(chef, levelId, attempt);
        const result = { chef, levelId, attempt, ...outcome };
        results.push(result);
        process.stdout.write(`${chef} ${levelId} attempt ${attempt}: ${outcome.completed ? 'complete' : outcome.reason}, furthest x ${outcome.furthestX}\n`);
        if (outcome.completed) {
          await page.getByRole('button', { name: 'World 1 map' }).click();
          await page.locator('#app[data-screen="world"]').waitFor({ timeout: 10_000 });
          break;
        }
        if (attempt < MAX_ATTEMPTS) await recoverForRetry();
      }
      if (!outcome?.completed) throw new Error(`${chef} ${levelId} did not complete in ${MAX_ATTEMPTS} attempts`);
    }
  }
} catch (error) {
  runError = error instanceof Error ? error.message : String(error);
} finally {
  await releaseAll([], startedAt).catch(() => {});
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    browser: `Chromium ${browserVersion}`,
    viewport: { width: 1440, height: 900 },
    method: 'Playwright page.keyboard down/up with explicit holds and read-only window.__savoriaTest.session field copies',
    constraints: { maxAttemptsPerChefCourse: MAX_ATTEMPTS, attemptTimeoutMs: ATTEMPT_TIMEOUT_MS, runTimeoutMs: RUN_TIMEOUT_MS, sessionMutation: false, teleport: false },
    elapsedMs: Date.now() - startedAt,
    success: !runError && CHEFS.every((chef) => COURSES.every((levelId) => results.some((result) => result.chef === chef && result.levelId === levelId && result.completed))),
    error: runError,
    results,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await browser.close();
  process.stdout.write(`Raw trace: ${OUTPUT}\n`);
  if (!summary.success) process.exitCode = 1;
}
