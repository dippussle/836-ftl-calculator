// 836 FTL v2 Nether Ender Pearl Cannon Calculator
// Based on exact garlic-bred 836 FTL v2 physical trajectory math

const PEARL_HORIZONTAL_OFFSET = 0.51;
const PEARL_Y = 173.875;
const PEARL_EYE_HEIGHT = 0.25 * Math.fround(0.85);
const PEARL_Y_MOTION = -0.0784;

const EXPLOSION_HEIGHT = Math.fround(0.98) * Math.fround(0.0625);
const ALIGNMENT_TNT_Y = 172.79375;
const ALIGNMENT_TNT_OFFSET = 1.8125;
const BASKET_TNT_Y = 173.875 - Math.fround(0.98) - 0.04;

const UPACCEL_TNT_Y = 248.53626183321285;
const UPACCEL_TNT_LONGRANGE_Y = 250.89563683321285;
const MAX_UPACCEL_TNT = 31;
const NUM_OF_ANGLES = 4;

const F32 = Math.fround;

const SIZE_CAPS = {
  full: { maxTnt: 6688, maxPerSide: 3344 },
  half: { maxTnt: 3344, maxPerSide: 1672 },
  quarter: { maxTnt: 1672, maxPerSide: 836 },
};

const DIR_NAMES = [
  'WNW (0)', 'ENE (1)', 'NNW (2)', 'NNE (3)',
  'SSE (4)', 'SSW (5)', 'ESE (6)', 'WSW (7)'
];

class Vec3 {
  constructor(x, y, z) {
    this.x = Number(x);
    this.y = Number(y);
    this.z = Number(z);
  }
  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  multiply(n) { return new Vec3(this.x * n, this.y * n, this.z * n); }
  length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
  lengthHorizontal() { return Math.sqrt(this.x*this.x + this.z*this.z); }
  copy() { return new Vec3(this.x, this.y, this.z); }
}

function calcExplosionVelocity(tntPos, targetPos, eyeHeight, exposure) {
  const explosionPos = tntPos.add(new Vec3(0, EXPLOSION_HEIGHT, 0));
  const tPos = targetPos.add(new Vec3(0, eyeHeight, 0));
  const direction = tPos.sub(explosionPos);
  const dist = direction.length();
  if (dist >= 8.0 || dist === 0) return new Vec3(0,0,0);
  const push = (1.0 - dist / 8.0) * exposure / dist;
  return direction.multiply(push);
}

function calculateDirection(vec) {
  const cos45 = Math.cos(Math.PI / 4);
  const sin45 = Math.sin(Math.PI / 4);
  const rx = vec.x * cos45 - vec.z * sin45;
  const rz = vec.x * sin45 + vec.z * cos45;
  const scale = NUM_OF_ANGLES / Math.max(Math.abs(rx), Math.abs(rz));
  const angle = Math.floor(Math.min(Math.abs(rx * scale), Math.abs(rz * scale)));

  let vecAngle = Math.atan2(vec.z, vec.x) * (180 / Math.PI);
  if (vecAngle < 0) vecAngle += 360;

  let direction = 0;
  if (vecAngle < 45) direction = 6;
  else if (vecAngle < 90) direction = 4;
  else if (vecAngle < 135) direction = 5;
  else if (vecAngle < 180) direction = 7;
  else if (vecAngle < 225) direction = 0;
  else if (vecAngle < 270) direction = 2;
  else if (vecAngle < 315) direction = 3;
  else direction = 1;

  return { direction, angle };
}

