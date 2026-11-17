// Cars: the player's ride, the traffic looping its blocks, and the police cruisers that hunt
// Rico. One physics model for all of them — accelerate, steer by speed, slide off walls —
// with a different brain per driver: the player, a loop route, or a straight chase.

import { CAR, PALETTE, WANTED } from './config.js';
import { blockLoop, pointOnSand, randomRoadPoint, resolveCircle } from './city.js';
import { pick } from './random.js';
import { addWanted, damagePlayer, witnessed } from './player.js';

let nextId = 1;

export function createCar(G, opts) {
  const car = {
    id: nextId,
    x: opts.x,
    y: opts.y,
    angle: opts.angle ?? 0,
    speed: 0,
    color: opts.color ?? pick(G.rng, PALETTE.car),
    kind: opts.kind ?? 'sedan',
    len: opts.kind === 'truck' ? 58 : CAR.length,
    driver: opts.driver ?? null,
    route: opts.route ?? null,
    routeIndex: 0,
    targetSpeed: CAR.trafficSpeed,
    hitCd: 0,
    spawnTimer: 0,
  };
  nextId += 1;
  G.s.cars.push(car);
  return car;
}

/** Put a traffic car on a loop around a random block. */
export function spawnTrafficCar(G) {
  const c = Math.floor(G.rng() * G.city.cols);
  const r = Math.floor(G.rng() * G.city.rows);
  const dir = G.rng() < 0.5 ? 1 : -1;
  const waypoints = blockLoop(G.city, c, r, dir);
  const start = waypoints[0];
  const kind = G.rng() < 0.12 ? 'taxi' : G.rng() < 0.1 ? 'truck' : 'sedan';
  const car = createCar(G, {
    x: start.x,
    y: start.y,
    angle: Math.atan2(waypoints[1].y - start.y, waypoints[1].x - start.x),
    kind,
    color: kind === 'taxi' ? PALETTE.taxi : pick(G.rng, PALETTE.car),
    driver: 'traffic',
    route: { waypoints, index: 1 },
  });
  car.targetSpeed = CAR.trafficSpeed * (0.85 + G.rng() * 0.3);
  return car;
}

/** A cruiser appears on a road a little way from the player. */
export function spawnPoliceCar(G) {
  const p = G.s.player;
  let point = randomRoadPoint(G.rng);
  let guard = 0;
  while (Math.hypot(point.x - p.x, point.y - p.y) < 520 && guard < 12) {
    point = randomRoadPoint(G.rng);
    guard += 1;
  }
  const car = createCar(G, {
    x: point.x,
    y: point.y,
    angle: Math.atan2(p.y - point.y, p.x - point.x),
    kind: 'police',
    color: PALETTE.police,
    driver: 'police',
  });
  car.targetSpeed = CAR.policeMaxSpeed;
  return car;
}

function angleToward(from, to, maxStep) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) return from + maxStep;
  if (d < -maxStep) return from - maxStep;
  return from + d;
}

function driveCar(G, car, dt, throttle, steer) {
  // Sand drags a car down hard.
  const onSand = pointOnSand(car.x, car.y);
  const maxSpeed = (car.kind === 'police' ? CAR.policeMaxSpeed : CAR.maxSpeed) * (onSand ? 0.45 : 1);
  if (throttle > 0) car.speed += CAR.accel * throttle * dt * (onSand ? 0.5 : 1);
  else if (throttle < 0) {
    if (car.speed > 8) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.55 * dt;
  } else {
    car.speed -= car.speed * 0.9 * dt;
  }
  if (car.speed > maxSpeed) car.speed = maxSpeed;
  if (car.speed < -CAR.reverseMax) car.speed = -CAR.reverseMax;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;

  const speedFactor = Math.min(1, Math.abs(car.speed) / 130);
  const direction = car.speed >= 0 ? 1 : -1;
  car.angle += steer * CAR.turnRate * speedFactor * direction * dt;
  car.angle = Math.atan2(Math.sin(car.angle), Math.cos(car.angle));

  const ox = car.x;
  const oy = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const fixed = resolveCircle(G.city, car.x, car.y, CAR.radius);
  const hitWall = Math.hypot(fixed.x - car.x, fixed.y - car.y) > 2;
  car.x = fixed.x;
  car.y = fixed.y;
  if (hitWall) {
    if (Math.abs(car.speed) > 200) {
      G.audio.crash();
      G.s.shake = Math.min(12, G.s.shake + 5);
      for (let i = 0; i < 8; i += 1) {
        G.s.particles.push({ x: car.x, y: car.y, vx: (G.rng() - 0.5) * 220, vy: (G.rng() - 0.5) * 220, life: 0.35, maxLife: 0.35, color: '#ffd76a', size: 4 });
      }
    }
    car.speed *= 0.35;
  }
  return { moved: Math.hypot(car.x - ox, car.y - oy), hitWall };
}

