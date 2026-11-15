// What the ball (and the kicker's boot) look like. The ball's movement comes
// from physics.js; this file only draws it.
import * as THREE from 'three';
import { BALL_R } from './physics.js';

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1d2460';
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) {
    verts.push([0, a, b], [a, b, 0], [b, 0, a]);
  }
  for (const [x, y, z] of verts) { // one patch at each corner of an icosahedron
    const len = Math.hypot(x, y, z);
    const polar = Math.acos(y / len);
    const u = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    const rx = 15 / Math.max(0.3, Math.sin(polar));
    for (const wrap of [-1, 0, 1]) {
      g.beginPath();
      g.ellipse((u + wrap) * 256, (polar / Math.PI) * 128, rx, 15, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BallView {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 28, 20),
      new THREE.MeshPhongMaterial({ map: ballTexture(), shininess: 50 })
    );
    scene.add(this.mesh);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_R * 1.2, 20),
      new THREE.MeshBasicMaterial({ color: 0x0b3d12, transparent: true, opacity: 0.4, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    this.axis = new THREE.Vector3();
  }

  sync(ball, dt) {
    const { p, v, spin } = ball;
    this.mesh.position.set(p.x, p.y, p.z);
    // tumble: forward roll from its speed plus whatever spin was put on it
    this.axis.set(-v.z + spin.x * 30, spin.y * 30, v.x + spin.z * 30);
    const len = this.axis.length();
    if (len > 0.01) this.mesh.rotateOnWorldAxis(this.axis.divideScalar(len), Math.min(len, 40) * dt * 0.8);
    this.shadow.position.set(p.x, 0.015, p.z);
    const s = Math.max(0.4, 1 - (p.y - BALL_R) * 0.12);
    this.shadow.scale.set(s, s, s);
    this.shadow.material.opacity = 0.4 * s;
  }
}

/** The kicker's boot, which swings in from the bottom of the screen. */
export class Boot {
  constructor(scene) {
    this.group = new THREE.Group();
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 6, 12), new THREE.MeshPhongMaterial({ color: 0xff8a1f, shininess: 60 }));
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.y = 0.75;
    this.group.add(shoe);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.12, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.set(0, 0.03, -0.05);
    this.group.add(stripe);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.5, 12), new THREE.MeshLambertMaterial({ color: 0x3aa0ff }));
    sock.position.set(0, 0.28, 0.2);
    this.group.add(sock);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** k: 0 = start of the swing, 1 = hitting the ball, up to 2 = follow-through. */
  pose(k, ball, dir) {
    this.group.visible = k >= 0 && k < 2;
    if (!this.group.visible) return;
    const back = 1.5 * (1 - k); // metres behind the ball (negative = past it)
    const side = 0.3 * Math.max(0, 1 - k);
    this.group.position.set(
      ball.x - dir.x * (back + 0.3) + -dir.z * side,
      0.16 + Math.abs(1 - k) * 0.3,
      ball.z - dir.z * (back + 0.3) + dir.x * side
    );
    this.group.rotation.y = Math.atan2(-dir.x, -dir.z);
  }

  hide() { this.group.visible = false; }
}