function calculateTntVectors(vec, direction) {
  const pearlX = 0.51;
  const pearlZ = 0.51;
  const pearlPos = new Vec3(pearlX, PEARL_Y, pearlZ);

  const firstAlignmentTntPos = new Vec3(1, 0, 1);
  if (vec.x < 0) firstAlignmentTntPos.x = -1;
  if (vec.z < 0) firstAlignmentTntPos.z = -1;

  const secondAlignmentTntPos = firstAlignmentTntPos.copy();
  if (Math.abs(vec.x) > Math.abs(vec.z)) {
    secondAlignmentTntPos.z *= -1;
  } else {
    secondAlignmentTntPos.x *= -1;
  }

  const firstPos  = firstAlignmentTntPos.multiply(ALIGNMENT_TNT_OFFSET).add(new Vec3(pearlX, ALIGNMENT_TNT_Y, pearlZ));
  const secondPos = secondAlignmentTntPos.multiply(ALIGNMENT_TNT_OFFSET).add(new Vec3(pearlX, ALIGNMENT_TNT_Y, pearlZ));

  const earlyPos = new Vec3(pearlX, BASKET_TNT_Y, pearlZ);
  const latePos  = new Vec3(pearlX, BASKET_TNT_Y, pearlZ);

  const angle = direction ? direction.angle : 0;

  const ev1 = calcExplosionVelocity(firstPos, earlyPos, 0, F32(1.0 / 27.0)).multiply(NUM_OF_ANGLES);
  const ev2 = calcExplosionVelocity(secondPos, earlyPos, 0, F32(1.0 / 27.0)).multiply(angle);

  let earlyMotion = new Vec3(0, -0.04 * 0.98, 0).add(ev1).add(ev2);
  earlyMotion = new Vec3(earlyMotion.x, earlyMotion.y - 0.04, earlyMotion.z).multiply(F32(0.98));
  const shiftedEarlyPos = earlyPos.add(earlyMotion);

  const lv1 = calcExplosionVelocity(firstPos, latePos, 0, F32(1.0 / 27.0)).multiply(NUM_OF_ANGLES);
  const lv2 = calcExplosionVelocity(secondPos, latePos, 0, F32(1.0 / 27.0)).multiply(angle + 1);

  let lateMotion = new Vec3(0, -0.04 * 0.98, 0).add(lv1).add(lv2);
  lateMotion = new Vec3(lateMotion.x, lateMotion.y - 0.04, lateMotion.z).multiply(F32(0.98));
  const shiftedLatePos = latePos.add(lateMotion);

  const earlyVec = calcExplosionVelocity(shiftedEarlyPos, pearlPos, PEARL_EYE_HEIGHT, F32(1.0));
  const lateVec  = calcExplosionVelocity(shiftedLatePos,  pearlPos, PEARL_EYE_HEIGHT, F32(1.0));

  return { earlyVec, lateVec };
}

class Pearl {
  constructor(pos, motion) {
    this.pos = pos;
    this.motion = motion;
  }
  tick() {
    this.motion = this.motion.add(new Vec3(0, -0.03, 0));
    this.motion = new Vec3(
      F32(this.motion.x * F32(0.99)),
      F32(this.motion.y * F32(0.99)),
      F32(this.motion.z * F32(0.99))
    );
    this.pos = this.pos.add(this.motion);
  }
}

