// The pickle goalie: how it looks, how it moves, and how it decides where to dive.
import * as THREE from 'three';
import { GOAL } from './physics.js';
import { memeGeometry, memeMaterial } from './memeskin.js';

const BODY_R = 0.4;
const BODY_LEN = 1.0;
const LEG = 0.2;
const STAND_Y = LEG + BODY_LEN / 2 + BODY_R; // height of the body centre when standing
export const KEEPER_Z = 0.5;                 // it stands just in front of the goal line

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const approach = (v, target, maxStep) => v + clamp(target - v, -maxStep, maxStep);

function seeded(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

let pickleTex = null;
function pickleTexture() {
  if (pickleTex) return pickleTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#8fd447');
  grad.addColorStop(0.5, '#62b52c');
  grad.addColorStop(1, '#3f8f20');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const rnd = seeded(11);
  for (let x = 0; x < 256; x += 32) { // lighter stripes running down the pickle
    g.fillStyle = 'rgba(190,240,110,0.35)';
    g.fillRect(x + 4, 0, 9, 256);
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(30,90,20,${0.15 + rnd() * 0.2})`;
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 0, Math.PI * 2);
    g.fill();
  }
  pickleTex = new THREE.CanvasTexture(c);
  pickleTex.colorSpace = THREE.SRGBColorSpace;
  return pickleTex;
}

/**
 * Build a pickle character out of simple shapes.
 *   full: add arms, gloves, legs and boots (the goalie); without it you get a plain gherkin.
 *   meme: wear the photo "meme pickle" skin instead of the cartoon face.
 */
export function buildPickle({ r = BODY_R, len = BODY_LEN, full = true, seed = 7, meme = false } = {}) {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: meme ? 0x77722a : 0x2f7a1c });
  const parts = { pupils: [], brows: [], mouth: null, oh: null, arms: [] };

  if (meme) {
    const body = new THREE.Mesh(memeGeometry(r, len), memeMaterial());
    body.scale.set(0.9, 1, 0.9); // the meme pickle is a little slimmer than the cartoon one
    group.add(body);
  } else {
    addCartoonBody(group, parts, r, len, seed, dark);
  }

  if (full) {
    if (!meme) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.06, 10, 28), new THREE.MeshLambertMaterial({ color: 0xff3b3b }));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.73;
      group.add(band);
    }
    const gloveMat = new THREE.MeshPhongMaterial({ color: 0xff9f1c, shininess: 40 });
    const bootMat = new THREE.MeshPhongMaterial({ color: 0xff3b6b, shininess: 60 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.36, 0.2, 0);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 10), dark);
      limb.position.y = 0.25;
      arm.add(limb);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), gloveMat);
      glove.position.y = 0.58;
      glove.scale.set(1, 1.1, 0.8);
      arm.add(glove);
      arm.userData.side = side;
      group.add(arm);
      parts.arms.push(arm);

      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10), dark);
      leg.position.set(side * 0.17, -(BODY_LEN / 2 + BODY_R) - 0.05, 0);
      group.add(leg);
      const boot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), bootMat);
      boot.position.set(side * 0.17, -(BODY_LEN / 2 + BODY_R) - 0.14, 0.07);
      boot.scale.set(1.1, 0.6, 1.7);
      group.add(boot);
    }
  }
  return { group, parts };
}

/** The green cartoon pickle: striped body, warty bumps and a face that can change. */
function addCartoonBody(group, parts, r, len, seed, dark) {
  const k = r / BODY_R; // scale for all the little parts
  const skin = new THREE.MeshPhongMaterial({ map: pickleTexture(), shininess: 70, specular: 0x446622 });
  const ink = new THREE.MeshBasicMaterial({ color: 0x18280f });
  const white = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90 });

  group.add(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 28), skin));

  // warty bumps, kept off the face
  const rnd = seeded(seed);
  const bumpGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 40; i++) {
    const y = (rnd() * 2 - 1) * (len / 2 + r * 0.7);
    const a = rnd() * Math.PI * 2;
    const over = Math.abs(y) - len / 2;
    const rr = over > 0 ? Math.sqrt(Math.max(0, r * r - over * over)) : r;
    const front = Math.abs(a - Math.PI / 2) < 0.9;
    if (front && y > -0.15 * k && y < 0.8 * k) continue;
    const b = new THREE.Mesh(bumpGeo, dark);
    b.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    b.scale.setScalar((0.03 + rnd() * 0.03) * k);
    group.add(b);
  }

  const eyeGeo = new THREE.SphereGeometry(0.125 * k, 16, 12);
  const pupilGeo = new THREE.SphereGeometry(0.06 * k, 12, 10);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, white);
    eye.position.set(side * 0.155 * k, 0.42 * k, 0.34 * k);
    group.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, ink);
    pupil.position.set(side * 0.155 * k, 0.42 * k, 0.445 * k);
    pupil.userData.base = pupil.position.clone();
    group.add(pupil);
    parts.pupils.push(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.19 * k, 0.05 * k, 0.05 * k), ink);
    brow.position.set(side * 0.16 * k, 0.6 * k, 0.37 * k);
    brow.userData = { side, baseY: 0.6 * k };
    group.add(brow);
    parts.brows.push(brow);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06 * k, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8fb0 }));
    cheek.position.set(side * 0.27 * k, 0.25 * k, 0.3 * k);
    cheek.scale.z = 0.4;
    group.add(cheek);
  }
  parts.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.13 * k, 0.03 * k, 8, 20, Math.PI), ink);
  parts.mouth.position.set(0, 0.2 * k, 0.385 * k);
  group.add(parts.mouth);
  parts.oh = new THREE.Mesh(new THREE.SphereGeometry(0.08 * k, 12, 10), ink);
  parts.oh.position.set(0, 0.17 * k, 0.385 * k);
  parts.oh.scale.z = 0.4;
  group.add(parts.oh);
}

/**
 * Change a pickle's expression: 'ready' | 'oh' | 'happy' | 'sad'.
 * The meme pickle has a photo for a face, so it keeps the same grin whatever happens.
 */
export function setFace(parts, face) {
  if (!parts.mouth) return;
  const smile = face === 'ready' || face === 'happy';
  parts.oh.visible = face === 'oh';
  parts.mouth.visible = face !== 'oh';
  parts.mouth.rotation.z = smile ? Math.PI : 0;
  parts.mouth.scale.setScalar(face === 'happy' ? 1.35 : 1);
  const tilt = { ready: 0.3, oh: 0.15, happy: -0.1, sad: -0.45 }[face] ?? 0;
  for (const b of parts.brows) {
    b.rotation.z = -b.userData.side * tilt; // inner ends down = cheeky/determined
    b.position.y = b.userData.baseY + (face === 'happy' || face === 'oh' ? 0.05 : 0);
  }
}

export class Pickle {
  constructor(scene) {
    const built = buildPickle({ meme: true });
    this.body = built.group;      // spins around its own long axis
    this.parts = built.parts;
    this.root = new THREE.Group(); // moves and leans
    this.root.add(this.body);
    scene.add(this.root);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x0b3d12, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    scene.add(this.shadow);

    this.level = { react: 0.5, diveSpeed: 3.2, readTime: 0.55, sway: 0.35 };
    this.reset();
  }

  setLevel(level) { this.level = level; }

  reset() {
    this.mode = 'idle';
    this.cx = 0; this.cy = STAND_Y;
    this.lean = 0;      // radians; positive leans toward +x
    this.armExt = 0.15; // 0 = arms down, 1 = stretched above the head
    this.spin = 0;
    this.t = 0;         // time in the current mode
    this.idleT = this.idleT ?? 0;
    this.hop = 0;
    setFace(this.parts, 'ready');
  }

  /**
   * The ball has been kicked. `real` is where it will truly cross the line,
   * `naive` is where it looks like it is going before the spin bends it.
   */
  onKick({ real, naive }) {
    this.mode = 'dive';
    this.t = 0;
    this.cx0 = this.cx;
    this.real = real;
    this.naive = naive;
    setFace(this.parts, 'oh');
  }

  /** After the kick is decided: sulk on a goal, party on anything else. */
  react(outcome) {
    this.mode = outcome === 'goal' ? 'sad' : 'celebrate';
    this.t = 0;
    setFace(this.parts, outcome === 'goal' ? 'sad' : 'happy');
  }

  /** Advance the goalie's brain and body by dt seconds. */
  step(dt) {
    this.t += dt;
    const L = this.level;
    this.hop = 0;

    if (this.mode === 'idle') {
      this.idleT += dt;
      this.cx = Math.sin(this.idleT * 1.7) * L.sway;
      this.cy = STAND_Y;
      this.hop = Math.abs(Math.sin(this.idleT * 3.4)) * 0.07;
      this.lean = Math.sin(this.idleT * 1.7 + 0.6) * 0.08;
      this.armExt = approach(this.armExt, 0.15, dt * 2);
      this.spin = 0;
    } else if (this.mode === 'dive') {
      if (this.t >= L.react) {
        // Early on the pickle chases where the ball *looks* like it's going,
        // then figures out the real spot. That's what makes curve shots sneaky.
        const read = clamp((this.t - L.react) / L.readTime, 0, 1);
        const px = clamp(lerp(this.naive.x, this.real.x, read), -GOAL.halfW - 0.3, GOAL.halfW + 0.3);
        const py = clamp(lerp(this.naive.y, this.real.y, read), 0.2, GOAL.height + 0.3);
        const d = px - this.cx0;
        const tlean = Math.sign(d) * smooth(0.4, 1.6, Math.abs(d)) * 1.4;
        const along = 0.95; // aim to meet the ball with the gloves, not the tummy
        const tx = px - Math.sin(tlean) * along;
        const minY = lerp(STAND_Y, 0.42, Math.abs(tlean) / 1.4);
        const ty = clamp(py - Math.cos(tlean) * along, minY, 1.8);
        const dx = tx - this.cx, dy = ty - this.cy;
        const dist = Math.hypot(dx, dy);
        const stepLen = Math.min(dist, L.diveSpeed * dt);
        if (dist > 1e-6) { this.cx += (dx / dist) * stepLen; this.cy += (dy / dist) * stepLen; }
        this.lean = approach(this.lean, tlean, dt * 7);
        this.armExt = approach(this.armExt, 1, dt * 6);
      } else {
        this.hop = Math.abs(Math.sin(this.t * 20)) * 0.04; // nervous jiggle
      }
    } else if (this.mode === 'celebrate') {
      this.lean = approach(this.lean, 0, dt * 5);
      this.cy = approach(this.cy, STAND_Y, dt * 4);
      this.armExt = approach(this.armExt, 1, dt * 5);
      if (Math.abs(this.lean) < 0.05) {
        this.hop = Math.abs(Math.sin(this.t * 9)) * 0.35;
        this.spin += dt * 7;
      }
    } else if (this.mode === 'sad') {
      if (this.t > 0.5) {
        this.lean = approach(this.lean, 0, dt * 2.5);
        this.cy = approach(this.cy, STAND_Y, dt * 2);
      }
      this.armExt = approach(this.armExt, 0, dt * 3);
      this.spin = Math.sin(this.t * 9) * 0.3; // shaking its head
    }
    this.cx = clamp(this.cx, -GOAL.halfW - 0.5, GOAL.halfW + 0.5);
  }

  /** The goalie as a capsule (two end points and a radius) for ball collisions. */
  capsule() {
    const ux = Math.sin(this.lean), uy = Math.cos(this.lean);
    const y = this.cy + this.hop;
    const down = BODY_LEN / 2 + 0.2, up = BODY_LEN / 2 + this.armExt * 0.6;
    return {
      a: { x: this.cx - ux * down, y: y - uy * down, z: KEEPER_Z },
      b: { x: this.cx + ux * up, y: y + uy * up, z: KEEPER_Z },
      r: BODY_R,
    };
  }

  /** Copy the goalie's state onto its 3D model. Call once per frame. */
  sync(time, ballPos) {
    const y = this.cy + this.hop;
    this.root.position.set(this.cx, y, KEEPER_Z);
    this.root.rotation.z = -this.lean;
    this.body.rotation.y = this.spin;

    const wave = Math.sin(time * 6) * 0.15;
    for (const arm of this.parts.arms) {
      const side = arm.userData.side;
      const down = 2.0 + wave * side, up = 0.22 + (this.mode === 'celebrate' ? wave : 0);
      arm.rotation.z = -side * lerp(down, up, this.armExt);
    }
    if (ballPos) {
      const ox = clamp((ballPos.x - this.cx) / 5, -1, 1) * 0.045;
      const oy = clamp((ballPos.y - (y + 0.4)) / 5, -1, 1) * 0.045;
      for (const p of this.parts.pupils) {
        p.position.x = p.userData.base.x + ox;
        p.position.y = p.userData.base.y + oy;
      }
    }
    this.shadow.position.set(this.cx, 0.02, KEEPER_Z);
    const s = clamp(1.25 - (y - STAND_Y) * 0.5 + Math.abs(this.lean) * 0.4, 0.5, 1.8);
    this.shadow.scale.set(s, s, s);
  }

  /** World position just above the head, for the speech bubble. */
  headWorld(out) {
    return this.root.localToWorld(out.set(0, 1.05, 0));
  }
}
