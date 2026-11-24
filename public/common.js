// 共用小工具
const OPT_ANIMALS = ['🐰', '🐻', '🐥', '🐸'];
const OPT_LETTERS = ['A', 'B', 'C', 'D'];
const TF_ICONS = ['⭕', '❌'];
const ANIMALS = ['🐰', '🐻', '🐱', '🐶', '🐼', '🐸', '🦊', '🐨', '🐯', '🐷', '🐧', '🐹', '🐮', '🐵', '🦁', '🐤'];

function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

function optClass(type, i) { return type === 'tf' ? 'tf' + i : 'opt' + i; }
function optIcon(type, i) { return type === 'tf' ? TF_ICONS[i] : OPT_ANIMALS[i]; }
function optLabel(type, text, i) { return type === 'tf' ? text : text; }

function startFloaties(container, count = 14) {
  const pool = ['🐰', '🐻', '🐥', '🐸', '🐱', '🐼', '🦊', '🐨', '🐾', '⭐', '🌸'];
  for (let i = 0; i < count; i++) {
    const s = el('span', null, pool[i % pool.length]);
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDuration = 14 + Math.random() * 14 + 's';
    s.style.animationDelay = -Math.random() * 25 + 's';
    s.style.fontSize = 30 + Math.random() * 30 + 'px';
    container.append(s);
  }
}

function confetti(count = 60, pool = ['🎉', '⭐', '🐾', '🌸', '💖', '✨', '🎈']) {
  let box = document.querySelector('.confetti');
  if (!box) { box = el('div', { class: 'confetti' }); document.body.append(box); }
  for (let i = 0; i < count; i++) {
    const s = el('span', null, pool[Math.floor(Math.random() * pool.length)]);
    s.style.left = Math.random() * 100 + 'vw';
    const d = 2.5 + Math.random() * 2.5;
    s.style.animationDuration = d + 's';
    s.style.animationDelay = Math.random() * 1.5 + 's';
    box.append(s);
    setTimeout(() => s.remove(), (d + 1.6) * 1000);
  }
}

function countUp(node, from, to, ms = 900) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 簡單音效（不需要音檔）
const Sfx = {
  on: true,
  ctx: null,
  _ctx() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, start, dur, type = 'sine', vol = 0.18) {
    const c = this._ctx(); if (!c || !this.on) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    const t = c.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },
  pop() { this.tone(660, 0, 0.12, 'triangle'); this.tone(990, 0.06, 0.12, 'triangle'); },
  tick() { this.tone(880, 0, 0.08, 'square', 0.06); },
  ding() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.35, 'triangle')); },
  wrong() { this.tone(300, 0, 0.25, 'sawtooth', 0.08); this.tone(220, 0.18, 0.35, 'sawtooth', 0.08); },
  intro() { [392, 523, 659].forEach((f, i) => this.tone(f, i * 0.15, 0.3, 'triangle')); },
  fanfare() { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.14, 0.3, 'triangle', 0.2)); },
  drum() { for (let i = 0; i < 10; i++) this.tone(120 + i * 8, i * 0.08, 0.07, 'square', 0.07); },
};

function store(kind, key, val) {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage;
    if (val === undefined) return s.getItem(key);
    if (val === null) s.removeItem(key); else s.setItem(key, val);
  } catch { return null; }
}