function calculate({ originX, originZ, destX, destZ, cannonSize = 'full', stopHeight = 128, maxTnt = 6688, maxTicks = 500, maxDistance = 50, maxResults = 50 }) {
  const pearlX = Math.floor(originX) + PEARL_HORIZONTAL_OFFSET;
  const pearlZ = Math.floor(originZ) + PEARL_HORIZONTAL_OFFSET;

  const pearlPos = new Vec3(pearlX, PEARL_Y, pearlZ);
  const destPos  = new Vec3(destX, 0, destZ);

  const distVec = destPos.sub(pearlPos);
  const dirResult = calculateDirection(distVec);
  let { earlyVec, lateVec } = calculateTntVectors(distVec, dirResult);

  let det = earlyVec.z * lateVec.x - lateVec.z * earlyVec.x;
  if (Math.abs(det) < 1e-12) return { results: [], direction: dirResult };

  let earlyTntExact = Math.abs((distVec.z * lateVec.x - distVec.x * lateVec.z) / det);
  let lateTntExact  = Math.abs((distVec.x - earlyTntExact * earlyVec.x) / lateVec.x);

  const results = [];
  let divider = 0;

  const caps = SIZE_CAPS[cannonSize] || SIZE_CAPS.full;
  const effectiveMaxTnt = maxTnt > 0 ? Math.min(maxTnt, caps.maxTnt) : 999999;

  for (let tick = 1; tick <= maxTicks; tick++) {
    divider += Math.pow(F32(0.99), tick);

    const earlyBase = Math.round(earlyTntExact / divider);
    const lateBase  = Math.round(lateTntExact / divider);

    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const earlyTnt = earlyBase + a;
        const lateTnt  = lateBase  + b;

        if (earlyTnt < 0 || lateTnt < 0) continue;

        const totalTnt = earlyTnt + lateTnt;
        if (effectiveMaxTnt > 0 && totalTnt > effectiveMaxTnt) continue;

        const initMotion = new Vec3(
          earlyVec.x * earlyTnt + lateVec.x * lateTnt,
          PEARL_Y_MOTION,
          earlyVec.z * earlyTnt + lateVec.z * lateTnt,
        );

        const pearl = new Pearl(new Vec3(pearlPos.x, pearlPos.y, pearlPos.z), initMotion);
        for (let t = 0; t < tick; t++) pearl.tick();

        const distance = pearl.pos.sub(destPos).lengthHorizontal();
        if (maxDistance > 0 && distance > maxDistance) continue;

        const landingPos = pearl.pos;
        const distanceVal = Math.sqrt((destX - originX)**2 + (destZ - originZ)**2);

        results.push({
          tick, earlyTnt, lateTnt, upaccelTnt: 0, totalTnt, error: distance,
          distance: distanceVal,
          longRange: false, direction: dirResult.direction, angle: dirResult.angle,
          landing: landingPos,
          sim: { initMotion, snapshots: [{ tick, pos: landingPos, motion: pearl.motion }] }
        });
      }
    }
  }

  results.sort((a, b) => a.error - b.error || a.totalTnt - b.totalTnt);

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
  document.addEventListener('DOMContentLoaded', () => {
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

    const sizeSelect = document.getElementById('c-cannon-size');
    const maxTntInput = document.getElementById('c-max-tnt');
    if (sizeSelect && maxTntInput) {
      sizeSelect.addEventListener('change', () => {
        const caps = SIZE_CAPS[sizeSelect.value] || SIZE_CAPS.full;
        maxTntInput.value = caps.maxTnt;
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

        if (statusEl) {
          statusEl.textContent = '';
          statusEl.className = 'status-msg';
        }

        const originX    = parseFloat(document.getElementById('c-origin-x').value) || 0;
        const originZ    = parseFloat(document.getElementById('c-origin-z').value) || 0;
        let destX        = parseFloat(document.getElementById('c-dest-x').value);
        let destZ        = parseFloat(document.getElementById('c-dest-z').value);
        const cannonSize = document.getElementById('c-cannon-size').value;
        const maxTnt     = parseInt(document.getElementById('c-max-tnt').value, 10);
        const maxTicks   = parseInt(document.getElementById('c-max-ticks').value, 10) || 500;
        const maxDist    = parseFloat(document.getElementById('c-max-dist').value);
        const maxRes     = document.getElementById('c-max-results') ? parseInt(document.getElementById('c-max-results').value, 10) : 50;
        const stopHeight = document.getElementById('c-stop-mode') ? parseFloat(document.getElementById('c-stop-mode').value) : 128;
        const targetDim  = document.getElementById('c-dest-dim') ? document.getElementById('c-dest-dim').value : 'overworld';

        if (isNaN(destX) || isNaN(destZ)) {
          if (statusEl) {
            statusEl.textContent = 'Please fill in required destination X and Z coordinates.';
            statusEl.className = 'status-msg error';
          }
          return;
        }

        if (targetDim === 'overworld') {
          destX /= 8.0;
          destZ /= 8.0;
        }

        if (statusEl) {
          statusEl.textContent = 'Calculating...';
          statusEl.className = 'status-msg info';
        }

        setTimeout(() => {
          try {
            const out = calculate({ originX, originZ, destX, destZ, cannonSize, stopHeight, maxTnt, maxTicks, maxDistance: maxDist, maxResults: maxRes });

            if (out.error) {
              if (statusEl) {
                statusEl.textContent = out.error;
                statusEl.className = 'status-msg error';
              }
              return;
            }

            savedResults = out.results;
            selectedResult = null;
            if (detailCard) detailCard.style.display = 'none';

            if (!out.results || out.results.length === 0) {
              if (statusEl) {
                statusEl.textContent = 'No results found within Max Distance. Try increasing Max Distance or Max TNT.';
                statusEl.className = 'status-msg error';
              }
              if (phEl) phEl.style.display = 'block';
              if (wrapEl) wrapEl.style.display = 'none';
              return;
            }

            if (tbodyEl) {
              tbodyEl.innerHTML = '';
              for (let i = 0; i < out.results.length; i++) {
                const r = out.results[i];
                const tr = document.createElement('tr');
                tr.dataset.idx = i;
                const posStr = `(${r.landing.x.toFixed(3)}, ${r.landing.y.toFixed(3)}, ${r.landing.z.toFixed(3)})`;
                tr.innerHTML = `
                  <td>${r.error.toFixed(3)}</td>
                  <td>${posStr}</td>
                  <td>${r.tick}</td>
                  <td>${r.earlyTnt}</td>
                  <td>${r.lateTnt}</td>
                  <td><strong>${r.totalTnt}</strong></td>
                  <td><button class="select-btn" data-idx="${i}">Select</button></td>
                `;
                tbodyEl.appendChild(tr);
              }

              tbodyEl.querySelectorAll('.select-btn').forEach(btn => {
                btn.addEventListener('click', () => selectResult(parseInt(btn.dataset.idx, 10)));
              });
            }

            if (metaEl) metaEl.textContent = `${out.results.length} results found.`;
            if (phEl) phEl.style.display = 'none';
            if (wrapEl) wrapEl.style.display = 'block';

            if (statusEl) {
              statusEl.textContent = `${out.results.length} results found.`;
              statusEl.className = 'status-msg ok';
            }

            selectResult(0);
          } catch (err) {
            if (statusEl) {
              statusEl.textContent = 'Error: ' + err.message;
              statusEl.className = 'status-msg error';
            }
            console.error(err);
          }
        }, 10);
      });
    }
  });
}

