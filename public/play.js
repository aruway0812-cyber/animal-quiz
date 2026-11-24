const socket = io();
const app = document.getElementById('app');
startFloaties(document.getElementById('floaties'), 8);

let S = null;
let joined = null; // { pin, playerId }
let renderedKey = '';
let endsAt = 0;
let pending = null; // 剛按下、還沒被伺服器確認的答案

const params = new URLSearchParams(location.search);
let chosenAnimal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];

// ---------- 連線 / 重連 ----------
function saved() { try { return JSON.parse(store('local', 'animalQuiz') || 'null'); } catch { return null; } }
function save(v) { store('local', 'animalQuiz', v ? JSON.stringify(v) : null); }

socket.on('connect', () => {
  const s = joined || saved();
  if (s && (!params.get('pin') || params.get('pin') === s.pin)) {
    socket.emit('player:join', { pin: s.pin, playerId: s.playerId }, (r) => {
      if (r?.ok) { joined = { pin: r.pin, playerId: r.playerId }; save(joined); }
      else { joined = null; save(null); showJoin(); }
    });
  } else if (!joined) showJoin();
});
socket.on('disconnect', () => { if (joined) showBanner('連線中斷，重新連線中…'); });
socket.on('state', (s) => { hideBanner(); S = s; render(); });
socket.on('kicked', () => { joined = null; save(null); S = null; showJoin('你已被老師移出房間'); });

// ---------- 加入畫面 ----------
function showJoin(msg = '') {
  renderedKey = 'join';
  document.body.className = '';
  document.getElementById('meBar').classList.add('hidden');
  const pinIn = el('input', { class: 'pin', inputmode: 'numeric', maxlength: 6, placeholder: '000000', value: params.get('pin') || '', autocomplete: 'off' });
  const nameIn = el('input', { maxlength: 12, placeholder: '例如：小明', autocomplete: 'off' });
  const err = el('div', { class: 'err' }, msg);
  const grid = el('div', { class: 'animals' });
  const preview = el('div', { class: 'big-ani bounce', style: 'font-size:72px' }, chosenAnimal);
  ANIMALS.forEach((a) => {
    const b = el('button', { type: 'button', class: a === chosenAnimal ? 'sel' : '', onclick: () => {
      chosenAnimal = a; preview.textContent = a;
      grid.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
    } }, a);
    grid.append(b);
  });
  const go = el('button', { class: 'btn pink', type: 'submit' }, '加入遊戲 🐾');
  const form = el('form', { class: 'join card slideUp', onsubmit: (e) => {
    e.preventDefault();
    err.textContent = '';
    go.disabled = true;
    socket.emit('player:join', { pin: pinIn.value.trim(), name: nameIn.value, animal: chosenAnimal }, (r) => {
      go.disabled = false;
      if (!r?.ok) { err.textContent = r?.error || '加入失敗'; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return; }
      joined = { pin: r.pin, playerId: r.playerId }; save(joined);
    });
  } },
    preview,
    el('label', null, '房間 PIN 碼'), pinIn,
    el('label', null, '你的暱稱'), nameIn,
    el('label', null, '選一隻代表你的動物'), grid,
    err, go);
  app.replaceChildren(el('div', { class: 'mid' }, el('h1', null, '🐾 動物問答'), form));
  (pinIn.value ? nameIn : pinIn).focus();
}

// ---------- 遊戲畫面 ----------
function render() {
  if (!joined) return;
  const bar = document.getElementById('meBar');
  bar.classList.remove('hidden');
  document.getElementById('meAni').textContent = S.me.animal;
  document.getElementById('meName').textContent = S.me.name;
  document.getElementById('meScore').textContent = S.me.score.toLocaleString();

  let view = S.phase;
  if (S.phase === 'question' && (S.answered || pending != null)) view = 'answered';
  if (S.phase === 'leaderboard') view = 'reveal';
  const key = view + ':' + S.qIndex;
  if (S.phase !== 'question') pending = null;
  if (key === renderedKey) { if (view === 'lobby') updateLobby(); if (view === 'question') endsAt = Date.now() + S.remainingMs; return; }
  renderedKey = key;
  document.body.className = '';
  app.replaceChildren();
  ({ lobby: vLobby, intro: vIntro, question: vQuestion, answered: vAnswered, reveal: vReveal, podium: vPodium })[view]();
}

function vLobby() {
  app.append(el('div', { class: 'mid' },
    el('div', { class: 'big-ani bounce' }, S.me.animal),
    el('h1', { class: 'pop' }, '加入成功！'),
    el('div', { class: 'pill' }, S.me.name),
    el('div', { class: 'subtle' }, '看看大螢幕上有沒有你的名字 👀'),
    el('div', { class: 'subtle', id: 'lobbyCount' }, ''),
  ));
  updateLobby();
}
function updateLobby() { const n = document.getElementById('lobbyCount'); if (n) n.textContent = `目前 ${S.playerCount} 位同學在房間裡`; }

