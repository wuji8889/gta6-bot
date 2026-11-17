// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over. Solmar Heat is a top-down
// open-world crime game: steal a car, run three jobs for Mara, lose the heat.
//
// ?seed=N fixes the city. ?shot=cover|chase|mission|city (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotDone for a screenshot.
import { MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnPoliceCar, spawnTrafficCar, updateCars } from './cars.js';
import { spawnPed, updatePeds } from './peds.js';
import { createMissionState, updateMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { bestCash: 0, missionsDone: 0 };
    const parsed = JSON.parse(raw);
    return { bestCash: Number(parsed.bestCash) || 0, missionsDone: Number(parsed.missionsDone) || 0 };
  } catch {
    return { bestCash: 0, missionsDone: 0 };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

/** A fresh simulation: a new city from the seed, Rico on the sidewalk, traffic and people. */
function createSim(G, simSeed) {
  const rng = createRandom(simSeed);
  const city = buildCity(rng);
  const s = {
    screen: SCREEN_TITLE,
    time: 0,
    cash: 0,
    bestCash: G.save.bestCash,
    missionsDone: 0,
    wanted: 0,
    crimeTimer: 0,
    decayTimer: 0,
    policeTimer: 0,
    health: 100,
    busted: false,
    wasted: false,
    overKind: null,
    player: createPlayer(city),
    cars: [],
    peds: [],
    particles: [],
    skids: [],
    mission: null,
    camera: { x: 1280, y: 900 },
    shake: 0,
    prompt: '',
    view: null,
    stats: { pedsHit: 0 },
  };
  G.rng = rng;
  G.city = city;
  G.s = s;
  s.mission = createMissionState(G);
  for (let i = 0; i < 10; i += 1) spawnTrafficCar(G);
  for (let i = 0; i < 16; i += 1) spawnPed(G);
  return s;
}

const G = {
  seed,
  rng: null,
  city: null,
  s: null,
  input: createInput(canvas),
  audio: createAudio(),
  renderer: createRenderer(canvas),
  save: readSave(),
};
createSim(G, seed);
G.s.bestCash = G.save.bestCash;

// Test and screenshot hooks: the live game object, and the flag the shot tool waits for.
window.__game = G;

function saveProgress() {
  const bestCash = Math.max(G.save.bestCash, G.s.cash);
  const missionsDone = Math.max(G.save.missionsDone, G.s.missionsDone);
  G.save = { bestCash, missionsDone };
  writeSave(G.save);
  G.s.bestCash = bestCash;
}

function startGame() {
  const freshSeed = Math.floor(Math.random() * 4294967296);
  createSim(G, freshSeed);
  G.s.screen = SCREEN_PLAY;
  G.s.bestCash = G.save.bestCash;
  G.audio.unlock();
  status.textContent = 'Playing. Steal a car, run the jobs, lose the heat.';
}

function endGame(kind) {
  G.s.screen = SCREEN_OVER;
  G.s.overKind = kind;
  G.s.prompt = '';
  saveProgress();
  status.textContent = kind === 'busted'
    ? `Busted. Cash $${G.s.cash}. Jobs finished ${G.s.missionsDone} of ${MISSIONS.length}.`
    : `Wasted. Cash $${G.s.cash}. Jobs finished ${G.s.missionsDone} of ${MISSIONS.length}.`;
}

function stepWorld(dt, actions) {
  const s = G.s;
  s.time += dt;
  updatePlayer(G, dt, actions);
  updateCars(G, dt);
  updatePeds(G, dt);
  updateMissions(G, dt);
  // Particles and skid marks age out.
  for (let i = s.particles.length - 1; i >= 0; i -= 1) {
    const pt = s.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.life <= 0) s.particles.splice(i, 1);
  }
  for (let i = s.skids.length - 1; i >= 0; i -= 1) {
    s.skids[i].life -= dt;
    if (s.skids[i].life <= 0) s.skids.splice(i, 1);
  }
  if (s.shake > 0) {
    s.shake = Math.max(0, s.shake - s.shake * 6 * dt - 0.2 * dt);
  }
  // The camera eases after Rico, or after his car.
  const targetX = s.player.x;
  const targetY = s.player.y;
  s.camera.x += (targetX - s.camera.x) * Math.min(1, 5 * dt);
  s.camera.y += (targetY - s.camera.y) * Math.min(1, 5 * dt);
  G.audio.siren(dt, s.wanted > 0 && s.cars.some((c) => c.kind === 'police'));
  if (s.busted) endGame('busted');
  else if (s.wasted) endGame('wasted');
}

function stepTitle(dt) {
  const s = G.s;
  s.time += dt;
  // A living backdrop: traffic loops and people stroll while the title sits over the city.
  updateCars(G, dt);
  updatePeds(G, dt);
  s.camera.x = 1280 + Math.sin(s.time * 0.05) * 420;
  s.camera.y = 900 + Math.cos(s.time * 0.04) * 320;
}

function runShot(name) {
  const scene = stageShot(name, G);
  let painted = 0;
  function paint() {
    G.renderer.draw(G, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotDone = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = G.input.takeActions();
    if (actions & ACTION_MUTE) {
      G.audio.setMuted(!G.audio.isMuted());
      announce(G.audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    screen = G.s.screen;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        startGame();
        screen = SCREEN_PLAY;
      } else {
        while (accumulator >= STEP) {
          stepTitle(STEP);
          accumulator -= STEP;
        }
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        G.s.screen = SCREEN_PAUSED;
        screen = SCREEN_PAUSED;
        announce('Paused.');
        accumulator = 0;
      } else {
        // One-shot presses belong to the first step of the frame only, or a single
        // Enter would both steal and leave a car in the same frame.
        let firstStep = true;
        while (accumulator >= STEP && G.s.screen === SCREEN_PLAY) {
          stepWorld(STEP, firstStep ? actions : 0);
          firstStep = false;
          accumulator -= STEP;
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        G.s.screen = SCREEN_PLAY;
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        startGame();
        screen = SCREEN_PLAY;
      }
      accumulator = 0;
    }
    G.input.clearClick();
    G.renderer.draw(G, G.s.screen);
  }

  // Leaving the tab pauses a running game rather than letting the police close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.s.screen === SCREEN_PLAY) {
      G.s.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
