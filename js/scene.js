// The stadium: sky, sun, clouds, striped pitch, goal with a net, stands and a
// bouncing crowd. Everything is drawn in code, so there are no image files.
import * as THREE from 'three';
import { GOAL } from './physics.js';

const CROWD_COLORS = [0xff5fa2, 0xffd93b, 0x3aa0ff, 0xff8a1f, 0x9b6bff, 0x5fd13d, 0xffffff, 0xff4d4d, 0x2fe0d0];

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSky() {
  return canvasTexture(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1f7bff');
    grad.addColorStop(0.5, '#6cc8ff');
    grad.addColorStop(1, '#d6f5ff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// Pitch texture covers x -32..32 and z -14..50 at 16 pixels per metre.
function makePitchTexture() {
  const PPM = 16;
  const X = (x) => (x + 32) * PPM, Z = (z) => (z + 14) * PPM;
  return canvasTexture(1024, 1024, (g) => {
    for (let z = -14, i = 0; z < 50; z += 4, i++) {
      g.fillStyle = i % 2 ? '#3fba45' : '#55cf4f';
      g.fillRect(0, Z(z), 1024, 4 * PPM);
    }
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(X(-30), Z(0)); g.lineTo(X(30), Z(0)); g.stroke();          // goal line
    g.strokeRect(X(-30), Z(0), 60 * PPM, 60 * PPM);                                     // touchlines
    g.strokeRect(X(-20.16), Z(0), 40.32 * PPM, 16.5 * PPM);                             // penalty box
    g.strokeRect(X(-9.16), Z(0), 18.32 * PPM, 5.5 * PPM);                               // six-yard box
    g.beginPath(); g.arc(X(0), Z(11), 0.22 * PPM, 0, Math.PI * 2); g.fill();            // penalty spot
    const a = Math.acos(5.5 / 9.15);
    g.beginPath(); g.arc(X(0), Z(11), 9.15 * PPM, Math.PI / 2 - a, Math.PI / 2 + a); g.stroke(); // the D
  });
}

function makeNetTexture() {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 5;
    g.strokeRect(0, 0, 64, 64);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeAdTexture() {
  const words = ['🥒 PICKLE POWER!', '⚽ KICK IT!', '🥒 KIND OF A BIG DILL', '⭐ GO GO GOAL!', '🥒 DILL WITH IT!', '⚽ BEND IT!'];
  const colors = ['#ff5fa2', '#3aa0ff', '#ffd93b', '#9b6bff', '#ff8a1f', '#2fe0d0'];
  return canvasTexture(4096, 128, (g, w, h) => {
    const pw = w / words.length;
    words.forEach((word, i) => {
      g.fillStyle = colors[i];
      g.fillRect(i * pw, 0, pw, h);
      g.fillStyle = '#1d2460';
      g.font = 'bold 64px "Fredoka", "Arial Rounded MT Bold", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(word, i * pw + pw / 2, h / 2 + 4);
    });
  });
}

function buildGoal(scene) {
  const goal = new THREE.Group();
  const white = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
  const postGeo = new THREE.CylinderGeometry(GOAL.postR, GOAL.postR, GOAL.height, 16);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, white);
    post.position.set(side * GOAL.halfW, GOAL.height / 2, 0);
    goal.add(post);
    // back stanchion
    const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, GOAL.height, 8), white);
    stay.position.set(side * GOAL.halfW, GOAL.height / 2, -GOAL.depth);
    goal.add(stay);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, GOAL.depth, 8), white);
    top.rotation.x = Math.PI / 2;
    top.position.set(side * GOAL.halfW, GOAL.height, -GOAL.depth / 2);
    goal.add(top);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(GOAL.postR, GOAL.postR, GOAL.halfW * 2 + GOAL.postR * 2, 16), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL.height, 0);
  goal.add(bar);
  const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, GOAL.halfW * 2, 8), white);
  backBar.rotation.z = Math.PI / 2;
  backBar.position.set(0, GOAL.height, -GOAL.depth);
  goal.add(backBar);

  const netTex = makeNetTexture();
  const netPanel = (w, h) => {
    const tex = netTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 0.22, h / 0.22);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  };
  const back = netPanel(GOAL.halfW * 2, GOAL.height);
  back.position.set(0, GOAL.height / 2, -GOAL.depth);
  goal.add(back);
  const roof = netPanel(GOAL.halfW * 2, GOAL.depth);
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, GOAL.height, -GOAL.depth / 2);
  goal.add(roof);
  for (const side of [-1, 1]) {
    const sideNet = netPanel(GOAL.depth, GOAL.height);
    sideNet.rotation.y = Math.PI / 2;
    sideNet.position.set(side * GOAL.halfW, GOAL.height / 2, -GOAL.depth / 2);
    goal.add(sideNet);
  }
  scene.add(goal);
  return { back };
}

