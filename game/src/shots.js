// The screenshot scenes behind ?shot=cover|chase|mission|city. Each one resets the world to a
// known setup, plays the real rules forward for a fixed number of steps steered by a simple
// autopilot (keep the car on its avenue, full throttle), so the frame is what a short game
// really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { blockLoop } from './city.js';
import { createCar, spawnTrafficCar, updateCars } from './cars.js';
import { spawnPed, updatePeds } from './peds.js';
import { SCREEN_PLAY } from './render.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrapAngle(a) {
  return ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/** Put Rico in a car at (x, y) facing `angle`, and return the car. */
function putInCar(G, x, y, angle, color) {
  const car = createCar(G, { x, y, angle, color, kind: 'sedan', driver: 'player' });
  const p = G.s.player;
  p.onFoot = false;
  p.carId = car.id;
  p.x = x;
  p.y = y;
  p.angle = angle;
  return car;
}

/** Put Rico on foot at (x, y) facing `angle`. */
function putOnFoot(G, x, y, angle) {
  const p = G.s.player;
  p.onFoot = true;
  p.carId = -1;
  p.x = x;
  p.y = y;
  p.angle = angle;
}

/** Reset the world to a clean, deterministic state for a scene. */
function resetScene(G) {
  const s = G.s;
  s.screen = SCREEN_PLAY;
  s.time = 0;
  s.cash = 0;
  s.wanted = 0;
  s.crimeTimer = 0;
  s.decayTimer = 0;
  s.policeTimer = 0;
  s.health = 100;
  s.busted = false;
  s.wasted = false;
  s.overKind = null;
  s.cars = [];
  s.peds = [];
  s.particles = [];
  s.skids = [];
  s.prompt = '';
  s.mission.index = 0;
  s.mission.stage = 'go';
  s.mission.target = { x: 480, y: 800, label: 'Garage' };
  s.mission.hasPackage = false;
  s.mission.done = false;
  s.mission.banner = '';
  s.mission.bannerTimer = 0;
  s.player.bustedMeter = 0;
  s.player.punchCd = 0;
  for (let i = 0; i < 10; i += 1) spawnTrafficCar(G);
  for (let i = 0; i < 14; i += 1) spawnPed(G);
}

/** Step the world forward with an optional scripted drive for Rico's car. */
function stepScene(G, drive) {
  G.s.time += STEP;
  updateCars(G, STEP, drive);
  updatePeds(G, STEP);
  for (let i = G.s.particles.length - 1; i >= 0; i -= 1) {
    const pt = G.s.particles[i];
    pt.life -= STEP;
    pt.x += pt.vx * STEP;
    pt.y += pt.vy * STEP;
    if (pt.life <= 0) G.s.particles.splice(i, 1);
  }
  G.s.camera.x = G.s.player.x;
  G.s.camera.y = G.s.player.y;
}

/** Steer toward a point ahead on the avenue the car is travelling down. */
function avenueDrive(G, avenueX) {
  const p = G.s.player;
  const desired = Math.atan2(p.y + 260 - p.y, avenueX - p.x);
  const steer = clamp(wrapAngle(desired - p.angle) * 1.6, -1, 1);
  return { throttle: 1, steer };
}

function sceneCover(G) {
  resetScene(G);
  G.s.cash = 150;
  // Rico in a red sedan, heading south down 5th Avenue, with traffic on the same road.
  putInCar(G, 800, 700, Math.PI / 2, '#c0392b');
  const waypoints = blockLoop(G.city, 2, 2, -1);
  const lead = createCar(G, { x: 824, y: 1050, angle: Math.PI / 2, color: '#f1c40f', kind: 'sedan', driver: 'traffic', route: { waypoints, index: 1 } });
  lead.targetSpeed = 150;
  for (let i = 0; i < 120; i += 1) stepScene(G, avenueDrive(G, 800));
  return { screen: SCREEN_PLAY };
}

function sceneChase(G) {
  resetScene(G);
  G.s.cash = 450;
  G.s.wanted = 3;
  G.s.mission.index = 2;
  G.s.mission.stage = 'go';
  G.s.mission.target = { x: 320, y: 1748, label: 'Safehouse' };
  // Rico fleeing south down 6th Avenue in a blue sedan, three cruisers on his tail.
  putInCar(G, 1120, 900, Math.PI / 2, '#2980b9');
  const spots = [
    { x: 1096, y: 560 },
    { x: 1144, y: 640 },
    { x: 1096, y: 720 },
  ];
  for (const spot of spots) {
    const cruiser = createCar(G, { x: spot.x, y: spot.y, angle: Math.PI / 2, color: '#1c4ed8', kind: 'police', driver: 'police' });
    cruiser.targetSpeed = 470;
  }
  for (let i = 0; i < 150; i += 1) stepScene(G, avenueDrive(G, 1120));
  return { screen: SCREEN_PLAY };
}

function sceneMission(G) {
  resetScene(G);
  G.s.cash = 150;
  G.s.mission.index = 1;
  G.s.mission.stage = 'pickup';
  G.s.mission.target = { x: 2080, y: 494, label: 'Package' };
  // Rico on foot on Marina Row, a few steps from the package, people strolling past.
  putOnFoot(G, 1980, 494, 0);
  for (let i = 0; i < 60; i += 1) stepScene(G, { throttle: 0, steer: 0 });
  return { screen: SCREEN_PLAY };
}

function sceneCity(G) {
  resetScene(G);
  // Rico on foot at the corner of 6th Avenue and 3rd Street, the city moving around him.
  putOnFoot(G, 1080, 760, Math.PI / 4);
  for (let i = 0; i < 180; i += 1) stepScene(G, { throttle: 0, steer: 0 });
  return { screen: SCREEN_PLAY };
}

/**
 * Set the game to the named scene (cover, chase, mission or city; any other name is cover)
 * and return the screen to draw over it.
 */
export function stageShot(name, G) {
  if (name === 'chase') return sceneChase(G);
  if (name === 'mission') return sceneMission(G);
  if (name === 'city') return sceneCity(G);
  return sceneCover(G);
}
