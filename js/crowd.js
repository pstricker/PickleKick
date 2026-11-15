// The stands and the crowd. The fans are flat cut-outs of the pickle pictures in
// assets/crowd/ (fan-1.png, fan-2.png, ...), standing in rows and bouncing.
// Each picture is a 256x512 PNG with a see-through background; add or swap files
// and update FAN_FILES to change who is watching.
import * as THREE from 'three';

const FAN_FILES = ['fan-1.png', 'fan-2.png', 'fan-3.png', 'fan-4.png'];
const FAN_W = 1.25, FAN_H = 2.5;   // metres: these are big pickles, so their faces show from the pitch
const ROWS = 5, RISE = 1.25, DEPTH = 1.5, GAP = 1.3;
// Light tints so a stand full of green pickles doesn't look like one flat colour.
const TINTS = [0xffffff, 0xffffff, 0xffffff, 0xfff0c2, 0xd9f1ff, 0xffdfee, 0xe8ffd2];

export function buildCrowd(scene) {
  const standMat = [new THREE.MeshLambertMaterial({ color: 0x6a4bd6 }), new THREE.MeshLambertMaterial({ color: 0x8466ee })];
  const seats = [];
  const addStep = (w, d, x, z, row) => { // a solid block from the ground up to this row's floor
    const h = (row + 1) * RISE;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standMat[row % 2]);
    m.position.set(x, h / 2, z);
    scene.add(m);
  };
  const addSeat = (x, z, row, turn) => {
    // face the pitch: `turn` is how strongly this stand's fans turn toward the middle
    const yaw = Math.atan2(-x, 16 - z) * turn;
    seats.push({
      x, z, y: (row + 1) * RISE - 0.3, yaw,
      phase: Math.random() * Math.PI * 2,
      speed: 3 + Math.random() * 3,
      size: 0.9 + Math.random() * 0.25,
      flip: Math.random() < 0.5 ? -1 : 1,
    });
  };
  for (let row = 0; row < ROWS; row++) {
    const stagger = (row % 2) * GAP * 0.5;
    // behind the goal
    const z = -13.5 - row * DEPTH;
    addStep(66, DEPTH, 0, z, row);
    for (let x = -30; x <= 30; x += GAP) addSeat(x + stagger, z, row, 0.35);
    // down both sides
    for (const side of [-1, 1]) {
      const x = side * (34 + row * DEPTH);
      addStep(DEPTH, 46, x, 10, row);
      for (let sz = -11; sz <= 31; sz += GAP) addSeat(x, sz + stagger, row, 1);
    }
  }

  // Deal the fans out evenly, then shuffle so the pictures are mixed through the stands.
  const kinds = seats.map((_, i) => i % FAN_FILES.length);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }

  const geo = new THREE.PlaneGeometry(FAN_W, FAN_H);
  geo.translate(0, FAN_H / 2, 0); // stand on the bottom edge
  const loader = new THREE.TextureLoader();
  const color = new THREE.Color();
  const groups = FAN_FILES.map((file, kind) => {
    const mine = seats.filter((_, i) => kinds[i] === kind);
    const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((_, i) => mesh.setColorAt(i, color.setHex(TINTS[(Math.random() * TINTS.length) | 0])));
    mesh.frustumCulled = false;
    mesh.visible = false; // until its picture arrives
    loader.load(
      new URL(`../assets/crowd/${file}`, import.meta.url).href,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        mat.needsUpdate = true;
        mesh.visible = true;
      },
      undefined,
      () => console.warn(`PickleKick: crowd picture ${file} did not load`)
    );
    scene.add(mesh);
    return { mesh, seats: mine };
  });

  const dummy = new THREE.Object3D();
  return {
    /** Bounce the fans. excitement: 0 = calm, 1 = going bananas after a goal. */
    update(time, excitement) {
      const amp = 0.08 + excitement * 0.7;
      for (const { mesh, seats: mine } of groups) {
        if (!mesh.visible) continue;
        for (let i = 0; i < mine.length; i++) {
          const s = mine[i];
          const bounce = Math.abs(Math.sin(time * s.speed * (1 + excitement) + s.phase));
          dummy.position.set(s.x, s.y + bounce * amp, s.z);
          dummy.rotation.set(0, s.yaw, Math.sin(time * s.speed * 0.5 + s.phase) * 0.06 * (1 + excitement * 2));
          dummy.scale.set(s.size * s.flip, s.size, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
