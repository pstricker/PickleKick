// PickleKick: boots the game, runs the frame loop, and moves between game states.
//
//   TITLE -> AIM -> SPIN -> POWER -> WINDUP -> FLIGHT -> RESULT -> (AIM | LEVEL_END)
import * as THREE from 'three';
import {
  GOAL, BALL_R, FIXED_DT, SWEET, makeBall, stepBall, tracePath, solveKick, spinFromTap,
  applyPowerError, powerToSpeed, collideGoalFrame, collideCapsule, crossingResult,
  containNet, curveAmount,
} from './physics.js';
import { getLevel, kickSpot, scoreKick, starsFor, KICKS_PER_LEVEL, GOALS_TO_PASS } from './levels.js';
import { createStadium } from './scene.js';
import { Pickle } from './pickle.js';
import { Wall } from './wall.js';
import { BallView, Boot } from './ball.js';
import { AimControl, SpinControl, PowerControl, clampAim } from './controls.js';
import { Preview, TargetMarker, Shake, confetti } from './effects.js';
import { sfx, unlockAudio, isMuted, setMuted } from './audio.js';
import * as hud from './hud.js';

const S = {
  TITLE: 'title', AIM: 'aim', SPIN: 'spin', POWER: 'power',
  WINDUP: 'windup', FLIGHT: 'flight', RESULT: 'result', LEVEL_END: 'levelEnd',
};

const PREVIEW_POWER = 0.72;  // the preview line assumes a "perfect" kick until you set power
const WINDUP_TIME = 0.16;    // seconds for the boot to swing into the ball
const RESULT_TIME = 2.4;     // seconds to enjoy the result before the next kick
const CAM_BACK = 4.6, CAM_HEIGHT = 1.65;
const BEST_KEY = 'picklekick.best';

const pick = (list) => list[(Math.random() * list.length) | 0];
const rad = (deg) => (deg * Math.PI) / 180;
const pickPun = (kind) => pick(PUNS[kind]);

const PUNS = {
  ready: ['Bring it on!', "I'm kind of a big dill!", "You can't beat me!", 'Ready to get pickled?', "I relish a challenge!"],
  save: ['Dill with it!', 'Too easy-peasy!', "You're in a pickle now!", 'Nope nope nope!', 'Pickle power!'],
  miss: ['Ha! Not even close!', 'Were you aiming at the moon?', 'I did not even need to move!', 'Thanks for the day off!'],
  blocked: ['My gherkins got it!', 'Great wall, little guys!', 'Try going around!'],
  goal: ['Nooo! I got pickled!', 'This is a big dill!', 'Lucky shot!', 'I was not ready!', "I'm so sour right now!", 'Oh, brine!'],
};
const BANNERS = {
  goal: ['GOOOAL!', 'WHAT A KICK!', 'PICKLED!', 'BOOM! GOAL!', 'SUPER SHOT!'],
  save: ['SAVED!', 'PICKLE SAVE!', 'DENIED!'],
  wide: ['WIDE!', 'JUST MISSED!'],
  over: ['TOO HIGH!', 'OVER THE BAR!'],
  post: ['OFF THE POST!', 'DOINK!'],
  short: ['TOO SOFT!', 'KICK IT HARDER!'],
  blocked: ['BLOCKED!', 'HIT THE WALL!'],
};

// ---------------------------------------------------------------- setup

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);

const stadium = createStadium(scene, renderer);
const pickle = new Pickle(scene);
const wall = new Wall(scene);
const ballView = new BallView(scene);
const boot = new Boot(scene);
const preview = new Preview(scene);
const marker = new TargetMarker(scene);
const shake = new Shake();

function loadBest() {
  try { return { score: 0, level: 1, ...JSON.parse(localStorage.getItem(BEST_KEY) || '{}') }; }
  catch { return { score: 0, level: 1 }; }
}
function saveBest() {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(G.best)); } catch { /* storage blocked: fine */ }
}

