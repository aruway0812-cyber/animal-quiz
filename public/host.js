const socket = io();
const app = document.getElementById('app');
startFloaties(document.getElementById('floaties'));

let S = null;          // 目前狀態
let renderedKey = '';  // 目前畫面
let endsAt = 0;        // 本題倒數結束時間（本機時間）
let lastSec = null;
const seenPlayers = new Set();

// ---------- 連線 ----------
function connectHost() {
  const pin = store('session', 'hostPin');
  const token = store('session', 'hostToken');
  if (pin && token) {
    socket.emit('host:resume', { pin, hostToken: token }, (r) => { if (!r?.ok) createGame(); });
  } else createGame();
}
function createGame() {
  socket.emit('host:create', {}, (r) => {
    store('session', 'hostPin', r.pin);
    store('session', 'hostToken', r.hostToken);
  });
}
socket.on('connect', connectHost);
socket.on('state', (s) => { S = s; render(); });

// ---------- 上方按鈕 ----------
const sndBtn = document.getElementById('sndBtn');
sndBtn.onclick = () => { Sfx.on = !Sfx.on; sndBtn.textContent = Sfx.on ? '🔊' : '🔇'; Music.setMuted(!Sfx.on); if (Sfx.on) Sfx.pop(); };
document.getElementById('fsBtn').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
};
document.getElementById('restartBtn').onclick = () => {
  if (confirm('要重新開始嗎？所有分數會歸零，學生不用重新加入。')) socket.emit('host:restart');
};
document.addEventListener('pointerdown', () => Sfx._ctx());

// 瀏覽器規定要先點一下畫面才能播放聲音：還沒點之前顯示提示
const musicHint = el('button', { class: 'music-hint hidden', onclick: () => Sfx._ctx() }, '🎵 點一下畫面，開啟音樂和音效');
document.body.append(musicHint);
setInterval(() => musicHint.classList.toggle('hidden', !Sfx.ctx || Sfx.ctx.state === 'running' || !Sfx.on), 500);

// 每個畫面要播的背景音樂
function musicFor(phase) {
  if (phase === 'lobby') Music.play('lobby');
  else if (phase === 'question') Music.play('question');
  else if (phase !== 'podium') Music.stop();
}

// ---------- 畫面 ----------
function render() {
  document.getElementById('tbPin').textContent = S.phase === 'lobby' ? '' : 'PIN ' + S.pin;
  document.getElementById('tbProg').textContent = S.qIndex >= 0 && S.phase !== 'podium' ? `第 ${S.qIndex + 1} / ${S.total} 題` : '';
  const key = S.phase + ':' + S.qIndex;
  if (key !== renderedKey) {
    renderedKey = key;
    app.replaceChildren();
    ({ lobby: renderLobby, intro: renderIntro, question: renderQuestion, reveal: renderReveal, leaderboard: renderLeaderboard, podium: renderPodium })[S.phase]();
    musicFor(S.phase);
  } else update();
}

function update() {
  if (S.phase === 'lobby') updateLobby();
  if (S.phase === 'question') {
    endsAt = Date.now() + S.remainingMs;
    const a = document.getElementById('answeredN');
    if (a && a.textContent !== String(S.answered)) { a.textContent = S.answered; a.parentElement.classList.remove('pop'); void a.offsetWidth; a.parentElement.classList.add('pop'); }
    const t = document.getElementById('answeredT'); if (t) t.textContent = `/ ${S.players.filter((p) => p.connected).length} 人已作答`;
  }
}

