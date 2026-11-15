// Pure ball-flight maths for PickleKick. No Three.js and no DOM in here, so the
// same code drives the real shot, the dotted preview line, and the unit tests.
//
// World: the goal line is z = 0 and the goal is centred on x = 0. The kicker
// stands at +z and shoots toward -z. +x is the kicker's right, +y is up. Metres.

export const GOAL = { halfW: 3.66, height: 2.44, postR: 0.07, depth: 2.0 };
export const BALL_R = 0.15; // a bit bigger than a real ball so kids can see it
export const GRAVITY = 9.81;
export const DRAG = 0.01;
export const MAGNUS = 1.0; // how hard spin bends the flight (cartoon-strong on purpose)
const LIFT_SPIN = 0.35; // top/back spin is gentler than side spin so shots stay controllable
export const FIXED_DT = 1 / 240;

export const MIN_SPEED = 15;
export const MAX_SPEED = 32;
export const SWEET = { lo: 0.6, hi: 0.85 }; // the green "perfect" part of the power meter

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function powerToSpeed(power) {
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * clamp(power, 0, 1);
}

export function makeBall(p, v = { x: 0, y: 0, z: 0 }, spin = { x: 0, y: 0, z: 0 }) {
  return { p: { ...p }, v: { ...v }, spin: { ...spin }, inNet: false, bounces: 0 };
}

export function cloneBall(b) {
  return { p: { ...b.p }, v: { ...b.v }, spin: { ...b.spin }, inNet: b.inNet, bounces: b.bounces };
}

/** Advance the ball by dt seconds: gravity, air drag, spin (Magnus) and ground bounce. */
export function stepBall(b, dt) {
  const { p, v, spin: s } = b;
  const k = DRAG * Math.hypot(v.x, v.y, v.z);
  // Magnus acceleration is spin x velocity.
  const ax = -k * v.x + MAGNUS * (s.y * v.z - s.z * v.y);
  const ay = -GRAVITY - k * v.y + MAGNUS * (s.z * v.x - s.x * v.z);
  const az = -k * v.z + MAGNUS * (s.x * v.y - s.y * v.x);
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;

  if (p.y <= BALL_R) {
    p.y = BALL_R;
    if (v.y < -1.0) {
      v.y = -v.y * 0.5;
      v.x *= 0.82; v.z *= 0.82;
      s.x *= 0.4; s.y *= 0.4; s.z *= 0.4;
      b.bounces++;
    } else if (v.y < 0) {
      v.y = 0;
    }
    if (v.y === 0) { // rolling: friction slows it and kills the spin
      const f = Math.max(0, 1 - 1.2 * dt);
      v.x *= f; v.z *= f;
      const g = Math.max(0, 1 - 8 * dt);
      s.x *= g; s.y *= g; s.z *= g;
    }
  }
}

/**
 * Fly a copy of the ball until it reaches the goal line (or gives up).
 * Returns sampled points for drawing and `cross` = where/when it crossed z = 0.
 */
export function tracePath(ball0, { dt = 1 / 120, maxT = 4, every = 4 } = {}) {
  const b = cloneBall(ball0);
  const points = [{ ...b.p }];
  let t = 0, i = 0, cross = null;
  while (t < maxT) {
    const px = b.p.x, py = b.p.y, pz = b.p.z;
    stepBall(b, dt);
    t += dt; i++;
    if (pz > 0 && b.p.z <= 0) {
      const f = pz / (pz - b.p.z);
      cross = {
        x: px + (b.p.x - px) * f,
        y: py + (b.p.y - py) * f,
        z: 0,
        t: t - dt + f * dt,
        bounces: b.bounces,
      };
      points.push({ x: cross.x, y: cross.y, z: 0 });
      break;
    }
    if (i % every === 0) points.push({ ...b.p });
    if (b.p.y <= BALL_R && Math.hypot(b.v.x, b.v.z) < 0.3) break; // rolled to a stop
  }
  return { points, cross };
}

/**
 * Find the launch velocity that makes the ball cross the goal line at `target`
 * for a given speed and spin. This is why the ball goes where the kid aimed:
 * spin changes the route, not the destination.
 */