/** All the changing game state lives here. */
const G = {
  state: S.TITLE,
  time: 0,
  levelNum: 1,
  level: getLevel(1),
  results: [],           // true/false for each kick this level
  score: 0,
  levelStartScore: 0,
  streak: 0,
  spot: { x: 0, z: 15 }, // where the free kick is taken from
  target: { x: 0, y: 1.2 },
  tap: { sx: 0, sy: 0 }, // where on the ball it will be kicked
  power: PREVIEW_POWER,
  ball: makeBall({ x: 0, y: BALL_R, z: 15 }),
  flight: null,
  stateT: 0,
  best: loadBest(),
};

// Camera rig: where the camera wants to be and what it wants to look at.
const cam = {
  pos: new THREE.Vector3(0, 2, 12), look: new THREE.Vector3(0, 1.2, 0), fov: 45,
  basePos: new THREE.Vector3(), baseLook: new THREE.Vector3(), baseFov: 40,
  curLook: new THREE.Vector3(0, 1.2, 0),
};
const tmpV = new THREE.Vector3();

// ---------------------------------------------------------------- camera

/** Direction (on the ground) from the kick spot toward the middle of the goal. */
function kickDir() {
  const d = Math.hypot(G.spot.x, G.spot.z) || 1;
  return { x: -G.spot.x / d, z: -G.spot.z / d, dist: d };
}

/**
 * Stand the camera behind the ball. The field of view is chosen so the ball is
 * at the bottom of the screen and the whole goal fits, on wide and tall screens.
 */
function frameKickCamera() {
  const dir = kickDir();
  cam.basePos.set(G.spot.x - dir.x * CAM_BACK, CAM_HEIGHT, G.spot.z - dir.z * CAM_BACK);
  const dist = dir.dist + CAM_BACK;
  const bottom = -(Math.atan((CAM_HEIGHT - BALL_R) / CAM_BACK) + rad(4));
  const top = Math.atan((GOAL.height + 1.5 - CAM_HEIGHT) / dist) + rad(1);
  const halfH = Math.atan((GOAL.halfW + 1.6) / dist);
  const fov = Math.max(rad(30), top - bottom, 2 * Math.atan(Math.tan(halfH) / camera.aspect));
  const pitch = bottom + fov / 2;
  cam.baseFov = THREE.MathUtils.radToDeg(fov);
  cam.baseLook.set(
    cam.basePos.x + dir.x * Math.cos(pitch) * dist,
    cam.basePos.y + Math.sin(pitch) * dist,
    cam.basePos.z + dir.z * Math.cos(pitch) * dist
  );
}

function updateCamera(dt) {
  if (G.state === S.TITLE) {
    const a = G.time * 0.25;
    cam.pos.set(Math.sin(a) * 5, 1.9, 8.5 + Math.cos(a) * 1.5);
    cam.look.set(0, 1.25, 0);
    cam.fov = camera.aspect < 1 ? 62 : 42;
  } else {
    cam.pos.copy(cam.basePos);
    cam.look.copy(cam.baseLook);
    cam.fov = cam.baseFov;
    if (G.state === S.FLIGHT || G.state === S.RESULT) {
      // lean in and follow the ball a little
      tmpV.set(G.ball.p.x, G.ball.p.y, G.ball.p.z);
      cam.look.lerp(tmpV, 0.3);
      const dir = kickDir();
      cam.pos.x += dir.x * 1.8; cam.pos.z += dir.z * 1.8;
    }
  }
  const k = 1 - Math.exp(-dt * 6);
  camera.position.lerp(cam.pos, k);
  cam.curLook.lerp(cam.look, k);
  if (Math.abs(camera.fov - cam.fov) > 0.01) {
    camera.fov += (cam.fov - camera.fov) * k;
    camera.updateProjectionMatrix();
  }
  shake.apply(camera, dt);
  camera.lookAt(cam.curLook);
}

function snapCamera() {
  updateCamera(0);
  camera.position.copy(cam.pos);
  cam.curLook.copy(cam.look);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.curLook);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (G.state !== S.TITLE) frameKickCamera();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- kick steps

const ballStart = () => ({ x: G.spot.x, y: BALL_R, z: G.spot.z });

