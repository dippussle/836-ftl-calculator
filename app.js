/**
 * 836 FTL v2 — Nether Pearl Calculator
 * Pure JavaScript physics engine. Faithfully reimplements the Python/Rust version.
 *
 * Key accuracy note: Minecraft uses 32-bit floats (f32) for physics.
 * We use Math.fround() wherever the original code uses float32.
 *
 * Sources:
 *  - https://github.com/garlic-bred/836-FTL-V2-Calculator      (Rust/WASM web version)
 *  - https://github.com/garlic-bred/836-FTL-V2-calculator-python (Python reference)
 */

// ═══════════════════════════════════════════════════════
//  CONSTANTS  (mirrors Data.py / data.rs exactly)
// ═══════════════════════════════════════════════════════

const F32 = Math.fround; // shorthand — critical for accuracy

// PEARL_EYE_HEIGHT = 0.25 * float(float32(0.85))
const PEARL_EYE_HEIGHT = 0.25 * F32(0.85);

// EXPLOSION_HEIGHT = float(float32(0.98)) * float(float32(0.0625))
const EXPLOSION_HEIGHT = F32(0.98) * F32(0.0625);

// BASKET_TNT_Y = 173.875 - float(float32(0.98)) - 0.04
// This is the Y of the basket TNT layer
const BASKET_TNT_Y = 173.875 - F32(0.98) - 0.04;

// PEARL_Y = 173.875  (pearl launch Y)
const PEARL_Y = 173.875;

// UPACCEL_TNT_Y — TNT below the pearl for upward acceleration
// From data.rs: BASKET_TNT_Y - EXPLOSION_HEIGHT
const UPACCEL_TNT_Y = BASKET_TNT_Y - EXPLOSION_HEIGHT;

// UPACCEL_TNT_LONGRANGE_Y — lower position for long-range upaccel
// From data.rs: UPACCEL_TNT_Y - float(float32(0.98))
const UPACCEL_TNT_LONGRANGE_Y = UPACCEL_TNT_Y - F32(0.98);

// PEARL_HORIZONTAL_OFFSET — TNT is offset from pearl by this amount
// From data.rs: 0.5  (TNT placed at pearl.x - 0.5, pearl.z - 0.5)
const PEARL_HORIZONTAL_OFFSET = 0.5;

// PEARL_DECAY — air drag per tick (f32!)
const PEARL_DECAY = F32(0.99);

// PEARL_Y_MOTION — initial upward velocity from the launch platform
// From Rust lib.rs: the wasm_simulate function initialises with PEARL_Y_MOTION
// From Rust data.rs reference: PEARL_Y_MOTION = float(float32(-0.0784000015258789))
// This is the velocity the pearl has after falling from the basket + the upward platform launch
// Checking the lib.rs wasm_simulate signature: it takes motion_x, motion_y, motion_z directly
// So initial_motion.y in PearlSimulation::new() is PEARL_Y_MOTION passed from the JS caller
// Per the Python code, PEARL_Y_MOTION = float(float32(-0.0784000015258789))
const PEARL_Y_MOTION = F32(-0.0784000015258789);

// NUM_OF_ANGLES — how many angle sub-divisions per direction octant
const NUM_OF_ANGLES = 4;

// MAX_UPACCEL_TNT
const MAX_UPACCEL_TNT = 40;

// MAX_TNT per basket (early or late)
const MAX_BASKET_TNT_PER_SIDE = 3344; // half of 6688

// ═══════════════════════════════════════════════════════
//  VEC3
// ═══════════════════════════════════════════════════════

class Vec3 {
  constructor(x, y, z) {
    this.x = +x; this.y = +y; this.z = +z;
  }
  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  multiply(n) { return new Vec3(this.x * n, this.y * n, this.z * n); }
  length() { return Math.sqrt(this.x**2 + this.y**2 + this.z**2); }
  lengthH() { return Math.sqrt(this.x**2 + this.z**2); }
  normalized() { const l = this.length(); return l === 0 ? new Vec3(0,0,0) : this.multiply(1/l); }
  distanceTo(v) { return this.sub(v).length(); }
}

// ═══════════════════════════════════════════════════════
//  TNT EXPLOSION VELOCITY  (matches Entity.py / entity.rs)
// ═══════════════════════════════════════════════════════

/**
 * Calculate velocity impulse from one TNT at tntPos applied to an entity at eyePos.
 * exposure: float, typically 1.0
 * count: number of TNT (multiplier)
 * Returns Vec3 velocity delta.
 */
function calcTntVelocity(tntPos, eyePos, exposure, count) {
  const dx = eyePos.x - tntPos.x;
  const dy = eyePos.y - tntPos.y;
  const dz = eyePos.z - tntPos.z;

  // dist computed in f64 for the outer division but the inner distance uses sqrt
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (dist >= 8.0 || dist === 0) return new Vec3(0,0,0);

  // push factor: (1 - dist/8) * exposure / dist
  const push = (1.0 - dist / 8.0) * exposure / dist;

  return new Vec3(dx * push * count, dy * push * count, dz * push * count);
}