export function solveKick(from, target, speed, spin) {
  const shoot = (ax, ay) => {
    const dx = ax - from.x, dy = ay - from.y, dz = -from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const v = { x: (dx / len) * speed, y: (dy / len) * speed, z: (dz / len) * speed };
    return { v, cross: tracePath(makeBall(from, v, spin), { every: 1000 }).cross };
  };
  // First guess: aim straight at the target, then shift the aim to cancel roughly
  // how far gravity and spin will push the ball during the flight.
  const tx = target.x - from.x, ty = target.y - from.y, tz = -from.z;
  const tl = Math.hypot(tx, ty, tz) || 1;
  const t0 = tl / speed;
  const vx = (tx / tl) * speed, vy = (ty / tl) * speed, vz = (tz / tl) * speed;
  const mx = MAGNUS * (spin.y * vz - spin.z * vy);
  const my = MAGNUS * (spin.z * vx - spin.x * vz) - GRAVITY;
  let ax = target.x - 0.5 * mx * t0 * t0;
  let ay = target.y - 0.5 * my * t0 * t0;
  let best = null, bestErr = Infinity, last = null;
  // Newton's method on the aim point, with the slope measured by two nearby test shots.
  for (let i = 0; i < 10; i++) {
    const r = last = shoot(ax, ay);
    if (!r.cross) { ay = Math.min(ay + 1.5, 20); continue; } // fell short: aim higher
    const ex = r.cross.x - target.x, ey = r.cross.y - target.y;
    const err = Math.hypot(ex, ey);
    if (err < bestErr) { best = r; bestErr = err; }
    if (err < 0.01) break;
    const h = 0.05;
    const sx = shoot(ax + h, ay).cross, sy = shoot(ax, ay + h).cross;
    let stepX = -ex, stepY = -ey;
    if (sx && sy) {
      const a = (sx.x - r.cross.x) / h, b = (sy.x - r.cross.x) / h;
      const c = (sx.y - r.cross.y) / h, d = (sy.y - r.cross.y) / h;
      const det = a * d - b * c;
      if (Math.abs(det) > 1e-3) {
        stepX = -(d * ex - b * ey) / det;
        stepY = -(-c * ex + a * ey) / det;
      }
    }
    ax += clamp(stepX, -3, 3);
    ay = clamp(ay + clamp(stepY, -3, 3), -1, 20);
  }
  return best || last;
}

/**
 * Turn "where on the ball did you kick it" into a spin vector.
 * sx: -1 = left edge of the ball, +1 = right edge. sy: -1 = bottom, +1 = top.
 * Kick the right side and the ball bends left (like real life); kick it low for
 * backspin (floats), high for topspin (dips).
 */
const REF_SPEED = 27;
export function spinFromTap(sx, sy, from, target, speed = REF_SPEED) {
  const len = Math.hypot(sx, sy);
  if (len > 1) { sx /= len; sy /= len; }
  // A softer kick puts less spin on the ball, so the bend looks the same at any power.
  const k = speed / REF_SPEED;
  sx *= k; sy *= k;
  let dx = target.x - from.x, dz = (target.z ?? 0) - from.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  // right = direction x up
  const rx = -dz, rz = dx;
  return { x: rx * -sy * LIFT_SPIN, y: sx, z: rz * -sy * LIFT_SPIN };
}

/** Smashing the meter into the red makes the shot wild (and usually too high). */
export function applyPowerError(target, power, rand = Math.random) {
  if (power <= SWEET.hi) return { x: target.x, y: target.y };
  const e = (power - SWEET.hi) / (1 - SWEET.hi);
  return {
    x: target.x + e * (rand() * 2 - 1) * 1.3,
    y: target.y + e * (0.6 + 1.6 * rand()),
  };
}

/** How far the path bends away from a straight line (metres), for the banana bonus. */
export function curveAmount(points) {
  if (points.length < 3) return 0;
  const a = points[0], b = points[points.length - 1];
  const cx = b.x - a.x, cz = b.z - a.z;
  const len = Math.hypot(cx, cz) || 1;
  let max = 0;
  for (const p of points) {
    const d = Math.abs((p.x - a.x) * cz - (p.z - a.z) * cx) / len;
    if (d > max) max = d;
  }
  return max;
}