/** Redraw the rainbow line for the current aim, spin and (given) power. */
function updatePreview(power = PREVIEW_POWER) {
  const from = ballStart();
  const speed = powerToSpeed(power);
  const spin = spinFromTap(G.tap.sx, G.tap.sy, from, G.target, speed);
  const { v } = solveKick(from, G.target, speed, spin);
  preview.setPath(tracePath(makeBall(from, v, spin), { every: 2 }).points);
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

function startLevel(n) {
  G.levelNum = n;
  G.level = getLevel(n);
  G.results = [];
  G.levelStartScore = G.score;
  G.streak = 0;
  pickle.setLevel(G.level);
  hud.showScreen(null);
  hud.showPlayHud(true);
  hud.setLevel(n);
  hud.setScore(G.score);
  setupKick(true);
}

function setupKick(first = false) {
  G.spot = kickSpot(G.level);
  G.ball = makeBall(ballStart());
  G.target = { x: 0, y: 1.3 };
  G.tap = { sx: 0, sy: 0 };
  G.flight = null;
  pickle.reset();
  wall.setup(G.spot, G.level);
  boot.hide();
  frameKickCamera();
  if (first) snapCamera();
  hud.clearBanner();
  hud.setKickDots(G.results);
  hud.setSpinDot(0, 0);
  enterAim();
  sfx.whistle();
  hud.speech(pickPun('ready'), 1800);
}

function enterAim() {
  G.state = S.AIM; G.stateT = 0;
  marker.set(G.target.x, G.target.y);
  marker.show(true);
  updatePreview();
  hud.setStep('aim', isTouch() ? 'Drag the target, then let go!' : 'Move the target, then click!');
  spinControl.disable(); powerControl.disable();
  aimControl.enable();
}

function enterSpin() {
  G.state = S.SPIN; G.stateT = 0;
  aimControl.disable();
  sfx.lock();
  hud.setStep('spin', 'Tap the ball where you want to kick it!');
  spinControl.enable();
}

function enterPower() {
  G.state = S.POWER; G.stateT = 0;
  spinControl.disable();
  sfx.lock();
  hud.setStep('power', 'Tap to stop the meter in the green!');
  powerControl.enable(G.level.meterSpeed);
}

function enterWindup(power) {
  G.power = power;
  G.state = S.WINDUP; G.stateT = 0;
  hud.setStep(null);
  hud.hideSpeech();
  marker.show(false);
  preview.hide();
}

/** The boot meets the ball: work out the shot and let it fly. */
function launch() {
  const from = ballStart();
  const speed = powerToSpeed(G.power);
  const tgt = applyPowerError(G.target, G.power);
  const spin = spinFromTap(G.tap.sx, G.tap.sy, from, tgt, speed);
  const { v } = solveKick(from, tgt, speed, spin);
  G.ball = makeBall(from, v, spin);

  const real = tracePath(G.ball);
  const naive = tracePath(makeBall(from, v)); // the same kick with no spin
  const realCross = real.cross || { x: pickle.cx, y: 1, t: 1.5 };
  pickle.onKick({ real: realCross, naive: naive.cross || realCross });
  wall.onKick();

  G.flight = {
    t: 0, acc: 0, resolved: false, crossed: false,
    keeperT: -1, wallT: -1, postT: -1,
    curve: curveAmount(real.points),
    soft: G.power < 0.3,
  };
  G.state = S.FLIGHT; G.stateT = 0;
  sfx.kick();
}

/** Run the ball, goalie and wall forward in small fixed steps. */
function stepFlight(dt) {
  const f = G.flight, b = G.ball;
  f.acc += dt;
  while (f.acc >= FIXED_DT) {
    f.acc -= FIXED_DT;
    f.t += FIXED_DT;
    const prev = { x: b.p.x, y: b.p.y, z: b.p.z };
    stepBall(b, FIXED_DT);
    pickle.step(FIXED_DT);
    wall.step(FIXED_DT);

    if (b.inNet) { containNet(b, FIXED_DT); continue; }
    if (f.crossed) { // missed: bounce off the advertising boards instead of flying forever
      if (b.p.z < -11.2) { b.p.z = -11.2; b.v.z = Math.abs(b.v.z) * 0.3; b.v.x *= 0.5; }
      continue;
    }

    if (collideGoalFrame(b)) {
      if (f.postT < 0) { sfx.post(); shake.kick(0.2); }
      f.postT = f.t;
    }
    const k = pickle.capsule();
    if (collideCapsule(b, k.a, k.b, k.r, 0.35)) {
      if (f.keeperT < 0) sfx.save();
      f.keeperT = f.t;
    }
    for (const c of wall.capsules()) {
      if (collideCapsule(b, c.a, c.b, c.r, 0.3)) {
        if (f.wallT < 0) sfx.thud();
        f.wallT = f.t;
      }
    }

    const cross = crossingResult(prev, b.p);
    if (cross) {
      f.crossed = true;
      if (cross.type === 'goal') { b.inNet = true; resolve('goal', cross); }
      else if (!f.resolved) resolve(f.postT >= 0 ? 'post' : cross.type);
    }
  }

  if (f.resolved) return;
  // No crossing yet: has the kick fizzled out some other way?
  const speed = Math.hypot(b.v.x, b.v.y, b.v.z);
  if (f.keeperT >= 0 && f.t - f.keeperT > 0.7) resolve('save');
  else if (f.wallT >= 0 && f.t - f.wallT > 0.7) resolve('blocked');
  else if (f.postT >= 0 && f.t - f.postT > 0.9) resolve('post');
  else if (f.t > 5 || (f.t > 0.5 && speed < 0.8) || b.p.z > G.spot.z + 3) resolve(f.soft ? 'short' : 'wide');
}

/** The kick is decided. Hand out points, noise and pickle drama. */
function resolve(outcome, cross) {
  const f = G.flight;
  if (f.resolved) return;
  f.resolved = true;
  f.outcome = outcome;
  const goal = outcome === 'goal';
  G.results.push(goal);
  hud.setKickDots(G.results);

  if (goal) {
    G.streak++;
    const lucky = f.keeperT >= 0 || f.postT >= 0 || f.wallT >= 0;
    const { points, tags } = scoreKick({ x: cross.x, y: cross.y, curve: f.curve, streak: G.streak, lucky });
    G.score += points;
    hud.setScore(G.score, true);
    hud.banner(pick(BANNERS.goal), 'good');
    hud.tags([`+${points}`, ...tags.filter((t) => !t.endsWith(`+${points}`))]);
    confetti(hud.el.confetti);
    stadium.cheer(1);
    stadium.rippleNet();
    sfx.goal();
  } else {
    G.streak = 0;
    hud.banner(pick(BANNERS[outcome]), outcome === 'save' || outcome === 'blocked' ? 'bad' : 'meh');
    stadium.cheer(0.25);
    if (outcome !== 'save') sfx.miss();
  }
  pickle.react(outcome);
  const punKind = goal ? 'goal' : outcome === 'save' ? 'save' : outcome === 'blocked' ? 'blocked' : 'miss';
  hud.speech(pickPun(punKind), 2200);
  G.state = S.RESULT; G.stateT = 0;
}

function endLevel() {
  G.state = S.LEVEL_END; G.stateT = 0;
  const goals = G.results.filter(Boolean).length;
  const passed = goals >= GOALS_TO_PASS;
  const stars = starsFor(goals);
  let newBest = false;
  if (passed) {
    if (G.score > G.best.score) { G.best.score = G.score; newBest = true; }
    G.best.level = Math.max(G.best.level, G.levelNum + 1);
    saveBest();
    sfx.levelUp();
    confetti(hud.el.confetti, 60);
  } else {
    sfx.fail();
  }
  G.levelPassed = passed;
  hud.showPlayHud(false);
  hud.hideSpeech();
  hud.clearBanner();
  wall.hide();
  hud.levelResult({
    level: G.levelNum, goals, stars, passed, score: G.score, best: G.best, newBest,
    onStar: (i) => sfx.star(i),
  });
}

function goHome() {
  G.state = S.TITLE; G.stateT = 0;
  G.score = 0;
  aimControl.disable(); spinControl.disable(); powerControl.disable();
  marker.show(false); preview.hide(); boot.hide(); wall.hide();
  pickle.reset();
  G.ball = makeBall({ x: 0.9, y: BALL_R, z: 2.2 });
  hud.showPlayHud(false);
  hud.hideSpeech();
  hud.clearBanner();
  hud.setBestLine(G.best);
  hud.showScreen('title');
}

// ---------------------------------------------------------------- input

const aimControl = new AimControl(canvas, camera, {
  onMove: (t) => { G.target = t; marker.set(t.x, t.y); updatePreview(); },
  onLock: () => enterSpin(),
});
const spinControl = new SpinControl(hud.el.spinPad, {
  onChange: (sx, sy) => { G.tap = { sx, sy }; hud.setSpinDot(sx, sy); updatePreview(); },
  onLock: () => enterPower(),
});
const powerControl = new PowerControl({ onLock: (value) => enterWindup(value) });

const button = (node, fn) => node.addEventListener('click', () => { unlockAudio(); sfx.click(); fn(); });
button(hud.el.playBtn, () => { G.score = 0; startLevel(1); });
button(hud.el.howBtn, () => hud.showScreen('how'));
button(hud.el.howPlayBtn, () => { G.score = 0; startLevel(1); });
button(hud.el.homeBtn, goHome);
button(hud.el.nextBtn, () => {
  if (G.levelPassed) startLevel(G.levelNum + 1);
  else { G.score = G.levelStartScore; startLevel(G.levelNum); }
});
hud.el.mute.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  hud.setMuteIcon(isMuted());
  sfx.click();
});

