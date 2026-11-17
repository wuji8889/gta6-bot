// The city of Solmar: a fixed grid of avenues and streets, blocks with buildings, two parks,
// and a beach with water along the south edge. Everything is generated once from a seed, so the
// same seed always builds the same city. Traffic drives in loops around blocks; pedestrians walk
// the sidewalk ring of a block. Collision is circle-versus-building rectangles plus the water.

import { BEACH, GRID, PALETTE, WORLD } from './config.js';
import { pick, range } from './random.js';

const BLOCK_COLS = GRID.avenues.length - 1;
const BLOCK_ROWS = GRID.streets.length - 1;

/** Build the whole city from a seeded random function. */
export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const blocks = [];

  // Two park blocks, far apart, never adjacent.
  const parkSpots = [[2, 1], [4, 3]];

  for (let c = 0; c < BLOCK_COLS; c += 1) {
    for (let r = 0; r < BLOCK_ROWS; r += 1) {
      const x0 = GRID.avenues[c] + GRID.roadWidth / 2;
      const y0 = GRID.streets[r] + GRID.roadWidth / 2;
      const x1 = GRID.avenues[c + 1] - GRID.roadWidth / 2;
      const y1 = GRID.streets[r + 1] - GRID.roadWidth / 2;
      const isPark = parkSpots.some(([pc, pr]) => pc === c && pr === r);
      blocks.push({ c, r, x0, y0, x1, y1, park: isPark });
      if (isPark) {
        parks.push({ x0, y0, x1, y1 });
        const count = 5 + Math.floor(random() * 4);
        for (let i = 0; i < count; i += 1) {
          trees.push({ x: range(random, x0 + 18, x1 - 18), y: range(random, y0 + 18, y1 - 18), r: range(random, 7, 12) });
        }
        continue;
      }
      // One to three buildings per block, kept off the sidewalk edge.
      const count = 1 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const w = range(random, 62, 118);
        const h = range(random, 56, 104);
        const x = range(random, x0 + 16, x1 - 16 - w);
        const y = range(random, y0 + 16, y1 - 16 - h);
        const b = { x, y, w, h, color: pick(random, PALETTE.building) };
        if (buildings.some((o) => o.x < b.x + b.w + 10 && o.x + o.w + 10 > b.x && o.y < b.y + b.h + 10 && o.y + o.h + 10 > b.y)) continue;
        buildings.push(b);
      }
    }
  }

  // A few palm trees along the beach and the north strip.
  for (let i = 0; i < 14; i += 1) {
    trees.push({ x: range(random, 60, WORLD.width - 60), y: range(random, BEACH.sandTop + 14, BEACH.waterTop - 12), r: range(random, 7, 11) });
  }
  for (let i = 0; i < 8; i += 1) {
    trees.push({ x: range(random, 40, WORLD.width - 40), y: range(random, 26, 96), r: range(random, 6, 10) });
  }

  return { buildings, parks, trees, blocks, cols: BLOCK_COLS, rows: BLOCK_ROWS };
}

/** True when the point is on a road (avenue or street). */
export function pointOnRoad(x, y) {
  const half = GRID.roadWidth / 2;
  for (const cx of GRID.avenues) if (Math.abs(x - cx) < half) return true;
  for (const cy of GRID.streets) if (Math.abs(y - cy) < half) return true;
  return false;
}

/** True when the point is on sand (slow for cars, fine on foot). */
export function pointOnSand(x, y) {
  return y >= BEACH.sandTop && y < BEACH.waterTop;
}

/** True when the point is in the water. */
export function pointInWater(x, y) {
  return y >= BEACH.waterTop;
}

/**
 * Push a circle out of every building, out of the water and back inside the world.
 * Returns the corrected position.
 */
export function resolveCircle(city, x, y, radius) {
  const r = radius;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Dead centre of a building: push out along the smallest overlap.
        const pushLeft = x - b.x + r;
        const pushRight = b.x + b.w - x + r;
        const pushUp = y - b.y + r;
        const pushDown = b.y + b.h - y + r;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) x = b.x - r;
        else if (m === pushRight) x = b.x + b.w + r;
        else if (m === pushUp) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  if (y + r > BEACH.waterTop) y = BEACH.waterTop - r;
  x = Math.max(r, Math.min(WORLD.width - r, x));
  y = Math.max(r, Math.min(WORLD.height - r, y));
  return { x, y };
}

/** True when a circle overlaps any building. */
export function circleHitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < radius * radius) return true;
  }
  return false;
}

/**
 * Waypoints for a traffic loop around block (c, r): the rectangle of roads around it, driven
 * on the right-hand lane. dir 1 is clockwise, -1 counter-clockwise.
 */
export function blockLoop(city, c, r, dir) {
  const lane = GRID.lane;
  const west = GRID.avenues[c];
  const east = GRID.avenues[c + 1];
  const north = GRID.streets[r];
  const south = GRID.streets[r + 1];
  const cw = [
    { x: west + lane, y: north + lane },
    { x: east - lane, y: north + lane },
    { x: east - lane, y: south - lane },
    { x: west + lane, y: south - lane },
  ];
  const ccw = [
    { x: west + lane, y: north + lane },
    { x: west + lane, y: south - lane },
    { x: east - lane, y: south - lane },
    { x: east - lane, y: north + lane },
  ];
  return dir >= 0 ? cw : ccw;
}

/** Waypoints for a pedestrian strolling the sidewalk ring inside block (c, r). */
export function blockSidewalk(city, c, r, dir) {
  const block = city.blocks.find((b) => b.c === c && b.r === r);
  if (!block) return [];
  const m = 12;
  const cw = [
    { x: block.x0 + m, y: block.y0 + m },
    { x: block.x1 - m, y: block.y0 + m },
    { x: block.x1 - m, y: block.y1 - m },
    { x: block.x0 + m, y: block.y1 - m },
  ];
  const ccw = [cw[0], cw[3], cw[2], cw[1]];
  return dir >= 0 ? cw : ccw;
}

/** A random point on a road, for spawning cars and the player. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const cx = pick(random, GRID.avenues);
    return { x: cx + (random() < 0.5 ? -GRID.lane : GRID.lane), y: range(random, 120, GRID.streets[GRID.streets.length - 1]) };
  }
  const cy = pick(random, GRID.streets);
  return { x: range(random, 120, GRID.avenues[GRID.avenues.length - 1]), y: cy + (random() < 0.5 ? -GRID.lane : GRID.lane) };
}

/** The centre of a block, for mission markers that sit in the open. */
export function blockCentre(city, c, r) {
  const block = city.blocks.find((b) => b.c === c && b.r === r);
  if (!block) return { x: WORLD.width / 2, y: WORLD.height / 2 };
  return { x: (block.x0 + block.x1) / 2, y: (block.y0 + block.y1) / 2 };
}