/** Drive the player's car with explicit throttle/steer (real input, or a scripted autopilot). */
export function drivePlayerCar(G, dt, throttle, steer) {
  const p = G.s.player;
  const playerCar = p.onFoot ? null : G.s.cars.find((c) => c.id === p.carId);
  if (!playerCar) {
    G.audio.setEngine(0, 0);
    return;
  }
  const before = Math.abs(playerCar.speed);
  const { moved } = driveCar(G, playerCar, dt, throttle, steer);
  p.x = playerCar.x;
  p.y = playerCar.y;
  p.angle = playerCar.angle;
  // Skid marks and dust when the car is worked hard.
  if (Math.abs(steer) > 0.6 && Math.abs(playerCar.speed) > 240 && moved > 0.5) {
    const bx = playerCar.x - Math.cos(playerCar.angle) * (playerCar.len / 2);
    const by = playerCar.y - Math.sin(playerCar.angle) * (playerCar.len / 2);
    const px = Math.cos(playerCar.angle + Math.PI / 2);
    const py = Math.sin(playerCar.angle + Math.PI / 2);
    G.s.skids.push({ x1: bx + px * 9, y1: by + py * 9, x2: bx + px * 9 - Math.cos(playerCar.angle) * moved, y2: by + py * 9 - Math.sin(playerCar.angle) * moved, life: 6 });
    G.s.skids.push({ x1: bx - px * 9, y1: by - py * 9, x2: bx - px * 9 - Math.cos(playerCar.angle) * moved, y2: by - py * 9 - Math.sin(playerCar.angle) * moved, life: 6 });
    if (G.s.skids.length > 220) G.s.skids.splice(0, G.s.skids.length - 220);
  }
  if (pointOnSand(playerCar.x, playerCar.y) && Math.abs(playerCar.speed) > 60 && G.rng() < 0.4) {
    G.s.particles.push({ x: playerCar.x, y: playerCar.y, vx: (G.rng() - 0.5) * 60, vy: (G.rng() - 0.5) * 60, life: 0.5, maxLife: 0.5, color: '#e6cf9a', size: 6 });
  }
  G.audio.setEngine(Math.abs(playerCar.speed) / CAR.maxSpeed, before);
}

