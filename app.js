/**
 * 836 FTL v2 — Nether Pearl Calculator
 * Pure JavaScript physics engine matching original Python/Rust versions.
 */

const F32 = Math.fround;

const PEARL_EYE_HEIGHT = 0.25 * F32(0.85);
const EXPLOSION_HEIGHT = F32(0.98) * F32(0.0625);
const BASKET_TNT_Y = 173.875 - F32(0.98) - 0.04;
const PEARL_Y = 173.875;
const PEARL_HORIZONTAL_OFFSET = 0.51;
const PEARL_DECAY = F32(0.99);
const PEARL_Y_MOTION = F32(-0.0784000015258789);

const ALIGNMENT_TNT_Y = 172.79375;
const ALIGNMENT_TNT_OFFSET = 1.8125;
const BASKET_UPACCEL_TNT = 0;
const BASKET_UPACCEL_TNT_Y = 169.0;
const BASKET_TNT_Y_MOTION = -0.04 * 0.98;

const UPACCEL_TNT_Y = 248.53626183321285;
const UPACCEL_TNT_LONGRANGE_Y = 250.89563683321285;
const MAX_UPACCEL_TNT = 31;
const PEARL_STOP_HEIGHT = 128.0;

const NUM_OF_ANGLES = 4;

const SIZE_CAPS = {
  full: { maxTnt: 6688, maxPerSide: 3344 },
  half: { maxTnt: 3344, maxPerSide: 1672 },
  quarter: { maxTnt: 1672, maxPerSide: 836 },
};