// ═══════════════════════════════════════════════════════
//  DIRECTION  (matches Direction class in Calculator.py / calculator.rs)
// ═══════════════════════════════════════════════════════

const DIR = {
  WNW: 0, ENE: 1, NNW: 2, NNE: 3,
  SSE: 4, SSW: 5, ESE: 6, WSW: 7,
};
const DIR_NAMES = ['WNW','ENE','NNW','NNE','SSE','SSW','ESE','WSW'];

function calculateDirection(vec) {
  // Angle of the horizontal displacement
  let vecAngle = Math.atan2(vec.z, vec.x) * (180 / Math.PI);
  if (vecAngle < 0) vecAngle += 360;

  let direction;
  if      (vecAngle <  45) direction = DIR.ESE;
  else if (vecAngle <  90) direction = DIR.SSE;
  else if (vecAngle < 135) direction = DIR.SSW;
  else if (vecAngle < 180) direction = DIR.WSW;
  else if (vecAngle < 225) direction = DIR.WNW;
  else if (vecAngle < 270) direction = DIR.NNW;
  else if (vecAngle < 315) direction = DIR.NNE;
  else                      direction = DIR.ENE;

  // Compute angle sub-index (0..NUM_OF_ANGLES-1)
  const cos45 = Math.cos(Math.PI / 4);
  const sin45 = Math.sin(Math.PI / 4);
  const rx = vec.x * cos45 - vec.z * sin45;
  const rz = vec.x * sin45 + vec.z * cos45;
  const scale = NUM_OF_ANGLES / Math.max(Math.abs(rx), Math.abs(rz));
  const angle = Math.floor(Math.min(Math.abs(rx * scale), Math.abs(rz * scale)));

  return { direction, angle };
}

// ═══════════════════════════════════════════════════════
//  TNT VECTORS (Early and Late)
//  The 836 cannon basket has 4 TNT positions at ±0.5 offsets in X and Z
//  from the pearl. Each direction octant uses two perpendicular arms.
//  We compute the velocity impulse of 1 TNT from each arm, then solve
//  a linear system to find how many of each to use.
// ═══════════════════════════════════════════════════════

/**
 * The 836 FTL v2 basket TNT is arranged in a cross/diagonal pattern.
 * The cannon has two firing groups per direction:
 *   "Early" TNT fires first along one axis
 *   "Late"  TNT fires second along the perpendicular axis
 *
 * For each of the 8 direction octants, we pick the pair of TNT arm positions
 * that span the required quadrant. The TNT positions are at:
 *   pearl.xz + {(−0.5,−0.5), (+0.5,−0.5), (−0.5,+0.5), (+0.5,+0.5)}
 *
 * The unit vectors for each direction come directly from the explosion impulse
 * of exactly 1 TNT from each arm position.
 */
function calculateTntVectors(distanceVec, dirResult) {
  // Use a canonical pearl position for unit vector computation.
  // The actual TNT impulse ratio is position-independent (only distance ratio matters,
  // and the TNT is always placed at pearl ± 0.5 in X and Z).
  const pearlX   = 0.51;
  const pearlZ   = 0.51;
  const eyeY     = PEARL_Y + PEARL_EYE_HEIGHT;
  const eyePos   = new Vec3(pearlX, eyeY, pearlZ);

  // The 836 cannon's 4 basket TNT arm offsets (relative to pearl XZ):
  // These are the physical positions of the TNT dispensers in each arm.
  // Arms A and B are perpendicular diagonals.
  //
  // From the cannon design:
  //   Arm 0: TNT at (pearl.x - 0.5, Y, pearl.z - 0.5)   → pushes +X, +Z
  //   Arm 1: TNT at (pearl.x + 0.5, Y, pearl.z - 0.5)   → pushes -X, +Z
  //   Arm 2: TNT at (pearl.x - 0.5, Y, pearl.z + 0.5)   → pushes +X, -Z
  //   Arm 3: TNT at (pearl.x + 0.5, Y, pearl.z + 0.5)   → pushes -X, -Z
  //
  // Direction octants map to (early arm, late arm) pairs:
  //  WNW(0): −X dominant,  uses arms that push mostly −X
  //  ENE(1): +X dominant,  uses arms that push mostly +X
  //  NNW(2): −Z dominant,  uses arms that push mostly −Z
  //  NNE(3): +Z, −X corner
  //  SSE(4): +Z dominant
  //  SSW(5): −X, +Z corner
  //  ESE(6): +X, −Z corner
  //  WSW(7): −X, −Z corner

  // Each entry: [earlyArmOffset, lateArmOffset] as [dx, dz] pairs
  const ARM_PAIRS = [
    [[-0.5, -0.5], [-0.5, +0.5]],  // 0 WNW
    [[+0.5, +0.5], [+0.5, -0.5]],  // 1 ENE
    [[-0.5, -0.5], [+0.5, -0.5]],  // 2 NNW
    [[+0.5, +0.5], [-0.5, +0.5]],  // 3 NNE
    [[+0.5, -0.5], [+0.5, +0.5]],  // 4 SSE
    [[-0.5, +0.5], [-0.5, -0.5]],  // 5 SSW
    [[+0.5, -0.5], [-0.5, -0.5]],  // 6 ESE
    [[-0.5, +0.5], [+0.5, +0.5]],  // 7 WSW
  ];

  const [ea, la] = ARM_PAIRS[dirResult.direction];

  const earlyTntPos = new Vec3(pearlX + ea[0], BASKET_TNT_Y, pearlZ + ea[1]);
  const lateTntPos  = new Vec3(pearlX + la[0], BASKET_TNT_Y, pearlZ + la[1]);

  const earlyVec = calcTntVelocity(earlyTntPos, eyePos, 1.0, 1);
  const lateVec  = calcTntVelocity(lateTntPos,  eyePos, 1.0, 1);

  return { earlyVec, lateVec };
}

