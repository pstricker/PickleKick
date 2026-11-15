import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL, BALL_R, SWEET, FIXED_DT, makeBall, stepBall, tracePath, solveKick, spinFromTap,
  applyPowerError, powerToSpeed, curveAmount, collideCapsule, collideGoalFrame,
  crossingResult, containNet,
} from '../js/physics.js';
import { getLevel, kickSpot, starsFor, scoreKick } from '../js/levels.js';

const FROM = { x: 0, y: BALL_R, z: 16 };
const NO_SPIN = { x: 0, y: 0, z: 0 };

test('a no-spin shot lands where it was aimed', () => {
  for (const target of [{ x: 2, y: 1.5 }, { x: -3.2, y: 2.1 }, { x: 0, y: 0.4 }]) {
    const { cross } = solveKick(FROM, target, powerToSpeed(0.75), NO_SPIN);
    assert.ok(cross, 'ball reaches the goal line');
    assert.ok(Math.abs(cross.x - target.x) < 0.05, `x ${cross.x} vs ${target.x}`);
    assert.ok(Math.abs(cross.y - target.y) < 0.05, `y ${cross.y} vs ${target.y}`);
  }
});

test('shots from an angle and with spin still land on the target', () => {
  const from = { x: 6, y: BALL_R, z: 17 };
  const target = { x: -2.5, y: 1.8 };
  const spin = spinFromTap(1, 0, from, target);
  const { cross } = solveKick(from, target, powerToSpeed(0.7), spin);
  assert.ok(Math.abs(cross.x - target.x) < 0.05 && Math.abs(cross.y - target.y) < 0.05);
});

test('kicking the right side of the ball bends it left', () => {
  const b = makeBall({ x: 0, y: 1, z: 16 }, { x: 0, y: 4, z: -25 }, spinFromTap(1, 0, FROM, { x: 0, y: 1 }));
  for (let i = 0; i < 100; i++) stepBall(b, FIXED_DT);
  assert.ok(b.p.x < -0.05, `expected drift left, got ${b.p.x}`);
});

test('kicking the left side bends it right, and the route bulges left first', () => {
  const target = { x: 0, y: 1.2 };
  const spin = spinFromTap(-1, 0, FROM, target);
  const { v } = solveKick(FROM, target, powerToSpeed(0.75), spin);
  const { points } = tracePath(makeBall(FROM, v, spin));
  const mid = points[Math.floor(points.length / 2)];
  assert.ok(mid.x < -0.5, `path should swing out to the left, got ${mid.x}`);
  assert.ok(curveAmount(points) > 1.2, 'a full-spin shot earns the banana bonus');
  assert.ok(curveAmount(tracePath(makeBall(FROM, solveKick(FROM, target, 27, NO_SPIN).v)).points) < 0.05);
});

test('backspin lifts and topspin dips', () => {
  const fly = (sy) => {
    const b = makeBall({ x: 0, y: 1, z: 16 }, { x: 0, y: 3, z: -25 }, spinFromTap(0, sy, FROM, { x: 0, y: 1 }));
    for (let i = 0; i < 100; i++) stepBall(b, FIXED_DT);
    return b.p.y;
  };
  assert.ok(fly(-1) > fly(0) && fly(0) > fly(1));
});

test('power in the red throws the shot high; the green zone is accurate', () => {
  const t = { x: 0, y: 2.0 };
  assert.deepEqual(applyPowerError(t, SWEET.hi, () => 1), t);
  assert.deepEqual(applyPowerError(t, 0.3, () => 1), t);
  const wild = applyPowerError(t, 1, () => 1);
  assert.ok(wild.y > GOAL.height, 'max power sails over the bar');
  const { v } = solveKick(FROM, wild, powerToSpeed(1), NO_SPIN);
  const b = makeBall(FROM, v);
  let result = null;
  for (let i = 0; i < 2000 && !result; i++) {
    const prev = { ...b.p };
    stepBall(b, FIXED_DT);
    result = crossingResult(prev, b.p);
  }
  assert.equal(result.type, 'over');
});

test('crossing the line is classified as goal, wide or over', () => {
  const cross = (x, y) => crossingResult({ x, y, z: 0.1 }, { x, y, z: -0.1 });
  assert.equal(cross(0, 1).type, 'goal');
  assert.equal(cross(3.5, 2.3).type, 'goal');
  assert.equal(cross(4.2, 1).type, 'wide');
  assert.equal(cross(-4.2, 1).type, 'wide');
  assert.equal(cross(0, 3).type, 'over');
  assert.equal(crossingResult({ x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: 1.9 }), null);
  assert.equal(crossingResult({ x: 0, y: 1, z: -0.1 }, { x: 0, y: 1, z: 0.1 }), null, 'coming back out is not a goal');
});

