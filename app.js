/**
 * 836 FTL v2 — Nether Pearl Calculator
 * Pure JavaScript physics engine. Faithfully reimplements Python/Rust versions.
 */

const F32 = Math.fround;

const PEARL_EYE_HEIGHT = 0.25 * F32(0.85);
const EXPLOSION_HEIGHT = F32(0.98) * F32(0.0625);
const BASKET_TNT_Y = 173.875 - F32(0.98) - 0.04;
const PEARL_Y = 173.875;
const UPACCEL_TNT_Y = BASKET_TNT_Y - EXPLOSION_HEIGHT;
const UPACCEL_TNT_LONGRANGE_Y = UPACCEL_TNT_Y - F32(0.98);
const PEARL_HORIZONTAL_OFFSET = 0.5;
const PEARL_DECAY = F32(0.99);
const PEARL_Y_MOTION = F32(-0.0784000015258789);

const NUM_OF_ANGLES = 4;
const MAX_UPACCEL_TNT = 40;
const MAX_BASKET_TNT_PER_SIDE = 3344;

class Vec3 {
  constructor(x, y, z) {
    this.x = +x; this.y = +y; this.z = +z;
  }
  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  multiply(n) { return new Vec3(this.x * n, this.y * n, this.z * n); }
  length() { return Math.sqrt(this.x**2 + this.y**2 + this.z**2); }
}

function calcTntVelocity(tntPos, eyePos, exposure, count) {
  const dx = eyePos.x - tntPos.x;
  const dy = eyePos.y - tntPos.y;
  const dz = eyePos.z - tntPos.z;

  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (dist >= 8.0 || dist === 0) return new Vec3(0,0,0);

  const push = (1.0 - dist / 8.0) * exposure / dist;
  return new Vec3(dx * push * count, dy * push * count, dz * push * count);
}

const DIR = { WNW: 0, ENE: 1, NNW: 2, NNE: 3, SSE: 4, SSW: 5, ESE: 6, WSW: 7 };
const DIR_NAMES = ['WNW','ENE','NNW','NNE','SSE','SSW','ESE','WSW'];

function calculateDirection(vec) {
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

  const cos45 = Math.cos(Math.PI / 4);
  const sin45 = Math.sin(Math.PI / 4);
  const rx = vec.x * cos45 - vec.z * sin45;
  const rz = vec.x * sin45 + vec.z * cos45;
  const scale = NUM_OF_ANGLES / Math.max(Math.abs(rx), Math.abs(rz));
  const angle = Math.floor(Math.min(Math.abs(rx * scale), Math.abs(rz * scale)));

  return { direction, angle };
}

function calculateTntVectors(distanceVec, dirResult) {
  const pearlX = 0.51, pearlZ = 0.51;
  const eyeY = PEARL_Y + PEARL_EYE_HEIGHT;
  const eyePos = new Vec3(pearlX, eyeY, pearlZ);

  // TNT offset relative to pearl:
  // Offset -0.5 pushes POSITIVE (+X / +Z)
  // Offset +0.5 pushes NEGATIVE (-X / -Z)
  const ARM_PAIRS = [
    [[+0.5, +0.5], [+0.5, -0.5]],  // 0 WNW (-X, -Z and -X, +Z)
    [[-0.5, +0.5], [-0.5, -0.5]],  // 1 ENE (+X, -Z and +X, +Z)
    [[+0.5, +0.5], [-0.5, +0.5]],  // 2 NNW (-Z, -X and -Z, +X)
    [[-0.5, +0.5], [+0.5, +0.5]],  // 3 NNE (-Z, +X and -Z, -X)
    [[-0.5, -0.5], [+0.5, -0.5]],  // 4 SSE (+Z, +X and +Z, -X)
    [[+0.5, -0.5], [-0.5, -0.5]],  // 5 SSW (+Z, -X and +Z, +X)
    [[-0.5, -0.5], [-0.5, +0.5]],  // 6 ESE (+X, +Z and +X, -Z)
    [[+0.5, -0.5], [+0.5, +0.5]],  // 7 WSW (-X, +Z and -X, -Z)
  ];

  const [ea, la] = ARM_PAIRS[dirResult.direction];
  const earlyTntPos = new Vec3(pearlX + ea[0], BASKET_TNT_Y, pearlZ + ea[1]);
  const lateTntPos  = new Vec3(pearlX + la[0], BASKET_TNT_Y, pearlZ + la[1]);

  const earlyVec = calcTntVelocity(earlyTntPos, eyePos, 1.0, 1);
  const lateVec  = calcTntVelocity(lateTntPos,  eyePos, 1.0, 1);

  return { earlyVec, lateVec };
}

