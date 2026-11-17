// Every tuning number, colour and story beat in one place. Solmar Heat is a top-down
// open-world crime game: one fixed city, the player on foot or behind the wheel, traffic,
// pedestrians, police and a three-mission story. The world is a fixed 2560x1920 area; the
// renderer scales the camera to the window, so no rule below depends on the screen size.

export const WORLD = { width: 2560, height: 1920 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Streets and avenues: centre lines, 320 apart, roads 96 wide, blocks 224 square. */
export const GRID = {
  avenues: [160, 480, 800, 1120, 1440, 1760, 2080, 2400],
  streets: [160, 480, 800, 1120, 1440, 1760],
  roadWidth: 96,
  lane: 24,
};

export const BEACH = { sandTop: 1808, waterTop: 1872 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  sprintSpeed: 265,
  health: 100,
  punchRange: 36,
  punchArc: 1.1,
  punchCooldown: 0.45,
  punchDamage: 34,
  enterRange: 58,
};

export const CAR = {
  length: 46,
  width: 24,
  radius: 22,
  accel: 420,
  brake: 620,
  reverseMax: 140,
  maxSpeed: 430,
  policeMaxSpeed: 470,
  trafficSpeed: 150,
  turnRate: 2.9,
  grip: 6.5,
};

export const WANTED = {
  max: 5,
  decaySeconds: 26,
  quietSeconds: 9,
  policePerStar: 1,
  maxPolice: 6,
  bustedSeconds: 1.4,
};

export const MISSIONS = [
  {
    id: 'borrow',
    title: 'Borrow a ride',
    text: 'Mara needs wheels. Take any car on the street and bring it to the garage.',
    reward: 150,
    need: 'carAt',
  },
  {
    id: 'package',
    title: 'The package',
    text: 'Pick up the package on Marina Row, then deliver it across town. The heat is on.',
    reward: 300,
    need: 'pickupThenDeliver',
  },
  {
    id: 'heat',
    title: 'Lose the heat',
    text: 'Three stars and every cruiser in Solmar is on you. Reach the safehouse and vanish.',
    reward: 500,
    need: 'reach',
  },
];

export const PALETTE = {
  grass: '#7fae62',
  parkGrass: '#69a454',
  sidewalk: '#c9bda6',
  road: '#3d3a38',
  roadLine: '#e8d44f',
  sand: '#e6cf9a',
  water: '#2f7fb8',
  waterDeep: '#256a9e',
  building: ['#e8b48a', '#d99a6c', '#c98a7a', '#b8c4a8', '#a8b8c8', '#e0d0b0', '#d0a0a0', '#f0c080', '#c9b18a'],
  roofEdge: '#00000033',
  car: ['#c0392b', '#e67e22', '#f1c40f', '#2980b9', '#8e44ad', '#16a085', '#ecf0f1', '#2c3e50', '#e84393'],
  taxi: '#f7c948',
  police: '#1c4ed8',
  player: '#f5f0e6',
  ped: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'],
  hud: '#f5f0e6',
  hudDim: '#cfc8b8',
  panel: '#141210cc',
  accent: '#ffcf3f',
  danger: '#ff4d4d',
  objective: '#ffcf3f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best cash and missions finished are kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-heat.save';

export const GAME_NAME = 'Solmar Heat';
export const STORY =
  'Solmar, a sun-soaked coastal city. Rico drives for Mara, a fixer who pays in cash and asks no questions. Three jobs stand between Rico and a clean slate.';