test('the ball bounces back off a post and off the crossbar', () => {
  const post = makeBall({ x: GOAL.halfW, y: 1, z: 0.5 }, { x: 0, y: 0, z: -25 });
  let hit = false;
  for (let i = 0; i < 60; i++) { stepBall(post, FIXED_DT); hit = collideGoalFrame(post) || hit; }
  assert.ok(hit && post.v.z > 0 && post.p.z > 0, 'post sends it back');

  const bar = makeBall({ x: 1, y: GOAL.height, z: 0.5 }, { x: 0, y: 0, z: -25 });
  hit = false;
  for (let i = 0; i < 60; i++) { stepBall(bar, FIXED_DT); hit = collideGoalFrame(bar) || hit; }
  assert.ok(hit && bar.p.z > 0, 'crossbar sends it back');
});

test('a goalie-shaped capsule blocks the ball; a miss does not', () => {
  const a = { x: 0, y: 0.4, z: 0.5 }, c = { x: 0, y: 1.6, z: 0.5 };
  const shot = makeBall({ x: 0.2, y: 1, z: 3 }, { x: 0, y: 0, z: -20 });
  let hit = false;
  for (let i = 0; i < 120; i++) { stepBall(shot, FIXED_DT); hit = collideCapsule(shot, a, c, 0.4) || hit; }
  assert.ok(hit && shot.p.z > 0.5, 'saved');

  const past = makeBall({ x: 2, y: 1, z: 3 }, { x: 0, y: 0, z: -20 });
  hit = false;
  for (let i = 0; i < 120; i++) { stepBall(past, FIXED_DT); hit = collideCapsule(past, a, c, 0.4) || hit; }
  assert.ok(!hit);
});

test('the net keeps a scored ball inside the goal', () => {
  const b = makeBall({ x: 3, y: 2, z: -0.3 }, { x: 8, y: 4, z: -28 });
  b.inNet = true;
  for (let i = 0; i < 480; i++) { stepBall(b, FIXED_DT); containNet(b, FIXED_DT); }
  assert.ok(b.p.z >= -GOAL.depth && b.p.z < 0 && Math.abs(b.p.x) < GOAL.halfW && b.p.y < GOAL.height);
});

test('a weak shot still gets there, slowly', () => {
  const soft = solveKick(FROM, { x: 0, y: 1 }, powerToSpeed(0), NO_SPIN).cross;
  const hard = solveKick(FROM, { x: 0, y: 1 }, powerToSpeed(0.8), NO_SPIN).cross;
  assert.ok(soft && hard && soft.t > hard.t * 1.5);
});

test('levels never get easier, and level 10 is much harder than level 1', () => {
  for (let n = 1; n < 20; n++) {
    const a = getLevel(n), b = getLevel(n + 1);
    assert.ok(b.react <= a.react && b.diveSpeed >= a.diveSpeed && b.readTime <= a.readTime);
    assert.ok(b.wall >= a.wall && b.distMax >= a.distMax && b.meterSpeed >= a.meterSpeed);
  }
  const one = getLevel(1), ten = getLevel(10);
  assert.equal(one.wall, 0);
  assert.equal(getLevel(3).wall, 3);
  assert.ok(ten.diveSpeed > one.diveSpeed * 1.5 && ten.react < one.react * 0.6 && ten.wallHop && !one.wallHop);
});

test('kick spots stay in range and in front of the goal', () => {
  for (let n = 1; n <= 12; n++) {
    const level = getLevel(n);
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const s = kickSpot(level, () => r);
      const d = Math.hypot(s.x, s.z);
      assert.ok(d >= level.distMin - 1e-9 && d <= level.distMax + 1e-9 && s.z > 10);
    }
  }
});

test('scoring: stars and bonuses', () => {
  assert.deepEqual([2, 3, 4, 5].map(starsFor), [0, 1, 2, 3]);
  assert.equal(scoreKick({ x: 0, y: 1 }).points, 100);
  assert.equal(scoreKick({ x: 3.2, y: 2.0 }).points, 150);
  assert.equal(scoreKick({ x: 0, y: 1, curve: 2 }).points, 125);
  assert.equal(scoreKick({ x: 0, y: 1, streak: 3 }).points, 140);
});
