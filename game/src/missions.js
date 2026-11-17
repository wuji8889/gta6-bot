// The three-mission story. Rico drives for Mara. Each mission has an objective marker in the
// world, a line of text, and a cash reward; finishing all three opens free roam with the story
// complete. The mission state is plain data so the renderer and the screenshots can read it.

import { MISSIONS } from './config.js';
import { blockCentre } from './city.js';
import { addWanted } from './player.js';

function garageTarget(G) {
  // The garage sits on the west side, one block in from the edge.
  return { x: 480, y: 800, label: 'Garage' };
}

function pickupTarget(G) {
  // The package waits on the sidewalk of Marina Row (the second street), east side.
  return { x: 2080, y: 480 + 48 + 14, label: 'Package' };
}

function deliverTarget(G) {
  // The drop is the park block in the middle of town.
  const c = blockCentre(G.city, 3, 2);
  return { x: c.x, y: c.y, label: 'Drop-off' };
}

function safehouseTarget(G) {
  // The safehouse is the beach house at the south-west corner.
  return { x: 320, y: 1808 - 60, label: 'Safehouse' };
}

export function createMissionState(G) {
  return {
    index: 0,
    stage: 'go',
    target: garageTarget(G),
    hasPackage: false,
    done: false,
    banner: '',
    bannerTimer: 0,
  };
}

/** The current mission's text and target, for the HUD and the objective arrow. */
export function currentMission(G) {
  const m = G.s.mission;
  if (m.done) return { title: 'Free roam', text: 'All three jobs done. Solmar is yours — keep the cash coming.', target: null, reward: 0 };
  const def = MISSIONS[m.index];
  return { title: def.title, text: def.text, target: m.target, reward: def.reward };
}

function completeMission(G) {
  const m = G.s.mission;
  const def = MISSIONS[m.index];
  G.s.cash += def.reward;
  G.s.missionsDone += 1;
  G.audio.mission();
  m.banner = `Job done — $${def.reward}`;
  m.bannerTimer = 3;
  m.index += 1;
  if (m.index >= MISSIONS.length) {
    m.done = true;
    m.target = null;
    G.s.wanted = 0;
    return;
  }
  const next = MISSIONS[m.index];
  if (next.id === 'package') {
    m.stage = 'pickup';
    m.target = pickupTarget(G);
    m.hasPackage = false;
  } else if (next.id === 'heat') {
    m.stage = 'go';
    m.target = safehouseTarget(G);
    addWanted(G, 3);
    m.banner = 'Three stars. Run.';
    m.bannerTimer = 3;
  }
}

export function updateMissions(G, dt) {
  const m = G.s.mission;
  if (m.bannerTimer > 0) m.bannerTimer -= dt;
  if (m.done) return;
  const p = G.s.player;
  const def = MISSIONS[m.index];
  const target = m.target;
  if (!target) return;
  const inCar = !p.onFoot;
  const d = Math.hypot(p.x - target.x, p.y - target.y);

  if (def.id === 'borrow') {
    if (inCar && d < 70) completeMission(G);
  } else if (def.id === 'package') {
    if (m.stage === 'pickup') {
      if (p.onFoot && d < 44) {
        m.hasPackage = true;
        m.stage = 'deliver';
        m.target = deliverTarget(G);
        m.banner = 'Package picked up. Deliver it.';
        m.bannerTimer = 2.5;
        G.audio.blip();
      }
    } else if (d < 70) {
      completeMission(G);
    }
  } else if (def.id === 'heat') {
    if (d < 80) completeMission(G);
  }
}
