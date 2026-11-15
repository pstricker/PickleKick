// Eye candy: the rainbow preview line, the aim target, confetti and camera shake.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;

/** A marching line of rainbow dots showing where the ball will fly. */
export class Preview {
  constructor(scene, count = 30) {
    this.group = new THREE.Group();
    this.dots = [];
    const geo = new THREE.SphereGeometry(0.075, 10, 8);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / count, 1, 0.6), transparent: true, opacity: 0.95 });
      const dot = new THREE.Mesh(geo, mat);
      this.group.add(dot);
      this.dots.push(dot);
    }
    this.group.visible = false;
    this.points = null;
    this.phase = 0;
    scene.add(this.group);
  }

  setPath(points) { this.points = points; this.group.visible = points.length > 1; this._place(); }
  hide() { this.group.visible = false; this.points = null; }

  update(dt) {
    if (!this.points) return;
    this.phase = (this.phase + dt * 0.9) % 1;
    this._place();
  }

  _place() {
    const pts = this.points;
    if (!pts || pts.length < 2) return;
    const n = this.dots.length;
    for (let i = 0; i < n; i++) {
      const f = ((i + this.phase) / n) * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const a = pts[k], b = pts[k + 1], t = f - k;
      this.dots[i].position.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
      // fade in near the ball so the dots don't cover it
      this.dots[i].material.opacity = Math.min(0.95, (i + this.phase) / 3);
    }
  }
}

/** The bullseye the player slides around the goal. */
export class TargetMarker {
  constructor(scene) {
    this.group = new THREE.Group();
    const ring = (inner, outer, color) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 40),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, side: THREE.DoubleSide })
      );
      m.renderOrder = 10;
      this.group.add(m);
    };
    ring(0.34, 0.44, 0xffffff);
    ring(0.22, 0.34, 0xff3b6b);
    ring(0.1, 0.22, 0xffffff);
    ring(0, 0.1, 0xff3b6b);
    this.group.visible = false;
    scene.add(this.group);
  }

  set(x, y) { this.group.position.set(x, y, 0.05); }
  show(on) { this.group.visible = on; }
  update(time, locked) {
    const s = locked ? 0.85 : 1 + Math.sin(time * 7) * 0.12;
    this.group.scale.set(s, s, s);
  }
}

const CONFETTI = ['#ff5fa2', '#ffd93b', '#3aa0ff', '#ff8a1f', '#9b6bff', '#5fd13d', '#ffffff'];

/** Throw confetti (DOM pieces animated by CSS). */
export function confetti(container, count = 90) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', `${Math.random() * 100}vw`);
    p.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 25}vw`);
    p.style.setProperty('--spin', `${(Math.random() * 2 - 1) * 1080}deg`);
    p.style.setProperty('--time', `${1.6 + Math.random() * 1.6}s`);
    p.style.setProperty('--delay', `${Math.random() * 0.35}s`);
    p.style.background = CONFETTI[i % CONFETTI.length];
    p.style.width = p.style.height = `${8 + Math.random() * 10}px`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    container.appendChild(p);
    setTimeout(() => p.remove(), 3800);
  }
}

/** A short camera wobble, for when the ball smacks the post. */
export class Shake {
  constructor() { this.amount = 0; }
  kick(amount = 0.25) { this.amount = Math.max(this.amount, amount); }
  apply(camera, dt) {
    if (this.amount <= 0.001) return;
    camera.position.x += (Math.random() * 2 - 1) * this.amount;
    camera.position.y += (Math.random() * 2 - 1) * this.amount * 0.6;
    this.amount *= Math.max(0, 1 - dt * 7);
  }
}