export function updateCars(G, dt, driveOverride) {
  const p = G.s.player;
  const input = G.input;

  // --- the player's car (real input, unless a script drives it, e.g. a screenshot) ---
  const drive = driveOverride ?? { throttle: input.throttle(), steer: input.steer() };
  drivePlayerCar(G, dt, drive.throttle, drive.steer);

  // --- traffic and police brains ---
  for (const car of G.s.cars) {
    if (car.hitCd > 0) car.hitCd -= dt;
    if (car.driver === 'player' || car.driver === null) continue;
    if (car.driver === 'traffic' && car.route) {
      const target = car.route.waypoints[car.route.index];
      const d = Math.hypot(target.x - car.x, target.y - car.y);
      if (d < 20) {
        car.route.index = (car.route.index + 1) % car.route.waypoints.length;
      }
      const desired = Math.atan2(target.y - car.y, target.x - car.x);
      // Slow down for the car ahead, roughly.
      let targetSpeed = car.targetSpeed;
      for (const other of G.s.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 64 && dist > 0.01) {
          const ahead = (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / dist;
          if (ahead > 0.7) targetSpeed = Math.min(targetSpeed, 50);
        }
      }
      const throttle = car.speed < targetSpeed ? 1 : 0;
      const step = Math.max(-1, Math.min(1, ((desired - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      driveCar(G, car, dt, throttle, step * 1.4);
    } else if (car.driver === 'police') {
      const tx = p.x;
      const ty = p.y;
      const desired = Math.atan2(ty - car.y, tx - car.x);
      const step = Math.max(-1, Math.min(1, ((desired - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      const targetSpeed = CAR.policeMaxSpeed * (0.8 + 0.06 * G.s.wanted);
      driveCar(G, car, dt, car.speed < targetSpeed ? 1 : 0, step * 1.6);
    }
  }

  // --- car against car: push apart, sparks on a hard hit ---
  const cars = G.s.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 6;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 160) {
          G.audio.crash();
          G.s.shake = Math.min(10, G.s.shake + 4);
          for (let k = 0; k < 6; k += 1) {
            G.s.particles.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: (G.rng() - 0.5) * 200, vy: (G.rng() - 0.5) * 200, life: 0.3, maxLife: 0.3, color: '#ffd76a', size: 4 });
          }
        }
        // A police ram hurts Rico.
        const police = a.kind === 'police' ? a : b.kind === 'police' ? b : null;
        const victim = police === a ? b : a;
        if (police && victim.driver === 'player' && police.hitCd <= 0 && rel > 60) {
          police.hitCd = 0.9;
          if (damagePlayer(G, 9)) G.s.wasted = true;
        }
        a.speed *= 0.92;
        b.speed *= 0.92;
      }
    }
  }

  // --- cars against people on foot (only while actually playing, never on the title) ---
  for (const car of cars) {
    if (car.speed === 0) continue;
    // The player, on foot, hit by a moving car.
    if (p.onFoot && G.s.screen === 'play') {
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < CAR.radius + 12 && car.hitCd <= 0) {
        car.hitCd = 0.9;
        const nx = (p.x - car.x) / (d || 1);
        const ny = (p.y - car.y) / (d || 1);
        const fixed = resolveCircle(G.city, p.x + nx * 34, p.y + ny * 34, 13);
        p.x = fixed.x;
        p.y = fixed.y;
        if (damagePlayer(G, 18)) G.s.wasted = true;
        G.audio.crash();
      }
    }
    // Pedestrians: only Rico's car does real damage; other cars just shove them aside.
    for (const ped of G.s.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(car.x - ped.x, car.y - ped.y);
      if (d < CAR.radius + 10) {
        if (car.driver === 'player' && Math.abs(car.speed) > 60) {
          ped.health = 0;
          ped.state = 'down';
          ped.downTimer = 3;
          ped.vx = ((ped.x - car.x) / (d || 1)) * 300;
          ped.vy = ((ped.y - car.y) / (d || 1)) * 300;
          if (witnessed(G, ped.x, ped.y)) addWanted(G, 1);
          G.s.stats.pedsHit += 1;
          G.audio.crash();
          G.s.shake = Math.min(10, G.s.shake + 4);
        } else {
          // Shove the pedestrian out of the way and make them flee.
          const nx = (ped.x - car.x) / (d || 1);
          const ny = (ped.y - car.y) / (d || 1);
          ped.x = car.x + nx * (CAR.radius + 12);
          ped.y = car.y + ny * (CAR.radius + 12);
          ped.state = 'flee';
          ped.fleeTimer = 1.4;
          ped.fx = nx;
          ped.fy = ny;
        }
      }
    }
  }

  // --- keep the streets busy: traffic near the player, cruisers to match the heat ---
  const traffic = cars.filter((c) => c.driver === 'traffic');
  if (traffic.length < 10) spawnTrafficCar(G);
  for (const car of traffic) {
    if (Math.hypot(car.x - p.x, car.y - p.y) > 1400) {
      const c = Math.floor(G.rng() * G.city.cols);
      const r = Math.floor(G.rng() * G.city.rows);
      const waypoints = blockLoop(G.city, c, r, G.rng() < 0.5 ? 1 : -1);
      car.route = { waypoints, index: 1 };
      car.x = waypoints[0].x;
      car.y = waypoints[0].y;
      car.angle = Math.atan2(waypoints[1].y - waypoints[0].y, waypoints[1].x - waypoints[0].x);
      car.speed = CAR.trafficSpeed * 0.8;
    }
  }
  const police = cars.filter((c) => c.driver === 'police');
  const wantPolice = Math.min(WANTED.maxPolice, G.s.wanted * WANTED.policePerStar);
  G.s.policeTimer = (G.s.policeTimer ?? 0) - dt;
  if (police.length < wantPolice && G.s.policeTimer <= 0) {
    spawnPoliceCar(G);
    G.s.policeTimer = 1.2;
  }
  if (G.s.wanted === 0 && police.length > 0 && G.s.policeTimer <= 0) {
    // The heat is off: cruisers peel away one at a time.
    const far = police[police.length - 1];
    G.s.cars.splice(G.s.cars.indexOf(far), 1);
    G.s.policeTimer = 0.8;
  }
  for (const car of police) {
    if (Math.hypot(car.x - p.x, car.y - p.y) > 1500) {
      const point = randomRoadPoint(G.rng);
      car.x = point.x;
      car.y = point.y;
      car.speed = 120;
    }
  }

  // Wanted decay: quiet for a while, out of sight, and the stars fall off one by one.
  if (G.s.wanted > 0) {
    G.s.crimeTimer += dt;
    if (G.s.crimeTimer > WANTED.quietSeconds) {
      let policeNear = false;
      for (const car of police) {
        if (Math.hypot(car.x - p.x, car.y - p.y) < 340) policeNear = true;
      }
      if (!policeNear) {
        G.s.decayTimer += dt;
        if (G.s.decayTimer >= WANTED.decaySeconds) {
          G.s.wanted -= 1;
          G.s.decayTimer = 0;
          G.s.crimeTimer = 0;
        }
      } else {
        G.s.decayTimer = 0;
      }
    }
  }
}
