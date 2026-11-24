// 背景音樂：用程式即時產生，不需要音檔、沒有版權問題
// 只在老師端（投影電腦）播放
const _ = null;
const MUSIC_TRACKS = {
  // 大廳：輕快可愛（C 大調，C - Am - F - G）
  lobby: {
    bpm: 112,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    melody: [
      72, _, 76, _, 79, _, 76, _, 77, _, 76, _, 74, _, 72, _,
      69, _, 72, _, 76, _, 72, _, 74, _, 72, _, 71, _, 69, _,
      69, _, 72, _, 77, _, 81, _, 79, _, 77, _, 76, _, 74, _,
      74, _, 79, _, 77, _, 76, _, 74, _, _, _, 71, _, 74, _,
      79, _, 79, _, 81, _, 79, _, 76, _, 72, _, 74, _, 76, _,
      76, _, 76, _, 77, _, 76, _, 72, _, 69, _, 71, _, 72, _,
      77, _, 76, _, 74, _, 72, _, 74, _, 76, _, 77, _, 79, _,
      79, _, _, _, 74, _, _, _, 71, _, 74, _, 79, _, _, _,
    ],
    kick: [0, 8], hat: 2, stab: [4, 12], bassPattern: [0, 6, 8, 14],
    melodyVol: 0.11,
  },
  // 作答：節奏緊湊、有點緊張（A 小調，Am - Am - F - G）
  question: {
    bpm: 138,
    chords: ['Am', 'Am', 'F', 'G'],
    melody: [
      81, _, 76, _, 72, _, 76, _, 81, _, 76, _, 72, _, 76, _,
      84, _, 79, _, 76, _, 79, _, 84, _, 79, _, 76, _, 79, _,
      81, _, 77, _, 72, _, 77, _, 81, _, 77, _, 72, _, 77, _,
      83, _, 79, _, 74, _, 79, _, 83, _, 79, _, 86, _, 83, _,
    ],
    kick: [0, 4, 8, 12], hat: 1, stab: [], bassPattern: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyVol: 0.07,
  },
};
const CHORD_NOTES = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62] };
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const Music = {
  track: null, step: 0, nextTime: 0, timer: null, rate: 1, out: null, noiseBuf: null,

  play(name) {
    if (this.track === name) return;
    this.stop();
    const c = Sfx._ctx();
    if (!c) return;
    this.track = name;
    this.rate = 1;
    this.step = 0;
    this.out = c.createGain();
    this.out.gain.value = Sfx.on ? 0.55 : 0;
    this.out.connect(c.destination);
    this.nextTime = c.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
  },

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    const out = this.out, c = Sfx.ctx;
    this.out = null;
    if (out && c) {
      out.gain.setTargetAtTime(0, c.currentTime, 0.08);
      setTimeout(() => out.disconnect(), 600);
    }
  },

  setRate(r) { this.rate = r; },
  setMuted(muted) { if (this.out && Sfx.ctx) this.out.gain.setTargetAtTime(muted ? 0 : 0.55, Sfx.ctx.currentTime, 0.05); },

  tick() {
    const c = Sfx.ctx, t = MUSIC_TRACKS[this.track];
    if (!c || !t || !this.out) return;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05; // 分頁休眠後追上
    const stepDur = 60 / t.bpm / 4 / this.rate;
    while (this.nextTime < c.currentTime + 0.15) {
      this.schedule(t, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % t.melody.length;
    }
  },

  schedule(t, step, time, stepDur) {
    const s16 = step % 16;
    const chord = CHORD_NOTES[t.chords[Math.floor(step / 16) % t.chords.length]];
    const m = t.melody[step];
    if (m != null) {
      this.note(m, time, stepDur * 1.8, 'triangle', t.melodyVol);
      this.note(m + 12, time, stepDur * 0.9, 'square', t.melodyVol * 0.18);
    }
    if (t.bassPattern.includes(s16)) this.note(chord[0] - 12, time, stepDur * 1.6, 'triangle', 0.13);
    if (t.stab.includes(s16)) chord.forEach((n) => this.note(n, time, stepDur * 1.2, 'sine', 0.035));
    if (t.kick.includes(s16)) this.kick(time);
    if (s16 % t.hat === 0) this.hat(time, s16 % 4 === 2 ? 0.05 : 0.025);
  },

  note(midi, time, dur, type, vol) {
    const c = Sfx.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.value = midiHz(midi);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    o.connect(g).connect(this.out);
    o.start(time);
    o.stop(time + dur + 0.05);
  },

  kick(time) {
    const c = Sfx.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(0.3, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    o.connect(g).connect(this.out);
    o.start(time);
    o.stop(time + 0.2);
  },

  hat(time, vol) {
    const c = Sfx.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(f).connect(g).connect(this.out);
    src.start(time);
  },
};