function calculatePossibleTicks(stopHeight, maxTicks = 500) {
  const results = [];
  const goingUp = stopHeight > PEARL_Y;

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
        vy -= 0.03;
        vy  = F32(vy * F32(0.99));
        y  += vy;

        if (goingUp ? (y >= stopHeight) : (y <= stopHeight)) {
          results.push({ tick, upaccelTnt, longRange });
          break;
        }

        if (goingUp && vy < 0 && y < PEARL_Y - 5) break;
        if (!goingUp && y < stopHeight - 200) break;
      }
    }
  }

  return results;
}

function simulatePearl(pos, motion, stopHeight, maxTicks = 500) {
  const snapshots = [];
  let p = new Vec3(pos.x, pos.y, pos.z);
  let m = new Vec3(motion.x, motion.y, motion.z);
  const goingUp = stopHeight > pos.y;

  for (let tick = 1; tick <= maxTicks; tick++) {
    m = new Vec3(m.x, m.y - 0.03, m.z);
    m = new Vec3(
      F32(m.x * PEARL_DECAY),
      F32(m.y * PEARL_DECAY),
      F32(m.z * PEARL_DECAY),
    );
    p = p.add(m);

    snapshots.push({ tick, pos: new Vec3(p.x, p.y, p.z), motion: new Vec3(m.x, m.y, m.z) });

    if (goingUp  && p.y >= stopHeight) break;
    if (!goingUp && p.y <= stopHeight) break;
  }

  return snapshots;
}

function calculate({ originX, originZ, destX, destZ, stopHeight = 128, maxTnt = 6688, maxTicks = 500, maxDistance = 5.0, maxResults = 50 }) {
  const pearlX = Math.floor(originX) + 0.51;
  const pearlZ = Math.floor(originZ) + 0.51;

  const distVec = new Vec3(destX - pearlX, 0, destZ - pearlZ);
  const dirResult = calculateDirection(distVec);
  const { earlyVec, lateVec } = calculateTntVectors(distVec, dirResult);
  const possibleTicks = calculatePossibleTicks(stopHeight, maxTicks);

  if (possibleTicks.length === 0) {
    return { error: `No valid upaccel configs found for stop height y=${stopHeight}.` };
  }

  const results = [];
  let divider = 0;

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
      const det = earlyVec.x * lateVec.z - earlyVec.z * lateVec.x;
      if (Math.abs(det) < 1e-12) continue;

      const targetX = distVec.x / divider;
      const targetZ = distVec.z / divider;

      const earlyExact = (targetX * lateVec.z - targetZ * lateVec.x) / det;
      const lateExact  = (earlyVec.x * targetZ - earlyVec.z * targetX) / det;

      const earlyBase = Math.round(earlyExact);
      const lateBase  = Math.round(lateExact);

      for (let a = -20; a <= 20; a++) {
        for (let b = -20; b <= 20; b++) {
          const earlyTnt = earlyBase + a;
          const lateTnt  = lateBase  + b;

          if (earlyTnt < 0 || lateTnt < 0) continue;

          const totalTnt = earlyTnt + lateTnt + cfg.upaccelTnt;
          if (maxTnt > 0 && totalTnt > maxTnt) continue;
          if (earlyTnt > MAX_BASKET_TNT_PER_SIDE || lateTnt > MAX_BASKET_TNT_PER_SIDE) continue;

          const sim = buildSimulation({ pearlX, pearlZ, earlyTnt, lateTnt, earlyVec, lateVec, upaccelTnt: cfg.upaccelTnt, longRange: cfg.longRange, tick, stopHeight });
          const landing = sim.snapshots[sim.snapshots.length - 1];
          if (!landing) continue;

          const dx = landing.pos.x - destX;
          const dz = landing.pos.z - destZ;
          const error = Math.sqrt(dx*dx + dz*dz);

          if (error > maxDistance) continue;

          results.push({
            tick, earlyTnt, lateTnt, upaccelTnt: cfg.upaccelTnt, totalTnt, error,
            longRange: cfg.longRange, direction: dirResult.direction, angle: dirResult.angle,
            landing: landing.pos, sim,
          });

          if (results.length >= maxResults * 10) break;
        }
        if (results.length >= maxResults * 10) break;
      }
    }
  }

  results.sort((a, b) => a.totalTnt - b.totalTnt || a.error - b.error);

  // Filter out duplicates (same TNT counts & tick)
  const unique = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.earlyTnt}-${r.lateTnt}-${r.upaccelTnt}-${r.tick}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  return { results: unique.slice(0, maxResults), direction: dirResult };
}

