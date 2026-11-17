// The renderer: one canvas, one camera that follows Rico, and everything drawn in world
// space first (streets, blocks, beach, cars, people, particles, the objective marker) and
// then the HUD and the screens in screen space (cash, stars, health, speed, minimap, menus).

import { BEACH, FONT, GRID, MISSIONS, PALETTE, WORLD } from './config.js';
import { currentMission } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 800;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function drawWorld(G) {
    const s = G.s;
    const city = G.city;
    const shakeX = s.shake > 0 ? (G.rng() - 0.5) * s.shake : 0;
    const shakeY = s.shake > 0 ? (G.rng() - 0.5) * s.shake : 0;
    let camX = s.camera.x - viewW / 2;
    let camY = s.camera.y - viewH / 2;
    if (viewW >= WORLD.width) camX = (WORLD.width - viewW) / 2;
    else camX = Math.max(0, Math.min(WORLD.width - viewW, camX));
    if (viewH >= WORLD.height) camY = (WORLD.height - viewH) / 2;
    else camY = Math.max(0, Math.min(WORLD.height - viewH, camY));
    s.view = { x: camX, y: camY, w: viewW, h: viewH };

    ctx.save();
    ctx.translate(-camX + shakeX, -camY + shakeY);

    // Ground: grass everywhere, then the beach and water at the south edge.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(camX - 20, camY - 20, viewW + 40, viewH + 40);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(Math.max(camX, 0), BEACH.sandTop, Math.min(viewW, WORLD.width), BEACH.waterTop - BEACH.sandTop);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(Math.max(camX, 0), BEACH.waterTop, Math.min(viewW, WORLD.width), WORLD.height - BEACH.waterTop);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      const wave = Math.sin((x + s.time * 40) * 0.02) * 4;
      ctx.fillRect(x, BEACH.waterTop + 14 + wave, 46, 3);
    }

    // Roads: dark strips with a dashed centre line.
    ctx.fillStyle = PALETTE.road;
    for (const cx of GRID.avenues) ctx.fillRect(cx - GRID.roadWidth / 2, 0, GRID.roadWidth, BEACH.sandTop);
    for (const cy of GRID.streets) ctx.fillRect(0, cy - GRID.roadWidth / 2, WORLD.width, GRID.roadWidth);
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 26]);
    ctx.beginPath();
    for (const cx of GRID.avenues) {
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, BEACH.sandTop);
    }
    for (const cy of GRID.streets) {
      ctx.moveTo(0, cy);
      ctx.lineTo(WORLD.width, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Blocks: sidewalk slabs; parks are green with trees.
    for (const block of city.blocks) {
      if (block.park) {
        ctx.fillStyle = PALETTE.parkGrass;
        ctx.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      } else {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      }
    }
    for (const tree of city.trees) {
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath();
      ctx.arc(tree.x + 2, tree.y + 3, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f8f3f';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Buildings: a soft shadow, the roof, and a few windows.
    for (const b of city.buildings) {
      if (b.x > camX + viewW + 60 || b.x + b.w < camX - 60 || b.y > camY + viewH + 60 || b.y + b.h < camY - 60) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.roofEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 30));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if (hash2(b.x + i * 31, b.y + j * 29) < 0.45) {
            ctx.fillRect(b.x + 10 + i * 30, b.y + 10 + j * 28, 14, 11);
          }
        }
      }
    }

    // Skid marks fade where they were laid.
    ctx.strokeStyle = 'rgba(20,18,16,0.55)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const skid of s.skids) {
      ctx.globalAlpha = Math.max(0, Math.min(0.55, skid.life / 6));
      ctx.beginPath();
      ctx.moveTo(skid.x1, skid.y1);
      ctx.lineTo(skid.x2, skid.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawObjective(G);

    for (const car of s.cars) drawCar(G, car);
    for (const ped of s.peds) drawPed(G, ped);
    drawPlayer(G);
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawObjective(G) {
    const m = currentMission(G);
    const target = m.target;
    if (!target) return;
    const pulse = 1 + Math.sin(G.s.time * 4) * 0.18;
    ctx.strokeStyle = PALETTE.objective;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,207,63,0.25)';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.objective;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(target.label, target.x, target.y - 44);
    // A light beam so the marker reads from far away.
    ctx.fillStyle = 'rgba(255,207,63,0.08)';
    ctx.fillRect(target.x - 3, target.y - 260, 6, 260);
  }

  function drawCar(G, car) {
    const s = G.s;
    if (car.x < s.view.x - 80 || car.x > s.view.x + s.view.w + 80 || car.y < s.view.y - 80 || car.y > s.view.y + s.view.h + 80) return;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 5, car.len / 2 + 2, 15, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    // Wheels.
    ctx.fillStyle = '#161513';
    ctx.fillRect(-car.len / 2 + 4, -14, 10, 6);
    ctx.fillRect(-car.len / 2 + 4, 8, 10, 6);
    ctx.fillRect(car.len / 2 - 14, -14, 10, 6);
    ctx.fillRect(car.len / 2 - 14, 8, 10, 6);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -car.len / 2, -12, car.len, 24, 7);
    ctx.fill();
    // Roof and windshield.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, -8, -9, 18, 18, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    roundRect(ctx, car.len / 2 - 12, -9, 7, 18, 2);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(-6, -12, 14, 24);
      const flash = Math.floor(G.s.time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f6bff';
      ctx.fillRect(-4, -14, 6, 5);
      ctx.fillStyle = flash ? '#2f6bff' : '#ff3b30';
      ctx.fillRect(3, -14, 6, 5);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#161513';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    ctx.restore();
  }

  function drawPed(G, ped) {
    const s = G.s;
    if (ped.x < s.view.x - 40 || ped.x > s.view.x + s.view.w + 40 || ped.y < s.view.y - 40 || ped.y > s.view.y + s.view.h + 40) return;
    if (ped.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(ped.x + 2, ped.y + 3, 13, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 1, ped.y + 3, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f5d7b0';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(G) {
    const p = G.s.player;
    if (!p.onFoot) return;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b3392e';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Facing tick, and a punch arc while the fist is out.
    ctx.strokeStyle = '#22201c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
    ctx.stroke();
    if (p.punchCd > 0.28) {
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, p.angle - 0.7, p.angle + 0.7);
      ctx.stroke();
    }
  }

  function drawMinimap(G) {
    const s = G.s;
    const mw = 196;
    const mh = 148;
    const mx = viewW - mw - 14;
    const my = 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(16,14,12,0.78)';
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, mx, my, mw, mh, 4);
    ctx.clip();
    ctx.fillStyle = '#5d7a4a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#3d3a38';
    for (const cx of GRID.avenues) ctx.fillRect(mx + cx * sx - 2, my, 4, mh);
    for (const cy of GRID.streets) ctx.fillRect(mx, my + cy * sy - 2, mw, 4);
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(mx, my + BEACH.waterTop * sy, mw, mh - BEACH.waterTop * sy);
    const m = currentMission(G);
    if (m.target) {
      const pulse = 3 + Math.sin(G.s.time * 5) * 1.5;
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.arc(mx + m.target.x * sx, my + m.target.y * sy, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of s.cars) {
      if (car.driver === 'player') continue;
      ctx.fillStyle = car.kind === 'police' ? '#5b8cff' : 'rgba(220,220,220,0.85)';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, car.kind === 'police' ? 3.4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = s.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#161513';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SOLMAR', mx, my + mh + 18);
  }

  function drawHud(G) {
    const s = G.s;
    const m = currentMission(G);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Cash and mission, top left.
    ctx.fillStyle = 'rgba(16,14,12,0.72)';
    roundRect(ctx, 12, 12, 340, 76, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`$${s.cash}`, 24, 42);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(m.title, 24, 64);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `12px ${FONT}`;
    const text = m.text.length > 52 ? m.text.slice(0, 52) + '…' : m.text;
    ctx.fillText(text, 24, 82);
    // Wanted stars, top centre.
    ctx.textAlign = 'center';
    ctx.font = '26px sans-serif';
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < s.wanted ? '★' : '☆';
    ctx.fillStyle = s.wanted > 0 ? '#ffd76a' : 'rgba(245,240,230,0.4)';
    ctx.fillText(stars, viewW / 2, 44);
    drawMinimap(G);
    // Health, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(16,14,12,0.72)';
    roundRect(ctx, 12, viewH - 44, 220, 30, 8);
    ctx.fill();
    ctx.fillStyle = s.health > 40 ? '#58c96b' : '#ff4d4d';
    ctx.fillRect(20, viewH - 36, 160 * (s.health / 100), 14);
    ctx.strokeStyle = 'rgba(245,240,230,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, viewH - 36, 160, 14);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText('HEALTH', 188, viewH - 24);
    // Speed, bottom right, while driving.
    if (!s.player.onFoot) {
      const car = s.cars.find((c) => c.id === s.player.carId);
      const kmh = car ? Math.round(Math.abs(car.speed) * 0.32) : 0;
      ctx.fillStyle = 'rgba(16,14,12,0.72)';
      roundRect(ctx, viewW - 132, viewH - 44, 120, 30, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${kmh} km/h`, viewW - 24, viewH - 22);
    }
    // The objective arrow and distance, when the target is off screen.
    if (m.target && s.view) {
      const t = m.target;
      const onScreen = t.x > s.view.x + 30 && t.x < s.view.x + s.view.w - 30 && t.y > s.view.y + 30 && t.y < s.view.y + s.view.h - 30;
      const dist = Math.round(Math.hypot(s.player.x - t.x, s.player.y - t.y));
      if (!onScreen) {
        const cx = s.view.x + s.view.w / 2;
        const cy = s.view.y + s.view.h / 2;
        const ang = Math.atan2(t.y - cy, t.x - cx);
        const ax = cx + Math.cos(ang) * (s.view.w / 2 - 70);
        const ay = cy + Math.sin(ang) * (s.view.h / 2 - 70);
        const sx = ax - s.view.x;
        const sy = ay - s.view.y;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang);
        ctx.fillStyle = PALETTE.objective;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = PALETTE.objective;
        ctx.font = `bold 14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${dist}m`, sx, sy + 30);
      } else {
        ctx.fillStyle = PALETTE.objective;
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${t.label} — ${dist}m`, viewW / 2, 76);
      }
    }
    // Prompt and banner, bottom centre.
    if (s.prompt) {
      ctx.fillStyle = 'rgba(16,14,12,0.78)';
      const w = ctx.measureText(s.prompt).width + 28;
      roundRect(ctx, viewW / 2 - w / 2, viewH - 84, w, 30, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(s.prompt, viewW / 2, viewH - 64);
    }
    if (s.mission.bannerTimer > 0) {
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(s.mission.banner, viewW / 2, 120);
    }
    // Busted meter while a cruiser sits on Rico.
    if (s.player.bustedMeter > 0.05 && s.wanted > 0) {
      ctx.fillStyle = 'rgba(16,14,12,0.78)';
      roundRect(ctx, viewW / 2 - 110, viewH - 130, 220, 26, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.danger;
      ctx.fillRect(viewW / 2 - 100, viewH - 122, 200 * (s.player.bustedMeter / 1.4), 10);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('BUSTED…', viewW / 2, viewH - 108);
    }
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
    return cy;
  }

  function drawTitle(G) {
    ctx.fillStyle = 'rgba(8,8,14,0.66)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `bold ${Math.min(84, viewW / 12)}px ${FONT}`;
    ctx.fillText('SOLMAR HEAT', viewW / 2, viewH * 0.26);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '20px ' + FONT;
    ctx.fillText('A top-down open-world crime game', viewW / 2, viewH * 0.26 + 38);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '16px ' + FONT;
    const endY = wrapText(
      'Solmar, a sun-soaked coastal city. Rico drives for Mara, a fixer who pays in cash and asks no questions. Three jobs stand between Rico and a clean slate.',
      viewW / 2,
      viewH * 0.26 + 84,
      Math.min(640, viewW - 80),
      24,
    );
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '15px ' + FONT;
    const lines = [
      'WASD / arrows — walk and drive    Shift — sprint',
      'E — steal / leave a car    Space — punch    P — pause    M — mute',
      'Steal cars, run missions, lose the heat. Watch the stars.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, viewW / 2, endY + 44 + i * 26));
    if (G.s.bestCash > 0 || G.s.missionsDone > 0) {
      ctx.fillStyle = PALETTE.accent;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(`Best cash: $${G.s.bestCash}    Jobs finished: ${G.s.missionsDone} / ${MISSIONS.length}`, viewW / 2, endY + 44 + 3 * 26 + 22);
    }
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 22px ' + FONT;
    const blink = Math.floor(G.s.time * 1.6) % 2 === 0;
    if (blink) ctx.fillText('Press Enter or click to start', viewW / 2, viewH * 0.88);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,8,14,0.6)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = 'center';
    ctx.font = `bold 54px ${FONT}`;
    ctx.fillText('PAUSED', viewW / 2, viewH / 2 - 10);
    ctx.font = '18px ' + FONT;
    ctx.fillText('P or Esc — resume', viewW / 2, viewH / 2 + 30);
  }

  function drawOver(G) {
    ctx.fillStyle = 'rgba(8,8,14,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    const busted = G.s.overKind === 'busted';
    ctx.fillStyle = busted ? '#5b8cff' : PALETTE.danger;
    ctx.font = `bold ${Math.min(84, viewW / 10)}px ${FONT}`;
    ctx.fillText(busted ? 'BUSTED' : 'WASTED', viewW / 2, viewH * 0.4);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '19px ' + FONT;
    ctx.fillText(
      busted ? 'The Solmar police finally caught up with Rico.' : 'Rico went down hard on the streets of Solmar.',
      viewW / 2,
      viewH * 0.4 + 40,
    );
    ctx.fillStyle = PALETTE.accent;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(`Cash: $${G.s.cash}    Jobs finished: ${G.s.missionsDone} / ${MISSIONS.length}`, viewW / 2, viewH * 0.4 + 84);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = 'bold 22px ' + FONT;
    const blink = Math.floor(G.s.time * 1.6) % 2 === 0;
    if (blink) ctx.fillText('Press Enter or click to try again', viewW / 2, viewH * 0.4 + 140);
  }

  return {
    resize,
    viewSize() {
      return { w: viewW, h: viewH };
    },
    draw(G, screen) {
      drawWorld(G);
      if (screen === SCREEN_PLAY) drawHud(G);
      else if (screen === SCREEN_TITLE) drawTitle(G);
      else if (screen === SCREEN_PAUSED) {
        drawHud(G);
        drawPaused();
      } else if (screen === SCREEN_OVER) drawOver(G);
    },
  };
}