// ═══════════════════════════════════════════════════════
//  UPACCEL — which ticks can the pearl be stopped at?
//  Matches Python calculatePossibleTicks()
// ═══════════════════════════════════════════════════════

/**
 * IMPORTANT — stop direction:
 *   stopHeight > PEARL_Y  → pearl goes UP to hit a placed block (e.g. y=256 build limit)
 *                           condition: y >= stopHeight
 *   stopHeight < PEARL_Y  → pearl descends to hit bedrock ceiling below (e.g. y=128 nether)
 *                           condition: y <= stopHeight
 *
 * The 836 cannon is above nether bedrock (PEARL_Y ≈ 173.875).
 * Nether bedrock is at y=127, so PEARL_STOP_HEIGHT=128 means descending mode.
 *
 * Returns array of {tick, upaccelTnt, longRange} objects.
 */
function calculatePossibleTicks(stopHeight, maxTicks = 500) {
  const results = [];
  const goingUp = stopHeight > PEARL_Y; // true for build-limit, false for nether bedrock

  for (let longRange of [false, true]) {
    for (let upaccelTnt = 0; upaccelTnt <= MAX_UPACCEL_TNT; upaccelTnt++) {
      const tntY = longRange ? UPACCEL_TNT_LONGRANGE_Y : UPACCEL_TNT_Y;

      const pearlX = 0.51, pearlZ = 0.51;
      const pearlEyeY = PEARL_Y + PEARL_EYE_HEIGHT;

      const tntPos = new Vec3(pearlX - PEARL_HORIZONTAL_OFFSET, tntY, pearlZ - PEARL_HORIZONTAL_OFFSET);
      const eyePos = new Vec3(pearlX, pearlEyeY, pearlZ);

      const upaccelV = calcTntVelocity(tntPos, eyePos, 1.0, upaccelTnt);

      let vy = PEARL_Y_MOTION + upaccelV.y;
      let y  = PEARL_Y;

      for (let tick = 1; tick <= maxTicks; tick++) {
        vy -= 0.03;               // gravity
        vy  = F32(vy * F32(0.99)); // drag (f32!)
        y  += vy;

        if (goingUp ? (y >= stopHeight) : (y <= stopHeight)) {
          results.push({ tick, upaccelTnt, longRange });
          break;
        }

        // Safety exits
        if (goingUp && vy < 0 && y < PEARL_Y - 5) break; // fell below without hitting top
        if (!goingUp && y < stopHeight - 200) break;       // fell way past the floor
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  PEARL SIMULATION  (tick-by-tick)
// ═══════════════════════════════════════════════════════

/**
 * Simulate the full pearl path.
 * pos: Vec3 starting position
 * motion: Vec3 starting velocity
 * stopHeight: Y to stop at
 * maxTicks: safety limit
 * Returns array of {tick, pos, motion} snapshots
 */
function simulatePearl(pos, motion, stopHeight, maxTicks = 500) {
  const snapshots = [];
  let p = new Vec3(pos.x, pos.y, pos.z);
  let m = new Vec3(motion.x, motion.y, motion.z);
  const goingUp = stopHeight > pos.y; // nether bedrock is BELOW the cannon

  for (let tick = 1; tick <= maxTicks; tick++) {
    m = new Vec3(m.x, m.y - 0.03, m.z);
    m = new Vec3(
      F32(m.x * PEARL_DECAY),
      F32(m.y * PEARL_DECAY),
      F32(m.z * PEARL_DECAY),
    );
    p = p.add(m);

    snapshots.push({ tick, pos: new Vec3(p.x, p.y, p.z), motion: new Vec3(m.x, m.y, m.z) });

    // Stop when pearl crosses the stop height in the correct direction
    if (goingUp  && p.y >= stopHeight) break;
    if (!goingUp && p.y <= stopHeight) break;
  }

  return snapshots;
}

// ═══════════════════════════════════════════════════════
//  MAIN CALCULATION  (matches Calculator.py calculate())
// ═══════════════════════════════════════════════════════

/**
 * Calculate all valid TNT combinations to send the pearl from originX,originZ
 * to destX, destZ, stopping at stopHeight.
 *
 * Returns array of result objects sorted by total TNT.
 */
function calculate({
  originX, originZ,
  destX, destZ,
  stopHeight = 128,
  maxTnt = 6688,
  maxTicks = 500,
  maxDistance = 0.5,
  maxResults = 50,
}) {
  // Pearl launch position: floor(origin) + 0.51 (canonical for this cannon)
  const pearlX = Math.floor(originX) + 0.51;
  const pearlZ = Math.floor(originZ) + 0.51;

  // Horizontal distance vector from pearl to destination
  const distVec = new Vec3(destX - pearlX, 0, destZ - pearlZ);

  // Figure out which direction octant we're in
  const dirResult = calculateDirection(distVec);

  // Get the unit velocity vectors for this direction
  const { earlyVec, lateVec } = calculateTntVectors(distVec, dirResult);

  // Get all valid upaccel configs for this stop height
  const possibleTicks = calculatePossibleTicks(stopHeight, maxTicks);

  if (possibleTicks.length === 0) {
    return { error: `No valid upaccel configs found for stop height y=${stopHeight}. Try increasing max ticks.` };
  }

  const results = [];

  // For each possible tick count (determined by upaccel):
  // accumulate the decay sum (sum of 0.99^t for t=1..tick)
  // solve: earlyTnt * earlyVec + lateTnt * lateVec = distVec / decay_sum

  let divider = 0;

  // We'll iterate ticks from 1..maxTicks and track which ones are valid
  // (i.e., appear in possibleTicks)
  const tickMap = new Map();
  for (const t of possibleTicks) {
    if (!tickMap.has(t.tick)) tickMap.set(t.tick, []);
    tickMap.get(t.tick).push(t);
  }

  for (let tick = 1; tick <= maxTicks; tick++) {
    divider += Math.pow(F32(0.99), tick);

    if (!tickMap.has(tick)) continue;

    const configs = tickMap.get(tick);

    for (const cfg of configs) {
      // Solve linear system:
      // earlyTnt * earlyVec.x + lateTnt * lateVec.x = distVec.x / divider
      // earlyTnt * earlyVec.z + lateTnt * lateVec.z = distVec.z / divider
      const denom = earlyVec.z * lateVec.x - lateVec.z * earlyVec.x;
      if (Math.abs(denom) < 1e-12) continue;

      const earlyExact = (distVec.z * lateVec.x - distVec.x * lateVec.z) / (denom * divider);
      const lateExact  = (distVec.x - earlyExact * earlyVec.x) / (lateVec.x === 0
        ? (Math.abs(lateVec.z) > 1e-12 ? lateVec.z : 1) : lateVec.x) / divider;

      // Search ±2 around rounded values
      const earlyBase = Math.round(earlyExact);
      const lateBase  = Math.round(lateExact);

      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          const earlyTnt = earlyBase + a;
          const lateTnt  = lateBase  + b;

          if (earlyTnt < 0 || lateTnt < 0) continue;

          const totalTnt = earlyTnt + lateTnt + cfg.upaccelTnt;
          if (maxTnt > 0 && totalTnt > maxTnt) continue;
          if (earlyTnt > MAX_BASKET_TNT_PER_SIDE || lateTnt > MAX_BASKET_TNT_PER_SIDE) continue;

          // Simulate pearl to find actual landing position
          const sim = buildSimulation({
            pearlX, pearlZ,
            earlyTnt, lateTnt,
            earlyVec, lateVec,
            upaccelTnt: cfg.upaccelTnt,
            longRange: cfg.longRange,
            tick,
            stopHeight,
          });

          const landing = sim.snapshots[sim.snapshots.length - 1];
          if (!landing) continue;

          const dx = landing.pos.x - destX;
          const dz = landing.pos.z - destZ;
          const error = Math.sqrt(dx*dx + dz*dz);

          if (error > maxDistance) continue;

          results.push({
            tick,
            earlyTnt,
            lateTnt,
            upaccelTnt: cfg.upaccelTnt,
            totalTnt,
            error,
            longRange: cfg.longRange,
            direction: dirResult.direction,
            angle: dirResult.angle,
            landing: landing.pos,
            sim,
          });

          if (results.length >= maxResults * 5) break; // early exit if we have loads
        }
        if (results.length >= maxResults * 5) break;
      }
    }
  }

  // Sort by total TNT, then by error
  results.sort((a, b) => a.totalTnt - b.totalTnt || a.error - b.error);

  return { results: results.slice(0, maxResults), direction: dirResult };
}

/**
 * Build a full pearl simulation for a given TNT configuration.
 * Returns simulation object with snapshots.
 */
function buildSimulation({ pearlX, pearlZ, earlyTnt, lateTnt, earlyVec, lateVec,
                           upaccelTnt, longRange, tick, stopHeight }) {
  const tntY = longRange ? UPACCEL_TNT_LONGRANGE_Y : UPACCEL_TNT_Y;
  const pearlEyeY = PEARL_Y + PEARL_EYE_HEIGHT;

  // Upaccel velocity
  const tntPos = new Vec3(pearlX - PEARL_HORIZONTAL_OFFSET, tntY, pearlZ - PEARL_HORIZONTAL_OFFSET);
  const eyePos = new Vec3(pearlX, pearlEyeY, pearlZ);
  const upaccelVel = calcTntVelocity(tntPos, eyePos, 1.0, upaccelTnt);

  // Total initial motion
  const initMotion = new Vec3(
    earlyVec.x * earlyTnt + lateVec.x * lateTnt,
    PEARL_Y_MOTION + upaccelVel.y,
    earlyVec.z * earlyTnt + lateVec.z * lateTnt,
  );

  const startPos = new Vec3(pearlX, PEARL_Y, pearlZ);
  const snapshots = simulatePearl(startPos, initMotion, stopHeight, tick + 50);

  return { snapshots, initMotion, startPos };
}

// ═══════════════════════════════════════════════════════
//  ENCODING  (matches Encoding.py / encoding.rs)
// ═══════════════════════════════════════════════════════

function calcBits(tnt) {
  const big    = Math.floor(tnt / 418);
  const rem    = tnt % 418;
  const medium = Math.floor(rem / 11);
  const small  = rem % 11;
  return { big, medium, small };
}

function calcUpaccelBits(tnt) {
  return { high: Math.floor(tnt / 8), low: tnt % 8 };
}

function buildEncoding({ earlyTnt, lateTnt, upaccelTnt, direction, angle, longRange }) {
  const early  = calcBits(earlyTnt);
  const late   = calcBits(lateTnt);
  const upaccel = calcUpaccelBits(upaccelTnt);
  const yellow  = direction + (longRange ? 8 : 0);

  return [
    { color: '#3498db', name: 'Blue',       count: upaccel.high, desc: `Upaccel ÷ 8` },
    { color: '#9b59b6', name: 'Purple',     count: upaccel.low,  desc: `Upaccel mod 8` },
    { color: '#1abc9c', name: 'Cyan',       count: late.small,   desc: `Late mod 11` },
    { color: '#85c1e9', name: 'Light Blue', count: late.medium,  desc: `Late ÷11 mod 38` },
    { color: '#2ecc71', name: 'Lime',       count: late.big,     desc: `Late ÷ 418` },
    { color: '#f1c40f', name: 'Yellow',     count: yellow,       desc: `Direction${longRange ? ' (LR)' : ''}` },
    { color: '#e67e22', name: 'Orange',     count: early.medium, desc: `Early ÷11 mod 38` },
    { color: '#e74c3c', name: 'Red',        count: early.big,    desc: `Early ÷ 418` },
    { color: '#ff69b4', name: 'Pink',       count: early.small,  desc: `Early mod 11` },
    { color: '#888',    name: 'Magenta',    count: 0,            desc: `(unused for normal FTL)` },
    { color: '#7d3c98', name: 'Purple2',    count: angle,        desc: `Angle sub-index` },
  ];
}

// ═══════════════════════════════════════════════════════
//  UI  ——  Tab switching
// ═══════════════════════════════════════════════════════

for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
}

// ═══════════════════════════════════════════════════════
//  UI  ——  Stop mode selector
// ═══════════════════════════════════════════════════════

// Stop mode banner update
const stopModeEl = document.getElementById('c-stop-mode');
const bannerEl   = document.getElementById('stop-mode-banner');
stopModeEl.addEventListener('change', function() {
  if (this.value === '128') {
    bannerEl.textContent = '\ud83e\uddf1 The pearl descends from y≈173 and is caught by the bedrock ceiling at y=127. No block needed.';
    bannerEl.className = 'info-banner info-nether';
  } else {
    bannerEl.textContent = '\ud83d� Place a block at y=255 at the destination before firing. The pearl will hit it on the way up.';
    bannerEl.className = 'info-banner info-overworld';
  }
});

// ═══════════════════════════════════════════════════════
//  UI  ——  Calculate TNT
// ═══════════════════════════════════════════════════════

let savedResults = [];
let selectedResult = null;

document.getElementById('btn-calculate').addEventListener('click', () => {
  const statusEl = document.getElementById('calc-status');
  const wrapEl   = document.getElementById('results-wrap');
  const phEl     = document.getElementById('results-placeholder');
  const tbodyEl  = document.getElementById('results-tbody');
  const metaEl   = document.getElementById('results-meta');
  const detailCard = document.getElementById('detail-card');

  statusEl.textContent = '';
  statusEl.className = 'status-msg';

  const originX  = parseFloat(document.getElementById('c-origin-x').value);
  const originZ  = parseFloat(document.getElementById('c-origin-z').value);
  const destX    = parseFloat(document.getElementById('c-dest-x').value);
  const destZ    = parseFloat(document.getElementById('c-dest-z').value);
  const maxTnt   = parseInt(document.getElementById('c-max-tnt').value, 10);
  const maxTicks = parseInt(document.getElementById('c-max-ticks').value, 10);
  const maxDist  = parseFloat(document.getElementById('c-max-dist').value);
  const maxRes   = parseInt(document.getElementById('c-max-results').value, 10);

  const stopModeVal = document.getElementById('c-stop-mode').value;
  const stopHeight  = parseFloat(stopModeVal);

  if ([originX, originZ, destX, destZ, maxTnt, maxTicks, maxDist, stopHeight].some(isNaN)) {
    statusEl.textContent = '⚠ Please fill in all fields with valid numbers.';
    statusEl.className = 'status-msg error';
    return;
  }

  if (destX === originX && destZ === originZ) {
    statusEl.textContent = '⚠ Origin and destination are the same.';
    statusEl.className = 'status-msg error';
    return;
  }

  const horizDist = Math.sqrt((destX-originX)**2 + (destZ-originZ)**2);
  statusEl.innerHTML = '<span class="spinning">⚡</span> Calculating…';
  statusEl.className = 'status-msg info';

  // Run calculation on next frame to allow UI update
  setTimeout(() => {
    try {
      const t0 = performance.now();
      const out = calculate({ originX, originZ, destX, destZ, stopHeight,
                              maxTnt, maxTicks, maxDistance: maxDist, maxResults: maxRes });
      const elapsed = (performance.now() - t0).toFixed(0);

      if (out.error) {
        statusEl.textContent = '❌ ' + out.error;
        statusEl.className = 'status-msg error';
        return;
      }

      savedResults = out.results;
      selectedResult = null;
      detailCard.style.display = 'none';

      if (out.results.length === 0) {
        statusEl.textContent = `No results found. Try increasing Max TNT, Max Ticks, or Max Error.`;
        statusEl.className = 'status-msg error';
        phEl.style.display = 'flex';
        wrapEl.style.display = 'none';
        return;
      }

      // Render table
      tbodyEl.innerHTML = '';
      for (let i = 0; i < out.results.length; i++) {
        const r = out.results[i];
        const tr = document.createElement('tr');
        tr.dataset.idx = i;
        tr.innerHTML = `
          <td>${r.tick}</td>
          <td>${r.earlyTnt}</td>
          <td>${r.lateTnt}</td>
          <td>${r.upaccelTnt}</td>
          <td><strong>${r.totalTnt}</strong></td>
          <td>${r.error.toFixed(4)}</td>
          <td>${r.longRange ? '<span class="badge badge-yellow">LR</span>' : '<span class="badge badge-muted">—</span>'}</td>
          <td><button class="select-btn" data-idx="${i}">Select</button></td>
        `;
        tbodyEl.appendChild(tr);
      }

      // Select button handlers
      tbodyEl.querySelectorAll('.select-btn').forEach(btn => {
        btn.addEventListener('click', () => selectResult(parseInt(btn.dataset.idx)));
      });

      const d = DIR_NAMES[out.direction?.direction ?? 0];
      metaEl.textContent =
        `Found ${out.results.length} results in ${elapsed}ms · Horizontal distance: ${horizDist.toFixed(1)} blocks · Direction: ${d} · Stop height: y=${stopHeight}`;

      phEl.style.display = 'none';
      wrapEl.style.display = 'block';

      statusEl.textContent = `✓ ${out.results.length} result${out.results.length !== 1 ? 's' : ''} found`;
      statusEl.className = 'status-msg ok';

    } catch (err) {
      statusEl.textContent = '❌ Error: ' + err.message;
      statusEl.className = 'status-msg error';
      console.error(err);
    }
  }, 10);
});

function selectResult(idx) {
  selectedResult = savedResults[idx];
  const r = selectedResult;

  // Highlight row
  document.querySelectorAll('#results-tbody tr').forEach((tr, i) => {
    tr.classList.toggle('selected-row', i === idx);
  });

  // Build detail panel
  const detailGrid = document.getElementById('detail-grid');
  const landing = r.landing;
  detailGrid.innerHTML = '';

  const items = [
    { label: 'Total TNT',     value: r.totalTnt,                     cls: 'big' },
    { label: 'Early TNT',     value: r.earlyTnt,                     cls: '' },
    { label: 'Late TNT',      value: r.lateTnt,                      cls: '' },
    { label: 'Upaccel TNT',   value: r.upaccelTnt,                   cls: '' },
    { label: 'Ticks in Air',  value: r.tick,                         cls: '' },
    { label: 'Landing Error', value: r.error.toFixed(5) + ' blks',   cls: r.error > 0.25 ? 'warn' : '' },
    { label: 'Long Range',    value: r.longRange ? 'Yes' : 'No',     cls: r.longRange ? 'warn' : '' },
    { label: 'Direction',     value: `${DIR_NAMES[r.direction]} (${r.direction})`, cls: '' },
    { label: 'Angle Index',   value: r.angle,                        cls: '' },
    { label: 'Landing X',     value: landing ? landing.x.toFixed(3) : '?', cls: '' },
    { label: 'Landing Y',     value: landing ? landing.y.toFixed(3) : '?', cls: '' },
    { label: 'Landing Z',     value: landing ? landing.z.toFixed(3) : '?', cls: '' },
  ];

  for (const item of items) {
    const div = document.createElement('div');
    div.className = 'detail-item';
    div.innerHTML = `<div class="detail-label">${item.label}</div>
                     <div class="detail-value ${item.cls}">${item.value}</div>`;
    detailGrid.appendChild(div);
  }

  document.getElementById('detail-card').style.display = 'block';
  document.getElementById('detail-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Send to encoding tab
document.getElementById('btn-send-to-encode').addEventListener('click', () => {
  if (!selectedResult) return;
  const r = selectedResult;
  document.getElementById('e-early').value     = r.earlyTnt;
  document.getElementById('e-late').value      = r.lateTnt;
  document.getElementById('e-upaccel').value   = r.upaccelTnt;
  document.getElementById('e-direction').value = r.direction;
  document.getElementById('e-angle').value     = r.angle;
  document.getElementById('e-longrange').value = r.longRange ? '1' : '0';
  // Switch to encoding tab
  document.querySelector('[data-tab="enc"]').click();
  // Auto-generate
  document.getElementById('btn-encode').click();
});

// Send to simulate tab
document.getElementById('btn-send-to-sim').addEventListener('click', () => {
  if (!selectedResult) return;
  const r = selectedResult;
  const pearlX = Math.floor(parseFloat(document.getElementById('c-origin-x').value)) + 0.51;
  const pearlZ = Math.floor(parseFloat(document.getElementById('c-origin-z').value)) + 0.51;
  document.getElementById('s-pos-x').value = pearlX;
  document.getElementById('s-pos-y').value = PEARL_Y;
  document.getElementById('s-pos-z').value = pearlZ;
  document.getElementById('s-vel-x').value = r.sim.initMotion.x.toFixed(6);
  document.getElementById('s-vel-y').value = r.sim.initMotion.y.toFixed(6);
  document.getElementById('s-vel-z').value = r.sim.initMotion.z.toFixed(6);

  const stopH = parseFloat(document.getElementById('c-stop-mode').value);
  document.getElementById('s-stop-y').value = stopH;

  document.querySelector('[data-tab="sim"]').click();
  document.getElementById('btn-simulate').click();
});

// ═══════════════════════════════════════════════════════
//  UI  ——  Pearl Simulation
// ═══════════════════════════════════════════════════════

document.getElementById('btn-simulate').addEventListener('click', () => {
  const posX   = parseFloat(document.getElementById('s-pos-x').value);
  const posY   = parseFloat(document.getElementById('s-pos-y').value);
  const posZ   = parseFloat(document.getElementById('s-pos-z').value);
  const velX   = parseFloat(document.getElementById('s-vel-x').value);
  const velY   = parseFloat(document.getElementById('s-vel-y').value);
  const velZ   = parseFloat(document.getElementById('s-vel-z').value);
  const stopY  = parseFloat(document.getElementById('s-stop-y').value);
  const maxT   = parseInt(document.getElementById('s-max-ticks').value, 10);

  if ([posX, posY, posZ, velX, velY, velZ, stopY, maxT].some(isNaN)) return;

  const snapshots = simulatePearl(
    new Vec3(posX, posY, posZ),
    new Vec3(velX, velY, velZ),
    stopY,
    maxT,
  );

  // Stats
  const last   = snapshots[snapshots.length - 1];
  const maxY   = snapshots.reduce((m, s) => Math.max(m, s.pos.y), posY);
  const simStats = document.getElementById('sim-stats');
  simStats.innerHTML = `
    <div class="stat-box"><div class="stat-label">Ticks</div><div class="stat-value">${last.tick}</div></div>
    <div class="stat-box"><div class="stat-label">Peak Y</div><div class="stat-value">${maxY.toFixed(2)}</div></div>
    <div class="stat-box"><div class="stat-label">Final X,Z</div><div class="stat-value">${last.pos.x.toFixed(2)}, ${last.pos.z.toFixed(2)}</div></div>
  `;

  // Canvas
  drawTrajectory(snapshots, posY, stopY);

  // Table
  const tbody = document.getElementById('sim-tbody');
  tbody.innerHTML = '';
  // Show every tick if short, else sample
  const step = snapshots.length > 200 ? Math.ceil(snapshots.length / 200) : 1;
  for (let i = 0; i < snapshots.length; i += step) {
    const s = snapshots[i];
    const hd = Math.sqrt((s.pos.x - posX)**2 + (s.pos.z - posZ)**2);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.tick}</td>
      <td>${s.pos.x.toFixed(4)}</td>
      <td>${s.pos.y.toFixed(4)}</td>
      <td>${s.pos.z.toFixed(4)}</td>
      <td>${s.motion.x.toFixed(6)}</td>
      <td>${s.motion.y.toFixed(6)}</td>
      <td>${s.motion.z.toFixed(6)}</td>
      <td>${hd.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  }

  document.getElementById('sim-empty').style.display = 'none';
  document.getElementById('sim-result-area').style.display = 'block';
  document.getElementById('sim-data-card').style.display = 'block';
});

function drawTrajectory(snapshots, startY, stopY) {
  const canvas = document.getElementById('sim-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!snapshots.length) return;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d0f1f');
  bg.addColorStop(1, '#0a0c18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(139,92,246,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * W/8, 0); ctx.lineTo(i * W/8, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * H/8); ctx.lineTo(W, i * H/8); ctx.stroke();
  }

  const maxTick = snapshots[snapshots.length - 1].tick;
  const minY = Math.min(startY, ...snapshots.map(s => s.pos.y));
  const maxY = Math.max(stopY, ...snapshots.map(s => s.pos.y)) + 5;
  const startX = snapshots[0]?.pos.x ?? 0;
  const startZ = snapshots[0]?.pos.z ?? 0;
  const maxHD  = Math.max(1, ...snapshots.map(s => Math.sqrt((s.pos.x-startX)**2 + (s.pos.z-startZ)**2)));

  const pad = 36;
  const px = (tick) => pad + (tick / maxTick) * (W - 2*pad);
  const pyY = (y)  => H - pad - ((y - minY) / (maxY - minY)) * (H - 2*pad);
  const pyH = (hd) => H - pad - (hd / maxHD) * (H - 2*pad);

  // Stop height line
  ctx.strokeStyle = 'rgba(251,191,36,0.5)';
  ctx.setLineDash([6,4]);
  ctx.lineWidth = 1;
  const sy = pyY(stopY);
  ctx.beginPath(); ctx.moveTo(pad, sy); ctx.lineTo(W - pad, sy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(251,191,36,0.8)';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(`y=${stopY}`, W - pad - 40, sy - 4);

  // Y trajectory
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#7c3aed';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const x = px(s.tick), y = pyY(s.pos.y);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Horizontal distance trajectory
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#34d399';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const hd = Math.sqrt((s.pos.x - startX)**2 + (s.pos.z - startZ)**2);
    const x = px(s.tick), y = pyH(hd);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Axes labels
  ctx.fillStyle = 'rgba(148,163,184,0.7)';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Tick →', W - pad + 2, H - pad + 14);
  ctx.save();
  ctx.translate(14, H/2);
  ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center';
  ctx.fillText('Y / Horiz.Dist', 0, 0);
  ctx.restore();

  // Tick labels
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(148,163,184,0.5)';
  for (let i = 0; i <= 4; i++) {
    const tick = Math.round(i * maxTick / 4);
    ctx.fillText(tick, px(tick), H - pad + 14);
  }
}

// ═══════════════════════════════════════════════════════
//  UI  ——  Wool Encoding
// ═══════════════════════════════════════════════════════

document.getElementById('btn-encode').addEventListener('click', () => {
  const earlyTnt  = parseInt(document.getElementById('e-early').value, 10);
  const lateTnt   = parseInt(document.getElementById('e-late').value, 10);
  const upaccelTnt = parseInt(document.getElementById('e-upaccel').value, 10);
  const direction = parseInt(document.getElementById('e-direction').value, 10);
  const angle     = parseInt(document.getElementById('e-angle').value, 10);
  const longRange = document.getElementById('e-longrange').value === '1';

  if ([earlyTnt, lateTnt, upaccelTnt, direction, angle].some(isNaN)) return;

  const encoding = buildEncoding({ earlyTnt, lateTnt, upaccelTnt, direction, angle, longRange });

  const grid = document.getElementById('enc-grid');
  grid.innerHTML = '';

  for (const e of encoding) {
    const div = document.createElement('div');
    div.className = 'wool-block';
    div.innerHTML = `
      <div class="wool-swatch-big" style="background:${e.color}"></div>
      <div class="wool-info">
        <div class="wool-color-name">${e.name}</div>
        <div class="wool-count">${e.count}</div>
        <div class="wool-desc">${e.desc}</div>
      </div>
    `;
    grid.appendChild(div);
  }

  document.getElementById('enc-empty').style.display = 'none';
  document.getElementById('enc-output').style.display = 'block';
});
