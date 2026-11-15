// Everything drawn with HTML on top of the 3D view: score, kick dots, banners,
// the pickle's speech bubble, and the menu screens.
import { KICKS_PER_LEVEL } from './levels.js';

const $ = (id) => document.getElementById(id);

export const el = {
  topbar: $('topbar'), levelNum: $('level-num'), score: $('score'), dots: $('kick-dots'),
  steps: $('steps'), hint: $('hint'),
  spinPanel: $('spin-panel'), spinPad: $('spin-pad'), spinDot: $('spin-dot'),
  powerPanel: $('power-panel'), powerMarker: $('power-marker'),
  banner: $('banner'), tags: $('tags'), speech: $('speech'), confetti: $('confetti'),
  mute: $('mute-btn'),
  screens: { title: $('screen-title'), how: $('screen-how'), level: $('screen-level') },
  playBtn: $('play-btn'), howBtn: $('how-btn'), howPlayBtn: $('how-play-btn'),
  nextBtn: $('next-btn'), homeBtn: $('home-btn'),
  bestLine: $('best-line'),
  levelTitle: $('level-title'), levelText: $('level-text'), levelScore: $('level-score'),
  levelBest: $('level-best'), stars: $('stars'),
};

const show = (node, on) => node.classList.toggle('hidden', !on);

/** Restart a CSS animation on an element by re-adding its class. */
function replay(node, className) {
  node.className = '';
  void node.offsetWidth;
  node.className = className;
}

/** Show one menu screen ('title' | 'how' | 'level'), or none with null. */
export function showScreen(name) {
  for (const [key, node] of Object.entries(el.screens)) show(node, key === name);
}

export function showPlayHud(on) {
  show(el.topbar, on);
  if (!on) { show(el.steps, false); show(el.hint, false); show(el.spinPanel, false); show(el.powerPanel, false); }
}

export function setLevel(n) { el.levelNum.textContent = n; }

export function setScore(n, pop = false) {
  el.score.textContent = n;
  if (pop) replay(el.score, 'pop');
}

/** One dot per kick: results is a list of true (goal) / false (no goal). */
export function setKickDots(results) {
  el.dots.innerHTML = '';
  for (let i = 0; i < KICKS_PER_LEVEL; i++) {
    const d = document.createElement('span');
    if (i < results.length) { d.className = results[i] ? 'goal' : 'miss'; d.textContent = results[i] ? '⚽' : '✖'; }
    else if (i === results.length) d.className = 'now';
    el.dots.appendChild(d);
  }
}

/** Highlight the current step ('aim' | 'spin' | 'power') or hide the strip with null. */
export function setStep(step, hint = '') {
  show(el.steps, !!step);
  show(el.hint, !!step && !!hint);
  el.hint.textContent = hint;
  for (const chip of el.steps.children) {
    chip.classList.toggle('on', chip.dataset.step === step);
    const order = ['aim', 'spin', 'power'];
    chip.classList.toggle('done', order.indexOf(chip.dataset.step) < order.indexOf(step));
  }
  show(el.spinPanel, step === 'spin');
  show(el.powerPanel, step === 'power');
}

export function setSpinDot(sx, sy) {
  el.spinDot.style.left = `${50 + sx * 41}%`;
  el.spinDot.style.top = `${50 - sy * 41}%`;
}

export function setPowerMarker(value) {
  el.powerMarker.style.left = `${value * 100}%`;
}

/** Big splashy word in the middle of the screen. kind: 'good' | 'bad' | 'meh'. */
export function banner(text, kind = 'good') {
  el.banner.textContent = text;
  replay(el.banner, `show ${kind}`);
}

export function clearBanner() { el.banner.className = ''; el.tags.innerHTML = ''; }

/** Little bonus labels under the banner. */
export function tags(list) {
  el.tags.innerHTML = '';
  list.forEach((text, i) => {
    const t = document.createElement('span');
    t.textContent = text;
    t.style.animationDelay = `${0.25 + i * 0.18}s`;
    el.tags.appendChild(t);
  });
}

let speechTimer = 0;
export function speech(text, ms = 2200) {
  el.speech.textContent = text;
  show(el.speech, true);
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => show(el.speech, false), ms);
}
export function hideSpeech() { clearTimeout(speechTimer); show(el.speech, false); }
export function placeSpeech(x, y) {
  el.speech.style.left = `${x}px`;
  el.speech.style.top = `${y}px`;
}

export function setMuteIcon(muted) { el.mute.textContent = muted ? '🔇' : '🔊'; }

export function setBestLine(best) {
  el.bestLine.textContent = best.score > 0 ? `🏆 Best: ${best.score} points · Level ${best.level}` : '';
}

/** The end-of-level screen. Calls onStar(i) as each star pops in. */
export function levelResult({ level, goals, stars, passed, score, best, newBest, onStar }) {
  el.levelTitle.textContent = passed ? `Level ${level} complete!` : 'So close!';
  el.levelText.textContent = passed
    ? `You scored ${goals} out of ${KICKS_PER_LEVEL}. ${['', 'Nice kicking!', 'Awesome!', 'PERFECT! The pickle is speechless!'][stars]}`
    : `You scored ${goals} out of ${KICKS_PER_LEVEL}. You need 3 to beat the pickle!`;
  el.levelScore.textContent = score;
  el.levelBest.textContent = newBest ? '🏆 New best score!' : `🏆 Best: ${best.score}`;
  el.nextBtn.textContent = passed ? 'NEXT LEVEL ▶' : '🔁 TRY AGAIN';
  [...el.stars.children].forEach((s, i) => {
    s.className = '';
    if (i < stars) setTimeout(() => { s.className = 'on'; onStar?.(i); }, 350 + i * 380);
  });
  showScreen('level');
}
