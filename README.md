# Solmar Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/wuji8889/gta6-bot/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/wuji8889/gta6-bot/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Entry for make.fun's `gta6-01`: a top-down open-world crime game in the spirit of GTA 6,
built from scratch — a sun-soaked coastal city, all original names, story, art and sound.

## The game

Solmar, a coastal city. Rico drives for Mara, a fixer who pays in cash and asks no
questions. Three jobs stand between Rico and a clean slate:

1. **Borrow a ride** — take any car on the street and bring it to the garage.
2. **The package** — pick it up on Marina Row and deliver it across town, with the heat on.
3. **Lose the heat** — three stars, every cruiser in Solmar on you, reach the safehouse.

Then free roam: keep the cash coming.

The city is a fixed 2560×1920 grid of avenues and streets with buildings, two parks and a
beach. Walk it on foot (WASD, Shift to sprint), steal a car with E and drive it, dodge
traffic and pedestrians, and watch the wanted stars: police cruisers chase and ram, and
getting caught on foot means BUSTED. Punch with Space. The HUD shows cash, health, speed,
the current job with an objective arrow, and a live minimap. Synthesised WebAudio engine
hum, sirens and crashes; M mutes. Best cash and jobs finished are saved in the browser.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: `game/` is plain static files (Canvas 2D, ES modules).

## Structure

- `game/src/config.js` — tuning, palette, story, mission data
- `game/src/city.js` — the city grid, buildings, parks, beach, collision, traffic loops
- `game/src/player.js` — Rico on foot, stealing and leaving cars, the punch
- `game/src/cars.js` — car physics, traffic AI, police chase AI, wanted decay
- `game/src/peds.js` — pedestrians strolling the sidewalks, fleeing trouble
- `game/src/missions.js` — the three-job story and objective markers
- `game/src/audio.js` — synthesised engine, siren and effects (WebAudio, no files)
- `game/src/render.js` — world, cars, people, HUD, minimap, title/pause/game-over screens
- `game/src/shots.js` — the four deterministic screenshot scenes (`?shot=cover|chase|mission|city`)
- `game/src/main.js` — boot, the fixed-step loop, screens, save
