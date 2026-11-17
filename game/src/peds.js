// Pedestrians: Solmar's people, strolling the sidewalk ring of their block. A fast car, a
// punch or a nearby crash sends them running; a hard hit puts them down for a while, and then
// they get up and run. They never leave the sidewalks.

import { PALETTE } from './config.js';
import { blockSidewalk, resolveCircle } from './city.js';
import { pick } from './random.js';

export function spawnPed(G) {
  const c = Math.floor(G.rng() * G.city.cols);
  const r = Math.floor(G.rng() * G.city.rows);
  const dir = G.rng() < 0.5 ? 1 : -1;
  const waypoints = blockSidewalk(G.city, c, r, dir);
  if (waypoints.length === 0) return null;
  const start = waypoints[0];
  const ped = {
    x: start.x,
    y: start.y,
    angle: 0,
    speed: 42 + G.rng() * 26,
    color: pick(G.rng, PALETTE.ped),
    state: 'walk',
    waypoints,
    index: 1,
    fleeTimer: 0,
    fx: 0,
    fy: 0,
    downTimer: 0,
    vx: 0,
    vy: 0,
    health: 100,
  };
  G.s.peds.push(ped);
  return ped;
}

export function updatePeds(G, dt) {
  const p = G.s.player;
  for (const ped of G.s.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      // Slide to a stop from the knock-back, then lie still.
      ped.x += ped.vx * dt;
      ped.y += ped.vy * dt;
      ped.vx *= 1 - 4 * dt;
      ped.vy *= 1 - 4 * dt;
      const fixed = resolveCircle(G.city, ped.x, ped.y, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
        ped.fx = ped.x - p.x;
        ped.fy = ped.y - p.y;
        const d = Math.hypot(ped.fx, ped.fy) || 1;
        ped.fx /= d;
        ped.fy /= d;
      }
      continue;
    }

    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const speed = 150;
      const nx = ped.x + ped.fx * speed * dt;
      const ny = ped.y + ped.fy * speed * dt;
      const fixed = resolveCircle(G.city, nx, ny, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
      ped.angle = Math.atan2(ped.fy, ped.fx);
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        // Find a fresh sidewalk loop near where they ended up.
        const c = Math.max(0, Math.min(G.city.cols - 1, Math.floor(ped.x / 320)));
        const r = Math.max(0, Math.min(G.city.rows - 1, Math.floor(ped.y / 320)));
        ped.waypoints = blockSidewalk(G.city, c, r, G.rng() < 0.5 ? 1 : -1);
        ped.index = 0;
      }
      continue;
    }

    // Walking: follow the sidewalk loop, and run from anything fast or violent.
    let fleeX = 0;
    let fleeY = 0;
    for (const car of G.s.cars) {
      const d = Math.hypot(car.x - ped.x, car.y - ped.y);
      if (d < 90 && Math.abs(car.speed) > 120) {
        fleeX += (ped.x - car.x) / (d || 1);
        fleeY += (ped.y - car.y) / (d || 1);
      }
    }
    if (!p.onFoot) {
      const d = Math.hypot(p.x - ped.x, p.y - ped.y);
      if (d < 70) {
        fleeX += (ped.x - p.x) / (d || 1);
        fleeY += (ped.y - p.y) / (d || 1);
      }
    }
    if (fleeX !== 0 || fleeY !== 0) {
      ped.state = 'flee';
      ped.fleeTimer = 1.4;
      const d = Math.hypot(fleeX, fleeY) || 1;
      ped.fx = fleeX / d;
      ped.fy = fleeY / d;
      continue;
    }

    const target = ped.waypoints[ped.index];
    if (!target) continue;
    const dx = target.x - ped.x;
    const dy = target.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) {
      ped.index = (ped.index + 1) % ped.waypoints.length;
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * ped.speed * dt;
    ped.y += (dy / d) * ped.speed * dt;
  }

  // Keep the sidewalks busy near the player, but cap the crowd.
  const near = G.s.peds.filter((ped) => Math.hypot(ped.x - p.x, ped.y - p.y) < 900).length;
  if (near < 14 && G.s.peds.length < 24) spawnPed(G);
  for (const ped of G.s.peds) {
    if (Math.hypot(ped.x - p.x, ped.y - p.y) > 1500) {
      const c = Math.floor(G.rng() * G.city.cols);
      const r = Math.floor(G.rng() * G.city.rows);
      const waypoints = blockSidewalk(G.city, c, r, G.rng() < 0.5 ? 1 : -1);
      if (waypoints.length > 0) {
        ped.waypoints = waypoints;
        ped.index = 0;
        ped.x = waypoints[0].x;
        ped.y = waypoints[0].y;
        ped.state = 'walk';
      }
    }
  }
}