// Keyboard: arrows nudge the target or the kick spot; Space or Enter confirms.
window.addEventListener('keydown', (e) => {
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const confirm = e.code === 'Space' || e.code === 'Enter';
  if (!confirm && !arrows[e.code]) return;
  if (confirm && document.activeElement?.tagName === 'BUTTON') return; // let buttons work normally
  if (G.state === S.AIM) {
    if (confirm) enterSpin();
    else {
      const [dx, dy] = arrows[e.code];
      G.target = clampAim({ x: G.target.x + dx * 0.25, y: G.target.y + dy * 0.2 });
      marker.set(G.target.x, G.target.y);
      updatePreview();
    }
  } else if (G.state === S.SPIN) {
    if (confirm) enterPower();
    else {
      const [dx, dy] = arrows[e.code];
      let sx = G.tap.sx + dx * 0.2, sy = G.tap.sy + dy * 0.2;
      const len = Math.hypot(sx, sy);
      if (len > 1) { sx /= len; sy /= len; }
      G.tap = { sx, sy };
      hud.setSpinDot(sx, sy);
      updatePreview();
    }
  } else if (G.state === S.POWER && confirm) {
    powerControl.lock();
  } else return;
  e.preventDefault();
});

// ---------------------------------------------------------------- frame loop

const headPos = new THREE.Vector3();