function buildSimulation({ pearlX, pearlZ, earlyTnt, lateTnt, earlyVec, lateVec, upaccelTnt, longRange, tick, stopHeight }) {
  const tntY = longRange ? UPACCEL_TNT_LONGRANGE_Y : UPACCEL_TNT_Y;
  const pearlEyeY = PEARL_Y + PEARL_EYE_HEIGHT;

  const tntPos = new Vec3(pearlX - PEARL_HORIZONTAL_OFFSET, tntY, pearlZ - PEARL_HORIZONTAL_OFFSET);
  const eyePos = new Vec3(pearlX, pearlEyeY, pearlZ);
  const upaccelVel = calcTntVelocity(tntPos, eyePos, 1.0, upaccelTnt);

  const initMotion = new Vec3(
    earlyVec.x * earlyTnt + lateVec.x * lateTnt,
    PEARL_Y_MOTION + upaccelVel.y,
    earlyVec.z * earlyTnt + lateVec.z * lateTnt,
  );

  const startPos = new Vec3(pearlX, PEARL_Y, pearlZ);
  const snapshots = simulatePearl(startPos, initMotion, stopHeight, tick + 50);

  return { snapshots, initMotion, startPos };
}

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
  const early   = calcBits(earlyTnt);
  const late    = calcBits(lateTnt);
  const upaccel = calcUpaccelBits(upaccelTnt);
  const yellow  = direction + (longRange ? 8 : 0);

  return [
    { color: '#3498db', name: 'Blue',       count: upaccel.high, desc: 'Upaccel / 8' },
    { color: '#9b59b6', name: 'Purple',     count: upaccel.low,  desc: 'Upaccel mod 8' },
    { color: '#1abc9c', name: 'Cyan',       count: late.small,   desc: 'Late mod 11' },
    { color: '#85c1e9', name: 'Light Blue', count: late.medium,  desc: 'Late /11 mod 38' },
    { color: '#2ecc71', name: 'Lime',       count: late.big,     desc: 'Late / 418' },
    { color: '#f1c40f', name: 'Yellow',     count: yellow,       desc: 'Direction' },
    { color: '#e67e22', name: 'Orange',     count: early.medium, desc: 'Early /11 mod 38' },
    { color: '#e74c3c', name: 'Red',        count: early.big,    desc: 'Early / 418' },
    { color: '#ff69b4', name: 'Pink',       count: early.small,  desc: 'Early mod 11' },
    { color: '#888888', name: 'Magenta',    count: 0,            desc: '(unused)' },
    { color: '#7d3c98', name: 'Purple2',    count: angle,        desc: 'Angle sub-index' },
  ];
}

let savedResults = [];
let selectedResult = null;

