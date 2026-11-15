// The defensive wall: a row of nervous mini gherkins between the ball and the goal.
import * as THREE from 'three';
import { buildPickle, setFace } from './pickle.js';

const R = 0.24, LEN = 0.8, MAX = 5;
const CENTRE_Y = LEN / 2 + R;
const WALL_DIST = 6.5; // metres from the ball

export class Wall {
  constructor(scene) {
    this.members = [];
    for (let i = 0; i < MAX; i++) {
      const { group, parts } = buildPickle({ r: R, len: LEN, full: false, seed: 20 + i * 7 });
      setFace(parts, 'oh');
      group.visible = false;
      scene.add(group);
      this.members.push({ group, x: 0, z: 0, yoff: 0, active: false, phase: i * 1.3, delay: 0 });
    }
    this.hop = false;
    this.jumpT = -1;
  }

  /** Line the wall up for a kick from `spot`. A level with wall = 0 hides it. */
  setup(spot, level, rand = Math.random) {
    this.hop = level.wallHop;
    this.jumpT = -1;
    const side = rand() < 0.5 ? -1 : 1;
    const aim = { x: side * 1.5, z: 0 }; // the wall guards one side of the goal
    let dx = aim.x - spot.x, dz = aim.z - spot.z;
    const d = Math.hypot(dx, dz);
    dx /= d; dz /= d;
    const cx = spot.x + dx * WALL_DIST, cz = spot.z + dz * WALL_DIST;
    const px = -dz, pz = dx; // sideways along the wall
    this.members.forEach((m, i) => {
      m.active = i < level.wall;
      m.group.visible = m.active;
      if (!m.active) return;
      const off = (i - (level.wall - 1) / 2) * 0.56;
      m.x = cx + px * off;
      m.z = cz + pz * off;
      m.yoff = 0;
      m.delay = rand() * 0.08;
      m.group.rotation.y = Math.atan2(spot.x - m.x, spot.z - m.z);
    });
  }

  hide() { for (const m of this.members) { m.active = false; m.group.visible = false; } }

  onKick() { if (this.hop) this.jumpT = 0; }

  step(dt) {
    if (this.jumpT >= 0) this.jumpT += dt;
    for (const m of this.members) {
      if (!m.active) continue;
      const t = this.jumpT - m.delay;
      m.yoff = this.jumpT >= 0 && t > 0 ? Math.max(0, 3.3 * t - 4.9 * t * t) : 0;
    }
  }

  /** Collision capsules for the gherkins that are on the pitch. */
  capsules() {
    return this.members.filter((m) => m.active).map((m) => ({
      a: { x: m.x, y: R + m.yoff, z: m.z },
      b: { x: m.x, y: R + LEN + m.yoff, z: m.z },
      r: R,
    }));
  }

  sync(time) {
    for (const m of this.members) {
      if (!m.active) continue;
      const wobble = Math.abs(Math.sin(time * 5 + m.phase)) * 0.04;
      m.group.position.set(m.x, CENTRE_Y + m.yoff + wobble, m.z);
    }
  }
}