function update(dt) {
  G.time += dt;
  G.stateT += dt;
  stadium.update(G.time, dt);

  switch (G.state) {
    case S.POWER:
      powerControl.update(dt);
      hud.setPowerMarker(powerControl.value);
      if (powerControl.active) updatePreview(powerControl.value);
      pickle.step(dt);
      break;
    case S.WINDUP:
      pickle.step(dt);
      if (G.stateT >= WINDUP_TIME) launch();
      break;
    case S.FLIGHT:
      stepFlight(dt);
      break;
    case S.RESULT:
      stepFlight(dt);
      if (G.stateT >= RESULT_TIME) {
        if (G.results.length >= KICKS_PER_LEVEL) endLevel();
        else setupKick();
      }
      break;
    default:
      pickle.step(dt);
  }

  // The boot swings through the ball during the wind-up and just after.
  if (G.state === S.WINDUP) boot.pose(G.stateT / WINDUP_TIME, ballStart(), kickDir());
  else if (G.state === S.FLIGHT && G.stateT < 0.25) boot.pose(1 + G.stateT / 0.25, ballStart(), kickDir());
  else boot.hide();

  wall.sync(G.time);
  pickle.sync(G.time, G.ball.p);
  ballView.sync(G.ball, dt);
  preview.update(dt);
  marker.update(G.time, G.state !== S.AIM);
  updateCamera(dt);

  // Pin the speech bubble above the pickle's head.
  pickle.headWorld(headPos).project(camera);
  hud.placeSpeech((headPos.x * 0.5 + 0.5) * window.innerWidth, (-headPos.y * 0.5 + 0.5) * window.innerHeight);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
hud.setMuteIcon(isMuted());
goHome();
snapCamera();
requestAnimationFrame(frame);

// A small handle for poking at the game from the browser console.
window.__pk = { G, S, pickle, SWEET, update, render: () => renderer.render(scene, camera) };
