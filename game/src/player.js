// Rico on foot: walking and sprinting, stealing and leaving cars, and the one combat move,
// a punch. Entering a car in view of a pedestrian or a police cruiser is a witnessed crime
// and raises the wanted level; taking an empty parked car unseen is free.

import { CAR, PLAYER, WANTED } from './config.js';
import { circleHitsBuilding, pointOnRoad, resolveCircle } from './city.js';
import { ACTION_ENTER, ACTION_PUNCH } from './input.js';

export function createPlayer(city) {
  // Start on the sidewalk south of Marina Row, clear of the avenue and of any building.
  const start = resolveCircle(city, 560, 542, PLAYER.radius);
  return {
    x: start.x,
    y: start.y,
    angle: 0,
    onFoot: true,
    carId: -1,
    punchCd: 0,
    bustedMeter: 0,
    moving: false,
  };
}

/** The nearest car within range of a point, or null. */
export function nearestCar(G, x, y, range) {
  let best = null;
  let bestD = range;
  for (const car of G.s.cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** True when any pedestrian or police car is close enough to witness a crime. */
export function witnessed(G, x, y) {
  for (const ped of G.s.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < 260) return true;
  }
  for (const car of G.s.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - x, car.y - y) < 420) return true;
  }
  return false;
}

/** Raise the wanted level by n stars (capped), remembering the crime for the decay timer. */
export function addWanted(G, n) {
  G.s.wanted = Math.min(WANTED.max, G.s.wanted + n);
  G.s.crimeTimer = 0;
  G.s.decayTimer = 0;
}

/** Damage the player; returns true when the player is wasted. */
export function damagePlayer(G, amount) {
  G.s.health -= amount;
  G.s.shake = Math.min(14, G.s.shake + 6);
  if (G.s.health <= 0) {
    G.s.health = 0;
    return true;
  }
  return false;
}

export function updatePlayer(G, dt, actions) {
  const p = G.s.player;
  const input = G.input;

  if (actions & ACTION_ENTER) {
    if (p.onFoot) {
      const car = nearestCar(G, p.x, p.y, PLAYER.enterRange);
      if (car) {
        const wasTraffic = car.driver === 'traffic';
        p.onFoot = false;
        p.carId = car.id;
        car.driver = 'player';
        car.route = null;
        car.targetSpeed = 0;
        if (wasTraffic && witnessed(G, p.x, p.y)) addWanted(G, 1);
        G.audio.blip();
        G.s.prompt = '';
      }
    } else {
      const car = G.s.cars.find((c) => c.id === p.carId);
      if (car) {
        // Step out on the passenger side, clear of the car and of walls.
        const side = car.angle + Math.PI / 2;
        let px = car.x + Math.cos(side) * 34;
        let py = car.y + Math.sin(side) * 34;
        const fixed = resolveCircle(G.city, px, py, PLAYER.radius);
        px = fixed.x;
        py = fixed.y;
        p.x = px;
        p.y = py;
        p.angle = car.angle;
        p.onFoot = true;
        p.carId = -1;
        car.driver = null;
        car.speed = 0;
      }
    }
  }

  if (p.punchCd > 0) p.punchCd -= dt;

  if (!p.onFoot) {
    p.moving = false;
    return;
  }

  if (actions & ACTION_PUNCH && p.punchCd <= 0) {
    p.punchCd = PLAYER.punchCooldown;
    G.audio.punch();
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    let hitSomeone = false;
    for (const ped of G.s.peds) {
      const dx = ped.x - p.x;
      const dy = ped.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < PLAYER.punchRange + 12 && d > 0.01) {
        const dot = (dx * fx + dy * fy) / d;
        if (dot > Math.cos(PLAYER.punchArc)) {
          hitSomeone = true;
          ped.health -= PLAYER.punchDamage;
          ped.state = 'down';
          ped.downTimer = 2.2;
          ped.vx = (dx / d) * 260;
          ped.vy = (dy / d) * 260;
          G.s.particles.push({ x: ped.x, y: ped.y, vx: (dx / d) * 60, vy: (dy / d) * 60, life: 0.4, maxLife: 0.4, color: '#ffd76a', size: 5 });
        }
      }
    }
    if (hitSomeone && witnessed(G, p.x, p.y)) addWanted(G, 1);
  }

  const move = input.move();
  const speed = move.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  p.moving = move.active;
  if (move.active) {
    p.angle = Math.atan2(move.y, move.x);
    let nx = p.x + move.x * speed * dt;
    let ny = p.y + move.y * speed * dt;
    // Cars are solid to a pedestrian: slide around them instead of walking through.
    for (const car of G.s.cars) {
      const dx = nx - car.x;
      const dy = ny - car.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius + PLAYER.radius;
      if (d < min && d > 0.01) {
        nx = car.x + (dx / d) * min;
        ny = car.y + (dy / d) * min;
      }
    }
    const fixed = resolveCircle(G.city, nx, ny, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
  }

  // The "steal this car" prompt, and the busted meter when a cruiser sits on top of Rico.
  const near = nearestCar(G, p.x, p.y, PLAYER.enterRange);
  G.s.prompt = near ? 'E — take the car' : '';
  let policeNear = false;
  for (const car of G.s.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - p.x, car.y - p.y) < 46) policeNear = true;
  }
  if (G.s.wanted > 0 && policeNear) {
    p.bustedMeter += dt;
    if (p.bustedMeter >= WANTED.bustedSeconds) G.s.busted = true;
  } else {
    p.bustedMeter = Math.max(0, p.bustedMeter - dt * 2);
  }

  // Keep the "on the road" fact around for the renderer (dust) and the mission logic.
  p.onRoad = pointOnRoad(p.x, p.y);
  p.inBuilding = circleHitsBuilding(G.city, p.x, p.y, PLAYER.radius);
}