class Vec3 {
  constructor(x, y, z) {
    this.x = +x; this.y = +y; this.z = +z;
  }
  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  multiply(n) { return new Vec3(this.x * n, this.y * n, this.z * n); }
  lengthHorizontal() { return Math.sqrt(this.x**2 + this.z**2); }
  length() { return Math.sqrt(this.x**2 + this.y**2 + this.z**2); }
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

const DIR_NAMES = ['WNW','ENE','NNW','NNE','SSE','SSW','ESE','WSW'];

function calculateDirection(vec) {
  const cos45 = Math.cos(Math.PI / 4);
  const sin45 = Math.sin(Math.PI / 4);
  const rx = vec.x * cos45 - vec.z * sin45;
  const rz = vec.x * sin45 + vec.z * cos45;
  const scale = NUM_OF_ANGLES / Math.max(Math.abs(rx), Math.abs(rz));
  const angle = Math.floor(Math.min(Math.abs(rx * scale), Math.abs(rz * scale)));

  let vecAngle = Math.atan2(vec.z, vec.x) * (180 / Math.PI);
  if (vecAngle < 0) vecAngle += 360;

  let direction;
  if      (vecAngle <  45) direction = 6;
  else if (vecAngle <  90) direction = 4;
  else if (vecAngle < 135) direction = 5;
  else if (vecAngle < 180) direction = 7;
  else if (vecAngle < 225) direction = 0;
  else if (vecAngle < 270) direction = 2;
  else if (vecAngle < 315) direction = 3;
  else                      direction = 1;

  return { direction, angle };
}

function calculateTntVectors(vec, dirResult) {
  const direction = dirResult.direction;
  const angle = dirResult.angle;

  const firstAlignmentTntPos = new Vec3(1, 0, 1);
  if (vec.x < 0) firstAlignmentTntPos.x = -1;
  if (vec.z < 0) firstAlignmentTntPos.z = -1;

  const secondAlignmentTntPos = firstAlignmentTntPos.copy();
  if (Math.abs(vec.x) > Math.abs(vec.z)) secondAlignmentTntPos.z *= -1;
  else secondAlignmentTntPos.x *= -1;

  const firstPos  = firstAlignmentTntPos.multiply(ALIGNMENT_TNT_OFFSET).add(new Vec3(0, ALIGNMENT_TNT_Y, 0));
  const secondPos = secondAlignmentTntPos.multiply(ALIGNMENT_TNT_OFFSET).add(new Vec3(0, ALIGNMENT_TNT_Y, 0));

  const earlyTnt = { pos: new Vec3(0, BASKET_TNT_Y, 0), motion: new Vec3(0, BASKET_TNT_Y_MOTION, 0) };
  const lateTnt  = { pos: new Vec3(0, BASKET_TNT_Y, 0), motion: new Vec3(0, BASKET_TNT_Y_MOTION, 0) };

  const ev1 = calcExplosionVelocity(firstPos, earlyTnt.pos, 0, F32(1.0 / 27.0)).multiply(NUM_OF_ANGLES);
  const ev2 = calcExplosionVelocity(secondPos, earlyTnt.pos, 0, F32(1.0 / 27.0)).multiply(angle);
  earlyTnt.motion = earlyTnt.motion.add(ev1).add(ev2);

  const lv1 = calcExplosionVelocity(firstPos, lateTnt.pos, 0, F32(1.0 / 27.0)).multiply(NUM_OF_ANGLES);
  const lv2 = calcExplosionVelocity(secondPos, lateTnt.pos, 0, F32(1.0 / 27.0)).multiply(angle + 1);
  lateTnt.motion = lateTnt.motion.add(lv1).add(lv2);

  earlyTnt.motion = new Vec3(earlyTnt.motion.x, earlyTnt.motion.y - 0.04, earlyTnt.motion.z).multiply(F32(0.98));
  lateTnt.motion  = new Vec3(lateTnt.motion.x,  lateTnt.motion.y - 0.04,  lateTnt.motion.z).multiply(F32(0.98));

  earlyTnt.pos = earlyTnt.pos.add(earlyTnt.motion);
  lateTnt.pos  = lateTnt.pos.add(lateTnt.motion);

  const pearlPos = new Vec3(PEARL_HORIZONTAL_OFFSET, PEARL_Y, PEARL_HORIZONTAL_OFFSET);

  const earlyVec = calcExplosionVelocity(earlyTnt.pos, pearlPos, PEARL_EYE_HEIGHT, F32(1.0));
  const lateVec  = calcExplosionVelocity(lateTnt.pos,  pearlPos, PEARL_EYE_HEIGHT, F32(1.0));

  return { earlyVec, lateVec };
}

function calculatePossibleTicksList(upaccelTntY) {
  const possibleTicks = [];
  const pearlPos = new Vec3(PEARL_HORIZONTAL_OFFSET, PEARL_Y, PEARL_HORIZONTAL_OFFSET);
  const motionPerTnt = calcExplosionVelocity(new Vec3(0, upaccelTntY, 0), pearlPos, PEARL_EYE_HEIGHT, F32(1.0));

  for (let n = 0; n <= MAX_UPACCEL_TNT; n++) {
    let ticks = 0;
    let pPos = new Vec3(pearlPos.x, pearlPos.y, pearlPos.z);
    let pMotion = new Vec3(0, PEARL_Y_MOTION, 0).add(motionPerTnt.multiply(n));

    while (pPos.y > PEARL_STOP_HEIGHT) {
      pMotion = new Vec3(pMotion.x, pMotion.y - 0.03, pMotion.z);
      pMotion = new Vec3(F32(pMotion.x * F32(0.99)), F32(pMotion.y * F32(0.99)), F32(pMotion.z * F32(0.99)));
      pPos = pPos.add(pMotion);
      ticks++;
    }
    possibleTicks.push(ticks - 1);
  }
  return possibleTicks;
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

  const possibleTicks = calculatePossibleTicksList(UPACCEL_TNT_LONGRANGE_Y)
    .concat(calculatePossibleTicksList(UPACCEL_TNT_Y));

  let det = earlyVec.z * lateVec.x - lateVec.z * earlyVec.x;
  if (Math.abs(det) < 1e-12) return { results: [], direction: dirResult };

  let earlyTntExact = (distVec.z * lateVec.x - distVec.x * lateVec.z) / det;
  let lateTntExact  = (distVec.x - earlyTntExact * earlyVec.x) / lateVec.x;

  earlyTntExact = Math.abs(earlyTntExact);
  lateTntExact  = Math.abs(lateTntExact);

  const results = [];
  let divider = 0;
  let tryAgain = false;

  const caps = SIZE_CAPS[cannonSize] || SIZE_CAPS.full;
  const maxPerSideCap = maxTnt > 0 ? caps.maxPerSide : 999999;
  const effectiveMaxTnt = maxTnt > 0 ? Math.min(maxTnt, caps.maxTnt) : 999999;

  for (let tick = 1; tick <= maxTicks; tick++) {
    divider += Math.pow(F32(0.99), tick);

    let upaccelTnt = 0;
    let longRange = false;

    const idx = possibleTicks.indexOf(tick);
    if (idx !== -1) {
      upaccelTnt = idx % (MAX_UPACCEL_TNT + 1);
      longRange  = idx <= (MAX_UPACCEL_TNT + 1);
    } else {
      if (!tryAgain) continue;
    }
    tryAgain = false;

    const earlyBase = Math.round(earlyTntExact / divider);
    const lateBase  = Math.round(lateTntExact / divider);

    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const earlyTnt = earlyBase + a;
        const lateTnt  = lateBase  + b;

        if (earlyTnt < 0 || lateTnt < 0) continue;
        if (earlyTnt > maxPerSideCap || lateTnt > maxPerSideCap) continue;

        const totalTnt = earlyTnt + lateTnt + upaccelTnt;
        if (effectiveMaxTnt > 0 && totalTnt > effectiveMaxTnt) continue;

        const tntY = longRange ? UPACCEL_TNT_LONGRANGE_Y : UPACCEL_TNT_Y;
        const upaccelVel = calcExplosionVelocity(new Vec3(pearlX - PEARL_HORIZONTAL_OFFSET, tntY, pearlZ - PEARL_HORIZONTAL_OFFSET), pearlPos, PEARL_EYE_HEIGHT, F32(1.0)).multiply(upaccelTnt);

        const initMotion = new Vec3(
          earlyVec.x * earlyTnt + lateVec.x * lateTnt,
          PEARL_Y_MOTION + upaccelVel.y,
          earlyVec.z * earlyTnt + lateVec.z * lateTnt,
        );

        const pearl = new Pearl(new Vec3(pearlPos.x, pearlPos.y, pearlPos.z), initMotion);
        for (let t = 0; t < tick; t++) pearl.tick();

        const distance = pearl.pos.sub(destPos).lengthHorizontal();
        if (maxDistance > 0 && distance > maxDistance) continue;

        if (pearl.pos.y < PEARL_STOP_HEIGHT) {
          tryAgain = true;
          continue;
        }

        pearl.tick();
        if (pearl.pos.y >= PEARL_STOP_HEIGHT) {
          tryAgain = true;
          continue;
        }

        const landingPos = pearl.pos;
        const distanceVal = Math.sqrt((destX - originX)**2 + (destZ - originZ)**2);

        results.push({
          tick, earlyTnt, lateTnt, upaccelTnt, totalTnt, error: distance,
          distance: distanceVal,
          longRange, direction: dirResult.direction, angle: dirResult.angle,
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


