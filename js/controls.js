// The three steps of a kick: AIM, SPIN, POWER. Pointer events cover both mouse
// and touch. Each control only reports what the player did; main.js decides
// what happens next.
import * as THREE from 'three';
import { GOAL } from './physics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Limits for the aim target. A bit bigger than the goal, so you can miss. */
export const AIM_BOUNDS = { x: GOAL.halfW + 1.2, yMin: 0.3, yMax: GOAL.height + 1.0 };

export function clampAim(t) {
  t.x = clamp(t.x, -AIM_BOUNDS.x, AIM_BOUNDS.x);
  t.y = clamp(t.y, AIM_BOUNDS.yMin, AIM_BOUNDS.yMax);
  return t;
}

/** Step 1: slide a target around the goal mouth, then click or let go to lock it. */
export class AimControl {
  constructor(canvas, camera, { onMove, onLock }) {
    this.canvas = canvas; this.camera = camera;
    this.onMove = onMove; this.onLock = onLock;
    this.active = false; this.armed = false;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // the goal line
    this.ndc = new THREE.Vector2();
    this.hit = new THREE.Vector3();
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.armed = true;
      this._move(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (e.pointerType !== 'mouse' && !this.armed) return;
      this._move(e);
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.active || !this.armed) return;
      this.armed = false;
      this._move(e);
      this.onLock();
    });
  }

  enable() { this.active = true; this.armed = false; }
  disable() { this.active = false; this.armed = false; }

  _move(e) {
    const rect = this.canvas.getBoundingClientRect();
    // On touch screens the target sits above the finger so it isn't hidden.
    const lift = e.pointerType === 'mouse' ? 0 : 60;
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - lift - rect.top) / rect.height) * 2 - 1)
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return;
    this.onMove(clampAim({ x: this.hit.x, y: this.hit.y }));
  }
}

/** Step 2: pick the spot on the ball to kick. Reports sx, sy in -1..1. */
export class SpinControl {
  constructor(pad, { onChange, onLock }) {
    this.pad = pad; this.onChange = onChange; this.onLock = onLock;
    this.active = false; this.armed = false;
    pad.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.armed = true;
      pad.setPointerCapture?.(e.pointerId);
      this._move(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (e.pointerType !== 'mouse' && !this.armed) return;
      this._move(e);
    });
    pad.addEventListener('pointerup', (e) => {
      if (!this.active || !this.armed) return;
      this.armed = false;
      this._move(e);
      this.onLock();
    });
  }

  enable() { this.active = true; this.armed = false; }
  disable() { this.active = false; this.armed = false; }

  _move(e) {
    const r = this.pad.getBoundingClientRect();
    const reach = 0.82; // the kick spot can't go right to the very edge
    let sx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2) / reach;
    let sy = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2) / reach;
    const len = Math.hypot(sx, sy);
    if (len > 1) { sx /= len; sy /= len; }
    if (len < 0.15) { sx = 0; sy = 0; } // snap to dead centre: no spin
    this.onChange(sx, sy);
  }
}

/** Step 3: a marker bounces along the meter; tap anywhere to stop it. */
export class PowerControl {
  constructor({ onLock }) {
    this.onLock = onLock;
    this.active = false;
    this.value = 0;
    this.phase = 0;
    this.speed = 0.85;
    this.since = 0;
    window.addEventListener('pointerdown', (e) => {
      if (!this.active || this.since < 0.2) return;
      if (e.target.closest && e.target.closest('button')) return;
      this.lock();
    });
  }

  enable(speed) { this.active = true; this.speed = speed; this.phase = 0; this.value = 0; this.since = 0; }
  disable() { this.active = false; }

  update(dt) {
    if (!this.active) return;
    this.since += dt;
    this.phase += dt * this.speed;
    const p = this.phase % 1;
    this.value = p < 0.5 ? p * 2 : 2 - p * 2; // up and back down
  }

  lock() {
    if (!this.active) return;
    this.active = false;
    this.onLock(this.value);
  }
}
