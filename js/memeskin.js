// The goalie's "meme pickle" skin: a photo of a pickle with a face, wrapped
// around the 3D body. The picture is assets/pickle-meme.png; swap that file for
// another pickle-on-a-white-background image to change the goalie's look.
import * as THREE from 'three';

const TEX_W = 256, TEX_H = 512; // each half of the skin texture (front | back)
const PAD = 0.04;               // keep clear of the join between the two halves

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Punch up brightness and contrast so the face still shows from across the pitch.
const punch = (c) => clamp((c - 120) * 1.4 + 136, 0, 255);

/**
 * A capsule whose front shows the left half of the skin texture and whose back
 * shows the right half. The picture is laid on flat from the front (like a
 * projector), so the face looks right from where the kicker stands.
 */
export function memeGeometry(r, len) {
  const geo = new THREE.CapsuleGeometry(r, len, 12, 32).toNonIndexed();
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const height = len + 2 * r;
  for (let i = 0; i < pos.count; i += 3) {
    const front = pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2) >= 0;
    for (let j = i; j < i + 3; j++) {
      const x = pos.getX(j), y = pos.getY(j);
      // how wide the capsule is at this height (narrower on the rounded ends)
      const over = Math.abs(y) - len / 2;
      const rr = over > 0 ? Math.sqrt(Math.max(r * r - over * over, 0.0004)) : r;
      const t = PAD + (1 - 2 * PAD) * clamp(0.5 + x / (2 * rr), 0, 1);
      uv.setXY(j, front ? t * 0.5 : 0.5 + t * 0.5, (y + height / 2) / height);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Cut the pickle out of its white background and straighten it: every row of
 * the pickle is stretched to the full width, so its outline lines up with the
 * outline of the 3D capsule. The back half is filled with face-free pickle skin.
 */
function buildSkin(img) {
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = sw; src.height = sh;
  const sg = src.getContext('2d', { willReadFrequently: true });
  sg.fillStyle = '#fff';
  sg.fillRect(0, 0, sw, sh);
  sg.drawImage(img, 0, 0);
  const px = sg.getImageData(0, 0, sw, sh).data;
  const isPickle = (x, y) => {
    const i = (y * sw + x) * 4;
    return !(px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 215);
  };

  // Left and right edge of the pickle on each row (three solid pixels in a row
  // counts as an edge, so stray specks in the background are ignored).
  const left = new Float32Array(sh).fill(-1), right = new Float32Array(sh).fill(-1);
  let top = -1, bottom = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw - 2; x++) {
      if (isPickle(x, y) && isPickle(x + 1, y) && isPickle(x + 2, y)) { left[y] = x; break; }
    }
    for (let x = sw - 1; x >= 2; x--) {
      if (isPickle(x, y) && isPickle(x - 1, y) && isPickle(x - 2, y)) { right[y] = x; break; }
    }
    if (left[y] >= 0 && right[y] - left[y] >= sw * 0.15) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0 || bottom - top < 8) return null; // no pickle found in the picture
  const trim = Math.round((bottom - top) * 0.015);
  top += trim; bottom -= trim;

  // Smooth the edges a little and step inside the blurry outline.
  const L = new Float32Array(sh), R = new Float32Array(sh);
  for (let y = top; y <= bottom; y++) {
    let l = 0, r = 0, n = 0;
    for (let d = -3; d <= 3; d++) {
      const yy = clamp(y + d, top, bottom);
      if (left[yy] < 0) continue;
      l += left[yy]; r += right[yy]; n++;
    }
    L[y] = l / n + 2; R[y] = r / n - 2;
  }

  const sample = (y, t, out) => { // colour at fraction t across the pickle on row y
    const fx = clamp(L[y] + t * (R[y] - L[y]), 0, sw - 1.001);
    const x0 = Math.floor(fx), k = fx - x0;
    const a = (y * sw + x0) * 4, b = a + 4;
    for (let c = 0; c < 3; c++) out[c] = px[a + c] * (1 - k) + px[b + c] * k;
  };

  const out = document.createElement('canvas');
  out.width = TEX_W * 2; out.height = TEX_H;
  const og = out.getContext('2d');
  const image = og.createImageData(TEX_W * 2, TEX_H);
  const d = image.data;
  const a = [0, 0, 0], b = [0, 0, 0], row = new Float32Array(TEX_W * 3);
  for (let j = 0; j < TEX_H; j++) {
    const fy = top + (j / (TEX_H - 1)) * (bottom - top);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, bottom), ky = fy - y0;
    for (let i = 0; i < TEX_W; i++) {
      const t = i / (TEX_W - 1);
      sample(y0, t, a); sample(y1, t, b);
      for (let c = 0; c < 3; c++) row[i * 3 + c] = a[c] * (1 - ky) + b[c] * ky;
    }
    // Colours for the back: this row's two edges, and its skin away from the face.
    const mean = (from, to, c) => { let s = 0; for (let i = from; i < to; i++) s += row[i * 3 + c]; return s / (to - from); };
    const e = TEX_W >> 4;
    for (let i = 0; i < TEX_W; i++) {
      const t = i / (TEX_W - 1), bulge = Math.sin(Math.PI * t);
      const o = (j * TEX_W * 2 + i) * 4, ob = o + TEX_W * 4;
      for (let c = 0; c < 3; c++) {
        d[o + c] = punch(row[i * 3 + c]);
        const edge = mean(0, e, c) * (1 - t) + mean(TEX_W - e, TEX_W, c) * t;
        const skin = (mean(e * 2, e * 3, c) + mean(TEX_W - e * 3, TEX_W - e * 2, c)) / 2;
        d[ob + c] = punch(edge * (1 - bulge) + skin * bulge);
      }
      d[o + 3] = d[ob + 3] = 255;
    }
  }
  og.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Material for the meme pickle. It is plain olive until the picture has loaded. */
export function memeMaterial() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xa39a3e, shininess: 18, specular: 0x222211 });
  const img = new Image();
  img.onload = () => {
    const tex = buildSkin(img);
    if (!tex) { console.warn('PickleKick: could not find a pickle in assets/pickle-meme.png'); return; }
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  };
  img.onerror = () => console.warn('PickleKick: assets/pickle-meme.png did not load; using a plain pickle');
  img.src = new URL('../assets/pickle-meme.png', import.meta.url).href;
  return mat;
}