function selectResult(idx) {
  selectedResult = savedResults[idx];
  const r = selectedResult;
  if (!r) return;

  document.querySelectorAll('#results-tbody tr').forEach((tr, i) => {
    tr.classList.toggle('selected-row', i === idx);
  });

  const detailGrid = document.getElementById('detail-grid');
  if (!detailGrid) return;
  const landing = r.landing;
  detailGrid.innerHTML = '';

  const items = [
    { label: 'Total TNT',     value: r.totalTnt,                     cls: 'big' },
    { label: 'Early TNT',     value: r.earlyTnt,                     cls: '' },
    { label: 'Late TNT',      value: r.lateTnt,                      cls: '' },
    { label: 'Upaccel TNT',   value: r.upaccelTnt,                   cls: '' },
    { label: 'Ticks in Air',  value: r.tick,                         cls: '' },
    { label: 'Landing Error', value: r.error.toFixed(4) + ' blocks', cls: r.error > 10.0 ? 'warn' : '' },
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

  const encoding = buildEncoding({
    earlyTnt: r.earlyTnt,
    lateTnt: r.lateTnt,
    upaccelTnt: r.upaccelTnt,
    direction: r.direction,
    angle: r.angle,
    longRange: r.longRange
  });

  renderWoolEncoding(encoding);
  const detailCard = document.getElementById('detail-card');
  if (detailCard) detailCard.style.display = 'block';
}

function renderWoolEncoding(encoding) {
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
