// Level rules and scoring. Pure data and maths: no Three.js, no DOM.
import { GOAL } from './physics.js';

export const KICKS_PER_LEVEL = 5;
export const GOALS_TO_PASS = 3;

/** Settings for level n (1, 2, 3...). Every level is a little harder than the last. */
export function getLevel(n) {
  const i = Math.max(1, Math.floor(n)) - 1;
  return {
    n: i + 1,
    react: Math.max(0.16, 0.5 - 0.04 * i),        // seconds before the pickle moves
    diveSpeed: Math.min(7.5, 3.2 + 0.45 * i),     // metres per second
    readTime: Math.max(0.12, 0.55 - 0.05 * i),    // seconds a curving shot fools the pickle
    sway: Math.min(1.0, 0.35 + 0.08 * i),         // how far it shuffles side to side
    wall: i < 2 ? 0 : Math.min(5, 2 + Math.floor(i / 2)), // gherkin defenders
    wallHop: i >= 4,
    meterSpeed: Math.min(1.8, 0.85 + 0.08 * i),   // power meter sweeps per second
    distMin: Math.min(17, 13 + 0.4 * i),
    distMax: Math.min(21, 14.5 + 0.7 * i),
    angleMax: Math.min(0.4, 0.08 + 0.05 * i),     // radians off centre
  };
}

/** Where the free kick is taken from. rand() returns 0..1. */
export function kickSpot(level, rand = Math.random) {
  const dist = level.distMin + rand() * (level.distMax - level.distMin);
  const angle = (rand() * 2 - 1) * level.angleMax;
  return { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
}

export function starsFor(goals) {
  if (goals >= 5) return 3;
  if (goals >= 4) return 2;
  if (goals >= GOALS_TO_PASS) return 1;
  return 0;
}

/** Points and bonus labels for a goal. x, y = where the ball crossed the line. */
export function scoreKick({ x, y, curve = 0, streak = 1, lucky = false }) {
  let points = 100;
  const tags = [];
  if (Math.abs(x) > GOAL.halfW - 1.0 && y > GOAL.height - 0.9) {
    points += 50; tags.push('TOP CORNER! +50');
  }
  if (curve >= 0.8) { points += 25; tags.push('BANANA KICK! +25'); }
  if (streak >= 2) {
    const bonus = 20 * (streak - 1);
    points += bonus; tags.push(`${streak} IN A ROW! +${bonus}`);
  }
  if (lucky) tags.push('LUCKY BOUNCE!');
  return { points, tags };
}