function bounceOff(b, nx, ny, nz, overlap, restitution) {
  b.p.x += nx * overlap; b.p.y += ny * overlap; b.p.z += nz * overlap;
  const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
  if (vn < 0) {
    const j = (1 + restitution) * vn;
    b.v.x -= j * nx; b.v.y -= j * ny; b.v.z -= j * nz;
  }
  b.spin.x *= 0.3; b.spin.y *= 0.3; b.spin.z *= 0.3;
}

/** Bounce the ball off a capsule (pickle goalie or a wall gherkin). True if it hit. */
export function collideCapsule(b, a, c, radius, restitution = 0.4) {
  const abx = c.x - a.x, aby = c.y - a.y, abz = c.z - a.z;
  const apx = b.p.x - a.x, apy = b.p.y - a.y, apz = b.p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = clamp((apx * abx + apy * aby + apz * abz) / ab2, 0, 1);
  const qx = a.x + abx * t, qy = a.y + aby * t, qz = a.z + abz * t;
  let nx = b.p.x - qx, ny = b.p.y - qy, nz = b.p.z - qz;
  const d = Math.hypot(nx, ny, nz);
  const min = radius + BALL_R;
  if (d >= min) return false;
  if (d < 1e-6) { nx = 0; ny = 0; nz = 1; } else { nx /= d; ny /= d; nz /= d; }
  bounceOff(b, nx, ny, nz, min - d, restitution);
  return true;
}

/** Bounce the ball off the two posts and the crossbar. True if it hit the frame. */
export function collideGoalFrame(b, restitution = 0.6) {
  const min = GOAL.postR + BALL_R;
  let hit = false;
  // posts (vertical)
  for (const side of [-1, 1]) {
    if (b.p.y > GOAL.height + GOAL.postR) continue;
    const dx = b.p.x - side * GOAL.halfW, dz = b.p.z;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-6) { bounceOff(b, dx / d, 0, dz / d, min - d, restitution); hit = true; }
  }
  // crossbar (horizontal)
  if (Math.abs(b.p.x) <= GOAL.halfW + GOAL.postR) {
    const dy = b.p.y - GOAL.height, dz = b.p.z;
    const d = Math.hypot(dy, dz);
    if (d < min && d > 1e-6) { bounceOff(b, 0, dy / d, dz / d, min - d, restitution); hit = true; }
  }
  return hit;
}

/**
 * Did the ball just cross the goal line between prev and cur positions?
 * Returns null, or { type: 'goal' | 'wide' | 'over', x, y }.
 */
export function crossingResult(prev, cur) {
  if (!(prev.z > 0 && cur.z <= 0)) return null;
  const f = prev.z / (prev.z - cur.z);
  const x = prev.x + (cur.x - prev.x) * f;
  const y = prev.y + (cur.y - prev.y) * f;
  if (Math.abs(x) >= GOAL.halfW) return { type: 'wide', x, y };
  if (y >= GOAL.height) return { type: 'over', x, y };
  return { type: 'goal', x, y };
}

/** Once the ball is in the goal, keep it caught in the net. */
export function containNet(b, dt) {
  const f = Math.max(0, 1 - 4 * dt);
  b.v.x *= f; b.v.z *= f;
  const back = -GOAL.depth + BALL_R, side = GOAL.halfW - BALL_R, top = GOAL.height - BALL_R;
  if (b.p.z < back) { b.p.z = back; b.v.z = Math.abs(b.v.z) * 0.1; b.v.x *= 0.5; b.v.y *= 0.5; }
  if (b.p.z > -BALL_R) { b.p.z = -BALL_R; b.v.z = -Math.abs(b.v.z) * 0.1; }
  if (b.p.x > side) { b.p.x = side; b.v.x = -Math.abs(b.v.x) * 0.1; }
  if (b.p.x < -side) { b.p.x = -side; b.v.x = Math.abs(b.v.x) * 0.1; }
  if (b.p.y > top) { b.p.y = top; b.v.y = -Math.abs(b.v.y) * 0.1; }
}
