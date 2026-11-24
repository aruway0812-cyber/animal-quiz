const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const QUIZ = require('./questions');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 80;
const INTRO_MS = 3500; // 每題開始前的「第 N 題」動畫時間
const GAME_TTL_MS = 4 * 60 * 60 * 1000; // 遊戲閒置 4 小時後清除

const ANIMALS = ['🐰', '🐻', '🐱', '🐶', '🐼', '🐸', '🦊', '🐨', '🐯', '🐷', '🐧', '🐹', '🐮', '🐵', '🦁', '🐤'];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/qr', async (req, res) => {
  const u = String(req.query.u || '');
  if (!/^https?:\/\//.test(u) || u.length > 300) return res.status(400).end();
  const svg = await QRCode.toString(u, { type: 'svg', margin: 1, color: { dark: '#3b2f4a', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});

/** @type {Map<string, any>} */
const games = new Map();

function newPin() {
  let pin;
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while (games.has(pin));
  return pin;
}

function createGame() {
  const game = {
    pin: newPin(),
    hostToken: crypto.randomBytes(16).toString('hex'),
    phase: 'lobby', // lobby | intro | question | reveal | leaderboard | podium
    qIndex: -1,
    qStart: 0,
    qEnds: 0,
    timer: null,
    players: new Map(),
    prevTop: [], // 上一次排行榜（做名次變化動畫用）
    touched: Date.now(),
  };
  games.set(game.pin, game);
  return game;
}

const currentQ = (g) => QUIZ.questions[g.qIndex];

function ranking(g) {
  const list = [...g.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  let rank = 0, last = null;
  list.forEach((p, i) => {
    if (p.score !== last) { rank = i + 1; last = p.score; }
    p.rank = rank;
  });
  return list;
}

const publicPlayer = (p) => ({ id: p.id, name: p.name, animal: p.animal, score: p.score, rank: p.rank, gained: p.gained, connected: p.connected });

function hostState(g) {
  const q = currentQ(g);
  const players = [...g.players.values()];
  const s = {
    pin: g.pin,
    title: QUIZ.title,
    phase: g.phase,
    qIndex: g.qIndex,
    total: QUIZ.questions.length,
    players: players.map((p) => ({ id: p.id, name: p.name, animal: p.animal, connected: p.connected })),
  };
  if (q && g.phase !== 'lobby') {
    s.question = { section: q.section, type: q.type, text: q.text, options: q.options, time: q.time };
    s.answered = players.filter((p) => p.answer != null).length;
    s.remainingMs = g.phase === 'question' ? Math.max(0, g.qEnds - Date.now()) : 0;
    s.introMs = g.phase === 'intro' ? Math.max(0, g.qStart - Date.now()) : 0;
  }
  if (q && (g.phase === 'reveal' || g.phase === 'leaderboard')) {
    s.question.answer = q.answer;
    s.question.explain = q.explain || '';
    s.counts = q.options.map((_, i) => players.filter((p) => p.answer === i).length);
  }
  if (g.phase === 'leaderboard' || g.phase === 'podium') {
    s.top = ranking(g).slice(0, 5).map(publicPlayer);
    s.prevTop = g.prevTop;
  }
  return s;
}

function playerState(g, p) {
  const q = currentQ(g);
  const s = {
    pin: g.pin,
    title: QUIZ.title,
    phase: g.phase,
    qIndex: g.qIndex,
    total: QUIZ.questions.length,
    me: { id: p.id, name: p.name, animal: p.animal, score: p.score, rank: p.rank },
    playerCount: g.players.size,
  };
  if (q && g.phase !== 'lobby') {
    s.question = { section: q.section, type: q.type, text: q.text, options: q.options, time: q.time };
    s.answered = p.answer != null;
    s.myAnswer = p.answer;
    s.remainingMs = g.phase === 'question' ? Math.max(0, g.qEnds - Date.now()) : 0;
  }
  if (q && (g.phase === 'reveal' || g.phase === 'leaderboard' || g.phase === 'podium')) {
    s.result = { correct: p.answer === q.answer, answered: p.answer != null, gained: p.gained, answer: q.answer };
  }
  return s;
}

function sync(g) {
  g.touched = Date.now();
  if (g.phase !== 'lobby') ranking(g);
  io.to('host:' + g.pin).emit('state', hostState(g));
  for (const p of g.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('state', playerState(g, p));
  }
}

function clearTimer(g) {
  if (g.timer) clearTimeout(g.timer);
  g.timer = null;
}

function startQuestion(g, index) {
  clearTimer(g);
  g.qIndex = index;
  g.phase = 'intro';
  for (const p of g.players.values()) { p.answer = null; p.answeredAt = null; p.gained = 0; }
  g.qStart = Date.now() + INTRO_MS;
  sync(g);
  g.timer = setTimeout(() => {
    const q = currentQ(g);
    g.phase = 'question';
    g.qStart = Date.now();
    g.qEnds = g.qStart + q.time * 1000;
    sync(g);
    g.timer = setTimeout(() => endQuestion(g), q.time * 1000 + 300);
  }, INTRO_MS);
}

function endQuestion(g) {
  if (g.phase !== 'question') return;
  clearTimer(g);
  g.prevTop = ranking(g).slice(0, 5).map((p) => ({ id: p.id, rank: p.rank, score: p.score }));
  const q = currentQ(g);
  for (const p of g.players.values()) {
    if (p.answer === q.answer) {
      const t = Math.min(1, Math.max(0, (p.answeredAt - g.qStart) / (q.time * 1000)));
      p.gained = Math.round(1000 - t * 500);
      p.score += p.gained;
    } else p.gained = 0;
  }
  g.phase = 'reveal';
  sync(g);
}

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
}

io.on('connection', (socket) => {
  let role = null, game = null, player = null;

  const hostOnly = (fn) => (data, ack) => {
    if (role !== 'host' || !game) return;
    fn(data || {}, typeof ack === 'function' ? ack : () => {});
  };

  socket.on('host:create', (data, ack) => {
    game = createGame();
    role = 'host';
    socket.join('host:' + game.pin);
    if (typeof ack === 'function') ack({ ok: true, pin: game.pin, hostToken: game.hostToken });
    sync(game);
  });

  socket.on('host:resume', (data, ack) => {
    const g = games.get(String(data?.pin || ''));
    if (!g || g.hostToken !== data?.hostToken) return typeof ack === 'function' && ack({ ok: false });
    game = g; role = 'host';
    socket.join('host:' + g.pin);
    if (typeof ack === 'function') ack({ ok: true, pin: g.pin });
    sync(g);
  });

  socket.on('host:start', hostOnly(() => {
    if (game.phase !== 'lobby' || game.players.size === 0) return;
    startQuestion(game, 0);
  }));

  socket.on('host:skip', hostOnly(() => endQuestion(game)));

  socket.on('host:next', hostOnly(() => {
    const g = game;
    if (g.phase === 'reveal') { g.phase = 'leaderboard'; sync(g); }
    else if (g.phase === 'leaderboard') {
      if (g.qIndex + 1 < QUIZ.questions.length) startQuestion(g, g.qIndex + 1);
      else { g.phase = 'podium'; sync(g); }
    }
  }));

  socket.on('host:kick', hostOnly((data) => {
    const p = game.players.get(String(data.id || ''));
    if (!p) return;
    if (p.socketId) io.to(p.socketId).emit('kicked');
    game.players.delete(p.id);
    sync(game);
  }));

  socket.on('host:restart', hostOnly(() => {
    clearTimer(game);
    game.phase = 'lobby';
    game.qIndex = -1;
    game.prevTop = [];
    for (const p of game.players.values()) { p.score = 0; p.answer = null; p.gained = 0; p.rank = null; }
    sync(game);
  }));

  socket.on('player:join', (data, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const g = games.get(String(data?.pin || '').trim());
    if (!g) return ack({ ok: false, error: '找不到這個房間，請確認 PIN 碼' });

    // 斷線重連：用原本的 playerId 回到同一個角色
    const existing = data?.playerId && g.players.get(String(data.playerId));
    if (existing) {
      player = existing;
    } else {
      const name = cleanName(data?.name);
      if (!name) return ack({ ok: false, error: '請輸入暱稱' });
      if (g.phase !== 'lobby') return ack({ ok: false, error: '遊戲已經開始了，下次早點加入喔！' });
      if (g.players.size >= MAX_PLAYERS) return ack({ ok: false, error: '房間人數已滿' });
      if ([...g.players.values()].some((p) => p.name === name)) return ack({ ok: false, error: '這個暱稱有人用了，換一個吧' });
      const animal = ANIMALS.includes(data?.animal) ? data.animal : ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
      player = { id: crypto.randomBytes(8).toString('hex'), name, animal, score: 0, rank: null, answer: null, answeredAt: null, gained: 0, joinedAt: Date.now() };
      g.players.set(player.id, player);
    }
    if (player.socketId && player.socketId !== socket.id) io.sockets.sockets.get(player.socketId)?.disconnect(true);
    game = g; role = 'player';
    player.socketId = socket.id;
    player.connected = true;
    ack({ ok: true, playerId: player.id, pin: g.pin });
    sync(g);
  });

  socket.on('player:answer', (data) => {
    if (role !== 'player' || !game || !player || game.phase !== 'question') return;
    if (player.answer != null || !game.players.has(player.id)) return;
    const q = currentQ(game);
    const choice = Number(data?.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return;
    player.answer = choice;
    player.answeredAt = Date.now();
    const active = [...game.players.values()].filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => p.answer != null)) endQuestion(game);
    else sync(game);
  });

  socket.on('disconnect', () => {
    if (role === 'player' && player && player.socketId === socket.id) {
      player.connected = false;
      player.socketId = null;
      if (game) sync(game);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [pin, g] of games) if (now - g.touched > GAME_TTL_MS) { clearTimer(g); games.delete(pin); }
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`🐾 動物問答已啟動：http://localhost:${PORT}`);
  console.log(`   老師端（投影）：http://localhost:${PORT}/host`);
});