if (typeof document !== 'undefined') {
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const p = document.getElementById('tab-' + btn.dataset.tab);
      if (p) p.classList.add('active');
    });
  }

  const calcBtn = document.getElementById('btn-calculate');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
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
      const stopHeight = parseFloat(document.getElementById('c-stop-mode').value);

      if ([originX, originZ, destX, destZ, maxTnt, maxTicks, maxDist, stopHeight].some(isNaN)) {
        statusEl.textContent = 'Please fill in all fields with valid numbers.';
        statusEl.className = 'status-msg error';
        return;
      }

      if (destX === originX && destZ === originZ) {
        statusEl.textContent = 'Origin and destination are the same.';
        statusEl.className = 'status-msg error';
        return;
      }

      const horizDist = Math.sqrt((destX-originX)**2 + (destZ-originZ)**2);
      statusEl.textContent = 'Calculating...';
      statusEl.className = 'status-msg info';

      setTimeout(() => {
        try {
          const t0 = performance.now();
          const out = calculate({ originX, originZ, destX, destZ, stopHeight, maxTnt, maxTicks, maxDistance: maxDist, maxResults: maxRes });
          const elapsed = (performance.now() - t0).toFixed(0);

          if (out.error) {
            statusEl.textContent = out.error;
            statusEl.className = 'status-msg error';
            return;
          }

          savedResults = out.results;
          selectedResult = null;
          detailCard.style.display = 'none';

          if (out.results.length === 0) {
            statusEl.textContent = 'No results found within Max Error. Try increasing Max Error (e.g. 5.0) or Max TNT.';
            statusEl.className = 'status-msg error';
            phEl.style.display = 'block';
            wrapEl.style.display = 'none';
            return;
          }

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
              <td>${r.longRange ? 'LR' : '-'}</td>
              <td><button class="select-btn" data-idx="${i}">Select</button></td>
            `;
            tbodyEl.appendChild(tr);
          }

          tbodyEl.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', () => selectResult(parseInt(btn.dataset.idx, 10)));
          });

          const d = DIR_NAMES[out.direction?.direction ?? 0];
          metaEl.textContent = `Found ${out.results.length} results in ${elapsed}ms | Dist: ${horizDist.toFixed(1)} blks | Direction: ${d}`;

          phEl.style.display = 'none';
          wrapEl.style.display = 'block';

          statusEl.textContent = `${out.results.length} results found.`;
          statusEl.className = 'status-msg ok';

          // Automatically select first result!
          selectResult(0);
        } catch (err) {
          statusEl.textContent = 'Error: ' + err.message;
          statusEl.className = 'status-msg error';
          console.error(err);
        }
      }, 10);
    });
  }
}

function selectResult(idx) {
  selectedResult = savedResults[idx];
  const r = selectedResult;
  if (!r) return;

  document.querySelectorAll('#results-tbody tr').forEach((tr, i) => {
    tr.classList.toggle('selected-row', i === idx);
  });

  const detailGrid = document.getElementById('detail-grid');
  const landing = r.landing;
  detailGrid.innerHTML = '';

  const items = [
    { label: 'Total TNT',     value: r.totalTnt,                     cls: 'big' },
    { label: 'Early TNT',     value: r.earlyTnt,                     cls: '' },
    { label: 'Late TNT',      value: r.lateTnt,                      cls: '' },
    { label: 'Upaccel TNT',   value: r.upaccelTnt,                   cls: '' },
    { label: 'Ticks in Air',  value: r.tick,                         cls: '' },
    { label: 'Landing Error', value: r.error.toFixed(5) + ' blks',   cls: r.error > 1.0 ? 'warn' : '' },
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
    div.innerHTML = `<div class="detail-label">${item.label}</div><div class="detail-value ${item.cls}">${item.value}</div>`;
    detailGrid.appendChild(div);
  }

  // Also auto-render Wool Encoding right inside selected result and update Encoding Tab!
  const encoding = buildEncoding({
    earlyTnt: r.earlyTnt,
    lateTnt: r.lateTnt,
    upaccelTnt: r.upaccelTnt,
    direction: r.direction,
    angle: r.angle,
    longRange: r.longRange
  });

  renderWoolEncoding(encoding);
  document.getElementById('detail-card').style.display = 'block';
}

function renderWoolEncoding(encoding) {
  // Render in Encoding tab
  const grid = document.getElementById('enc-grid');
  if (grid) {
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
  }

  const encEmpty = document.getElementById('enc-empty');
  const encOutput = document.getElementById('enc-output');
  if (encEmpty) encEmpty.style.display = 'none';
  if (encOutput) encOutput.style.display = 'block';
}

if (typeof document !== 'undefined') {
  document.getElementById('btn-send-to-encode')?.addEventListener('click', () => {
    if (!selectedResult) return;
    document.querySelector('[data-tab="enc"]').click();
  });

  document.getElementById('btn-send-to-sim')?.addEventListener('click', () => {
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
    document.getElementById('s-stop-y').value = parseFloat(document.getElementById('c-stop-mode').value);

    document.querySelector('[data-tab="sim"]').click();
    document.getElementById('btn-simulate').click();
  });

  document.getElementById('btn-simulate')?.addEventListener('click', () => {
    const posX   = parseFloat(document.getElementById('s-pos-x').value);
    const posY   = parseFloat(document.getElementById('s-pos-y').value);
    const posZ   = parseFloat(document.getElementById('s-pos-z').value);
    const velX   = parseFloat(document.getElementById('s-vel-x').value);
    const velY   = parseFloat(document.getElementById('s-vel-y').value);
    const velZ   = parseFloat(document.getElementById('s-vel-z').value);
    const stopY  = parseFloat(document.getElementById('s-stop-y').value);
    const maxT   = parseInt(document.getElementById('s-max-ticks').value, 10);

    if ([posX, posY, posZ, velX, velY, velZ, stopY, maxT].some(isNaN)) return;

    const snapshots = simulatePearl(new Vec3(posX, posY, posZ), new Vec3(velX, velY, velZ), stopY, maxT);
    const last   = snapshots[snapshots.length - 1];
    const maxY   = snapshots.reduce((m, s) => Math.max(m, s.pos.y), posY);
    const simStats = document.getElementById('sim-stats');
    simStats.innerHTML = `
      <div class="stat-box"><div class="stat-label">Ticks</div><div class="stat-value">${last.tick}</div></div>
      <div class="stat-box"><div class="stat-label">Peak Y</div><div class="stat-value">${maxY.toFixed(2)}</div></div>
      <div class="stat-box"><div class="stat-label">Final X,Z</div><div class="stat-value">${last.pos.x.toFixed(2)}, ${last.pos.z.toFixed(2)}</div></div>
    `;

    drawTrajectory(snapshots, posY, stopY);

    const tbody = document.getElementById('sim-tbody');
    tbody.innerHTML = '';
    const step = snapshots.length > 200 ? Math.ceil(snapshots.length / 200) : 1;
    for (let i = 0; i < snapshots.length; i += step) {
      const s = snapshots[i];
      const hd = Math.sqrt((s.pos.x - posX)**2 + (s.pos.z - posZ)**2);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.tick}</td><td>${s.pos.x.toFixed(4)}</td><td>${s.pos.y.toFixed(4)}</td><td>${s.pos.z.toFixed(4)}</td><td>${s.motion.x.toFixed(6)}</td><td>${s.motion.y.toFixed(6)}</td><td>${s.motion.z.toFixed(6)}</td><td>${hd.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    }

    document.getElementById('sim-empty').style.display = 'none';
    document.getElementById('sim-result-area').style.display = 'block';
    document.getElementById('sim-data-card').style.display = 'block';
  });

  document.getElementById('btn-encode')?.addEventListener('click', () => {
    const earlyTnt   = parseInt(document.getElementById('e-early').value, 10);
    const lateTnt    = parseInt(document.getElementById('e-late').value, 10);
    const upaccelTnt = parseInt(document.getElementById('e-upaccel').value, 10);
    const direction  = parseInt(document.getElementById('e-direction').value, 10);
    const angle      = parseInt(document.getElementById('e-angle').value, 10);
    const longRange  = document.getElementById('e-longrange').value === '1';

    if ([earlyTnt, lateTnt, upaccelTnt, direction, angle].some(isNaN)) return;

    const encoding = buildEncoding({ earlyTnt, lateTnt, upaccelTnt, direction, angle, longRange });
    renderWoolEncoding(encoding);
  });
}

function drawTrajectory(snapshots, startY, stopY) {
  const canvas = document.getElementById('sim-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!snapshots.length) return;

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
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
  const px  = (tick) => pad + (tick / maxTick) * (W - 2*pad);
  const pyY = (y)    => H - pad - ((y - minY) / (maxY - minY)) * (H - 2*pad);
  const pyH = (hd)   => H - pad - (hd / maxHD) * (H - 2*pad);

  ctx.strokeStyle = 'rgba(200,168,75,0.4)';
  ctx.setLineDash([5,4]);
  ctx.lineWidth = 1;
  const sy = pyY(stopY);
  ctx.beginPath(); ctx.moveTo(pad, sy); ctx.lineTo(W - pad, sy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(200,168,75,0.7)';
  ctx.font = '10px sans-serif';
  ctx.fillText(`y=${stopY}`, W - pad - 38, sy - 4);

  ctx.strokeStyle = '#c8a84b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const x = px(s.tick), y = pyY(s.pos.y);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#5a9a8a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  snapshots.forEach((s, i) => {
    const hd = Math.sqrt((s.pos.x - startX)**2 + (s.pos.z - startZ)**2);
    const x = px(s.tick), y = pyH(hd);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}