// 大廳
function renderLobby() {
  seenPlayers.clear();
  const url = location.origin;
  const joinUrl = `${url}/?pin=${S.pin}`;
  app.append(
    el('div', { class: 'lobby' },
      el('div', { class: 'join-card card slideUp' },
        el('h1', null, el('span', { class: 'wiggle' }, '🐾'), ' ', S.title),
        el('div', { class: 'join-url' }, '用手機掃描 QR Code，或打開 ', el('b', null, url.replace(/^https?:\/\//, ''))),
        el('img', { class: 'qr', src: '/qr?u=' + encodeURIComponent(joinUrl), alt: '加入 QR Code' }),
        el('div', { class: 'pin-label' }, '房間 PIN 碼'),
        el('div', { class: 'pin-big' }, S.pin.replace(/(\d{3})(\d{3})/, '$1 $2')),
      ),
      el('div', { class: 'players-area' },
        el('div', { class: 'players-head' }, '已加入的小動物', el('span', { class: 'count-badge', id: 'pcount' }, '0'),
          el('button', { class: 'btn pink', id: 'startBtn', style: 'margin-left:auto', onclick: () => { Sfx.intro(); socket.emit('host:start'); } }, '開始遊戲 ▶')),
        el('div', { class: 'players', id: 'players' }),
      ),
    ),
  );
  updateLobby();
}
function updateLobby() {
  const box = document.getElementById('players');
  if (!box) return;
  document.getElementById('pcount').textContent = S.players.length;
  document.getElementById('startBtn').disabled = S.players.length === 0;
  box.classList.toggle('many', S.players.length > 24);
  box.classList.toggle('lots', S.players.length > 48);
  const ids = new Set(S.players.map((p) => p.id));
  for (const n of [...box.children]) if (n.dataset.id && !ids.has(n.dataset.id)) { n.remove(); seenPlayers.delete(n.dataset.id); }
  box.querySelector('.waiting-hint')?.remove();
  for (const p of S.players) {
    let n = box.querySelector(`[data-id="${p.id}"]`);
    if (!n) {
      n = el('div', { class: 'pbubble pop', 'data-id': p.id, title: '點一下可以移除', onclick: () => { if (confirm(`要移除「${p.name}」嗎？`)) socket.emit('host:kick', { id: p.id }); } },
        el('span', { class: 'ani' }, p.animal), el('span', null, p.name));
      box.append(n);
      if (!seenPlayers.has(p.id)) Sfx.pop();
      seenPlayers.add(p.id);
    }
    n.classList.toggle('off', !p.connected);
  }
  if (S.players.length === 0) box.append(el('div', { class: 'waiting-hint' }, el('div', { class: 'bounce' }, '🐣'), el('div', null, '等待同學加入中…')));
}

// 第 N 題開場
function renderIntro() {
  Sfx.intro();
  const q = S.question;
  app.append(el('div', { class: 'center' },
    el('div', { class: 'intro-sec slideUp' }, q.section || (q.type === 'tf' ? '是非題' : '單選題')),
    el('h1', { class: 'intro-num pop' }, `第 ${S.qIndex + 1} 題`),
    el('div', { class: 'intro-mascot bounce' }, ANIMALS[S.qIndex % ANIMALS.length]),
    el('div', { class: 'subtle' }, `${q.type === 'tf' ? '是非題' : '單選題'}・限時 ${q.time} 秒`),
    el('div', { class: 'loadbar' }, el('i', { style: `animation-duration:${S.introMs}ms` })),
  ));
}

function optCard(q, i, extra = '') {
  const tf = q.type === 'tf';
  return el('div', { class: `opt ${optClass(q.type, i)} ${tf ? 'tf' : ''} ${extra} slideUp`, style: `animation-delay:${i * 0.08}s` },
    el('span', { class: 'ic' }, optIcon(q.type, i)),
    tf ? null : el('span', { class: 'lt' }, OPT_LETTERS[i]),
    el('span', null, q.options[i]),
    extra === 'yes' ? el('span', { class: 'mark' }, '✔') : null,
  );
}

// 作答中
function renderQuestion() {
  const q = S.question;
  endsAt = Date.now() + S.remainingMs;
  lastSec = null;
  const R = 54, C = 2 * Math.PI * R;
  app.append(el('div', { class: 'qwrap' },
    el('div', { class: 'qtext card slideUp' }, el('span', { class: 'sec' }, q.section || ''), q.text),
    el('div', { class: 'qmid' },
      el('div', { class: 'timer', id: 'timer' },
        (() => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 120 120');
          svg.innerHTML = `<circle class="bg" cx="60" cy="60" r="${R}"/><circle class="fg" id="tfg" cx="60" cy="60" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/>`;
          return svg;
        })(),
        el('div', { class: 'num', id: 'tnum' }, q.time)),
      el('div', { class: 'mascot' }, el('span', { class: 'wiggle' }, ANIMALS[S.qIndex % ANIMALS.length]), el('span', { class: 'think' }, '❓')),
      el('div', { class: 'answered' }, el('b', { id: 'answeredN' }, S.answered), el('span', { id: 'answeredT', class: 'subtle' }, '')),
    ),
    el('div', { class: 'opts' }, q.options.map((_, i) => optCard(q, i))),
    el('div', { class: 'bottom-bar', style: 'padding:0' },
      el('button', { class: 'btn ghost', onclick: () => socket.emit('host:skip') }, '提早結束作答 ⏭')),
  ));
  update();
  const fg = document.getElementById('tfg'), num = document.getElementById('tnum'), box = document.getElementById('timer');
  const loop = () => {
    if (S.phase !== 'question' || !document.body.contains(fg)) return;
    const left = Math.max(0, endsAt - Date.now());
    const sec = Math.ceil(left / 1000);
    num.textContent = sec;
    fg.style.strokeDashoffset = String(C * (1 - left / (q.time * 1000)));
    box.classList.toggle('hurry', sec <= 5);
    Music.setRate(sec <= 5 ? 1.3 : 1);
    if (sec !== lastSec && sec <= 5 && sec > 0) Sfx.tick();
    lastSec = sec;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// 公布答案
function renderReveal() {
  Sfx.ding();
  const q = S.question;
  const max = Math.max(1, ...S.counts);
  const bars = el('div', { class: 'bars' }, q.options.map((_, i) =>
    el('div', { class: `bar ${optClass(q.type, i)} ${i === q.answer ? 'yes' : 'no'}` },
      el('div', { class: 'n' }, S.counts[i], i === q.answer ? ' ✔' : ''),
      el('div', { class: 'track' }, el('div', { class: 'col', 'data-h': (S.counts[i] / max) * 100 })),
      el('div', { class: 'lab' }, optIcon(q.type, i)))));
  app.append(el('div', { class: 'qwrap compact' },
    el('div', { class: 'qtext card' }, el('span', { class: 'sec' }, q.section || ''), q.text),
    bars,
    el('div', { class: 'opts revealed' }, q.options.map((_, i) => optCard(q, i, i === q.answer ? 'yes' : 'no'))),
    el('div', { class: 'reveal-foot' },
      q.explain ? el('div', { class: 'explain card slideUp', style: 'animation-delay:.6s' }, el('span', { class: 'ic bounce' }, '🦉'), el('span', null, q.explain)) : el('div', { style: 'flex:1' }),
      el('button', { class: 'btn pink', onclick: () => socket.emit('host:next') }, '看排行榜 🏆')),
  ));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bars.querySelectorAll('.col').forEach((c) => { c.style.height = c.dataset.h + '%'; });
  }));
}

// 排行榜（前 5 名）
function renderLeaderboard() {
  Sfx.drum();
  const prev = new Map((S.prevTop || []).map((p) => [p.id, p.rank]));
  const last = S.qIndex + 1 >= S.total;
  const lb = el('div', { class: 'lb' });
  S.top.forEach((p, i) => {
    const old = prev.get(p.id);
    let move = '';
    if (S.qIndex > 0) move = old == null ? '🆕' : old > p.rank ? '▲' + (old - p.rank) : old < p.rank ? '▼' + (p.rank - old) : '';
    const sc = el('span', { class: 'sc' }, (p.score - p.gained).toLocaleString());
    lb.append(el('div', { class: `lbrow r${p.rank} slideUp`, style: `animation-delay:${0.2 + i * 0.15}s` },
      el('span', { class: 'rk' }, p.rank),
      el('span', { class: 'ani bounce', style: `animation-delay:${i * 0.2}s` }, p.animal),
      el('span', { class: 'nm' }, p.name),
      el('span', { class: 'move ' + (move.startsWith('▲') ? 'up' : move.startsWith('▼') ? 'down' : '') }, move),
      el('span', { class: 'gain ' + (p.gained ? '' : 'zero') }, p.gained ? '+' + p.gained : '+0'),
      sc));
    setTimeout(() => countUp(sc, p.score - p.gained, p.score), 700 + i * 150);
  });
  if (!S.top.length) lb.append(el('div', { class: 'subtle' }, '還沒有人得分'));
  app.append(el('div', { class: 'center' },
    el('h1', { class: 'big-title pop' }, el('span', { class: 'wiggle' }, '🏆'), ' 排行榜'),
    lb));
  app.append(el('div', { class: 'bottom-bar' },
    el('button', { class: 'btn pink', onclick: () => socket.emit('host:next') }, last ? '最終結果 🎉' : '下一題 ▶')));
}

// 頒獎台
function renderPodium() {
  const top = S.top;
  const slot = (p, place, h) => el('div', { class: `pod p${place}`, id: 'pod' + place },
    p ? el('div', { class: 'who' },
      place === 1 ? el('div', { class: 'crown wiggle' }, '👑') : null,
      el('div', { class: 'ani bounce' }, p.animal),
      el('div', { class: 'nm' }, p.name),
      el('div', { class: 'sc' }, p.score.toLocaleString() + ' 分')) : el('div', { class: 'who' }),
    el('div', { class: 'block', 'data-h': h }, place));
  const first = top.filter((p) => p.rank === 1);
  app.append(el('div', { class: 'center' },
    el('h1', { class: 'big-title pop' }, '🎉 恭喜得獎的小動物們 🎉'),
    el('div', { class: 'podium' }, slot(top[1], 2, 22), slot(top[0], 1, 30), slot(top[2], 3, 15)),
    el('div', { class: 'runners' }, top.slice(3, 5).map((p, i) => el('div', { class: 'lbrow slideUp', style: `animation-delay:${4 + i * 0.2}s` },
      el('span', { class: 'rk' }, p.rank), el('span', { class: 'ani' }, p.animal), el('span', { class: 'nm' }, p.name), el('span', { class: 'sc' }, p.score.toLocaleString())))),
  ));
  app.append(el('div', { class: 'bottom-bar' },
    el('button', { class: 'btn ghost', onclick: () => { if (confirm('再玩一次？分數會歸零。')) socket.emit('host:restart'); } }, '再玩一次 ↺')));
  Sfx.drum();
  const show = (n, delay) => setTimeout(() => {
    const pod = document.getElementById('pod' + n);
    if (!pod) return;
    pod.querySelector('.block').style.height = pod.querySelector('.block').dataset.h + 'vh';
    setTimeout(() => { pod.classList.add('show'); Sfx.pop(); }, 700);
  }, delay);
  show(3, 400); show(2, 1600); show(1, 2900);
  Music.stop();
  setTimeout(() => { Sfx.fanfare(); confetti(90); }, 3700);
  setTimeout(() => { if (S.phase === 'podium') Music.play('lobby'); }, 7000);
  setTimeout(() => confetti(50), 6000);
  if (first.length > 1) setTimeout(() => confetti(30, ['🤝', '✨']), 4200);
}