function buildCrowd(scene) {
  const seats = [];
  const standMat = [new THREE.MeshLambertMaterial({ color: 0x6a4bd6 }), new THREE.MeshLambertMaterial({ color: 0x8466ee })];
  const addStep = (w, d, x, y, z, rotY, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), standMat[i % 2]);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
  };
  const ROWS = 6;
  for (let r = 0; r < ROWS; r++) {
    const y = 0.45 + r * 0.9;
    // behind the goal
    addStep(64, 1.4, 0, y, -13.5 - r * 1.4, 0, r);
    for (let x = -30; x <= 30; x += 1.15) seats.push({ x: x + (r % 2) * 0.5, y: y + 0.85, z: -13.5 - r * 1.4 });
    // down both sides
    for (const side of [-1, 1]) {
      addStep(1.4, 46, side * (34 + r * 1.4), y, 10, 0, r);
      for (let z = -11; z <= 31; z += 1.25) seats.push({ x: side * (34 + r * 1.4), y: y + 0.85, z: z + (r % 2) * 0.5 });
    }
  }
  const geo = new THREE.SphereGeometry(0.46, 10, 8);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), seats.length);
  const color = new THREE.Color();
  seats.forEach((s, i) => {
    s.phase = Math.random() * Math.PI * 2;
    s.speed = 3 + Math.random() * 3;
    mesh.setColorAt(i, color.setHex(CROWD_COLORS[(Math.random() * CROWD_COLORS.length) | 0]));
  });
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, seats, dummy: new THREE.Object3D() };
}

function buildClouds(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const puffs = 4 + ((Math.random() * 3) | 0);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 1.8, 12, 10), mat);
      s.position.set((p - puffs / 2) * 2.6, Math.random() * 1.2, Math.random() * 1.5);
      s.scale.y = 0.7;
      g.add(s);
    }
    g.position.set(-90 + i * 22 + Math.random() * 8, 20 + Math.random() * 16, -70 - Math.random() * 30);
    g.userData.speed = 0.4 + Math.random() * 0.5;
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

export function createStadium(scene, renderer) {
  scene.background = makeSky();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7fcf6a, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4d6, 2.4);
  sun.position.set(-12, 22, 18);
  scene.add(sun);

  const sunBall = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: 0xffe84d }));
  sunBall.position.set(-48, 46, -110);
  scene.add(sunBall);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(10, 40), new THREE.MeshBasicMaterial({ color: 0xfff6a8, transparent: true, opacity: 0.45 }));
  glow.position.set(-48, 46, -110.5);
  scene.add(glow);

  const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x2f9a3c }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);

  const pitchTex = makePitchTexture();
  pitchTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ map: pitchTex }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0, 18);
  scene.add(pitch);

  const adTex = makeAdTexture();
  adTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ads = new THREE.Mesh(new THREE.PlaneGeometry(62, 1.5), new THREE.MeshBasicMaterial({ map: adTex }));
  ads.position.set(0, 0.75, -11.5);
  scene.add(ads);

  const goal = buildGoal(scene);
  const crowd = buildCrowd(scene);
  const clouds = buildClouds(scene);

  let excitement = 0; // 0 = calm bobbing, 1 = going bananas
  let ripple = 0;

  return {
    cheer(amount = 1) { excitement = Math.max(excitement, amount); },
    rippleNet() { ripple = 1; },
    update(time, dt) {
      excitement = Math.max(0, excitement - dt * 0.35);
      const amp = 0.07 + excitement * 0.55;
      const { mesh, seats, dummy } = crowd;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        dummy.position.set(s.x, s.y + Math.abs(Math.sin(time * s.speed * (1 + excitement) + s.phase)) * amp, s.z);
        dummy.scale.set(1, 1.2, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;

      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 110) c.position.x = -110;
      }

      ripple = Math.max(0, ripple - dt * 1.6);
      goal.back.position.z = -GOAL.depth - ripple * 0.4 * Math.abs(Math.sin(time * 22));
    },
  };
}