function vIntro() {
  app.append(el('div', { class: 'mid' },
    el('div', { class: 'pill slideUp' }, S.question.section || ''),
    el('h1', { class: 'pop', style: 'font-size:44px' }, `第 ${S.qIndex + 1} 題`),
    el('div', { class: 'big-ani wiggle' }, '🧐'),
    el('div', { class: 'subtle' }, '準備好了嗎？看大螢幕！'),
  ));
}

function vQuestion() {
  const q = S.question;
  endsAt = Date.now() + S.remainingMs;
  const tEl = el('b', null, Math.ceil(S.remainingMs / 1000));
  app.append(
    el('div', { class: 'qsmall card slideUp' }, el('span', { class: 'sec' }, `第 ${S.qIndex + 1} / ${S.total} 題`), q.text),
    el('div', { class: 'qtimer' }, '⏱ 剩下 ', tEl, ' 秒'),
    el('div', { class: 'answers ' + (q.type === 'tf' ? 'tf' : '') }, q.options.map((text, i) =>
      el('button', { class: `ans ${optClass(q.type, i)} pop`, style: `animation-delay:${i * 0.06}s`, onclick: () => answer(i) },
        el('span', { class: 'ic' }, optIcon(q.type, i)),
        el('span', null, q.type === 'tf' ? text : `${OPT_LETTERS[i]}. ${text}`)))),
  );
  const tick = () => {
    if (!document.body.contains(tEl)) return;
    tEl.textContent = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setTimeout(tick, 250);
  };
  tick();
}
function answer(i) {
  if (pending != null) return;
  pending = i;
  navigator.vibrate?.(30);
  socket.emit('player:answer', { choice: i });
  render();
}

function vAnswered() {
  const q = S.question;
  const mine = S.myAnswer ?? pending;
  app.append(el('div', { class: 'mid' },
    el('div', { class: 'big-ani bounce' }, S.me.animal),
    el('h1', { class: 'pop' }, '答案送出了！'),
    mine != null ? el('div', { class: `ans ${optClass(q.type, mine)}`, style: 'min-height:0;padding:10px 22px;flex-direction:row' },
      el('span', null, optIcon(q.type, mine)), el('span', null, q.type === 'tf' ? q.options[mine] : OPT_LETTERS[mine])) : null,
    el('div', { class: 'subtle' }, '等其他同學作答中… 🐾'),
  ));
}

function vReveal() {
  const r = S.result, q = S.question;
  document.body.className = r.correct ? 'good' : 'bad';
  if (S.phase === 'reveal') navigator.vibrate?.(r.correct ? [60, 40, 60] : 200);
  app.append(el('div', { class: 'mid' },
    el('div', { class: 'big-ani ' + (r.correct ? 'bounce' : 'shake') }, r.correct ? S.me.animal : S.me.animal + '💦'),
    el('div', { class: 'res-title pop' }, r.correct ? '答對了！🎉' : r.answered ? '差一點點！' : '時間到了！'),
    r.correct ? el('div', { class: 'gain pop', style: 'animation-delay:.2s' }, '+' + r.gained) : null,
    !r.correct ? el('div', { class: 'correct-was card slideUp' }, el('span', { class: 'ic' }, optIcon(q.type, r.answer)),
      el('span', null, '正確答案：', q.type === 'tf' ? q.options[r.answer] : `${OPT_LETTERS[r.answer]}. ${q.options[r.answer]}`)) : null,
    el('div', { class: 'rankbox card slideUp', style: 'animation-delay:.3s' },
      '目前第 ', el('b', null, S.me.rank), ' 名・總分 ', el('b', null, S.me.score.toLocaleString())),
    el('div', { class: 'subtle' }, S.phase === 'reveal' ? '看大螢幕的解析 👀' : '看看排行榜有沒有你！'),
  ));
  if (r.correct && S.phase === 'reveal') confetti(25, ['⭐', '✨', S.me.animal]);
}

function vPodium() {
  const rk = S.me.rank;
  const medal = rk === 1 ? '🥇' : rk === 2 ? '🥈' : rk === 3 ? '🥉' : S.me.animal;
  app.append(el('div', { class: 'mid' },
    el('div', { class: 'medal pop' }, medal),
    el('h1', { class: 'pop', style: 'font-size:38px' }, `第 ${rk} 名`),
    el('div', { class: 'rankbox card' }, '總分 ', el('b', null, S.me.score.toLocaleString())),
    el('div', { class: 'subtle' }, rk <= 3 ? '太厲害了！看大螢幕領獎 🏆' : '辛苦了！下次再接再厲 💪'),
  ));
  if (rk <= 3) setTimeout(() => confetti(60), 3500);
}

// ---------- 斷線提示 ----------
let banner = null;
function showBanner(t) {
  if (!banner) { banner = el('div', { class: 'pill', style: 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:60;background:#3b2f4a;color:#fff' }); document.body.append(banner); }
  banner.textContent = t;
}
function hideBanner() { banner?.remove(); banner = null; }
