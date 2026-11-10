import { DIFFICULTIES, EMPTY, O, X, conflicts, generate, isFull, isSolved, nextDeduction, randomSeed } from './binoxxo.js';

const $ = s => document.querySelector(s);

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// Dark mode
const darkToggle = $('#darkToggle');
function applyDark(on) {
  document.documentElement.classList.toggle('dark', on);
  darkToggle.textContent = on ? '☀' : '☾';
  store.set('dark', on ? '1' : '');
}
applyDark(store.get('dark') === '1');
darkToggle.addEventListener('click', () => applyDark(!document.documentElement.classList.contains('dark')));

let puzzle = null;     // see generate() in binoxxo.js
let cells = null;      // current grid (Uint8Array, 0 empty / 1 X / 2 O)
let status = 'ready';  // 'ready' | 'playing' | 'won'
let moves = 0;
let hints = 0;
let history = [];      // [index, before] for undo
let cursor = 0;        // keyboard focus cell
let showTimer = store.get('showTimer') !== '0';
let showErrors = store.get('showErrors') !== '0';
let timerStart = 0;
let resumeAt = 0;      // seconds already played when resuming a saved game
let timerInterval = null;
let cellEls = [];

const SYM = { [X]: 'X', [O]: 'O' };

// ── Controls ──

const savedDiff = store.get('difficulty');
if (savedDiff && $(`#diffSelect option[value="${savedDiff}"]`)) $('#diffSelect').value = savedDiff;

$('#newBtn').addEventListener('click', () => { $('#seedInput').value = ''; loadGame(); });
$('#retryBtn').addEventListener('click', () => { if (puzzle) $('#seedInput').value = puzzle.seed; loadGame(); });
$('#seedInput').addEventListener('keydown', e => { if (e.key === 'Enter') loadGame(); });
$('#diffSelect').addEventListener('change', () => {
  store.set('difficulty', $('#diffSelect').value);
  $('#seedInput').value = '';
  let savedGame = null;
try { savedGame = JSON.parse(store.get('game') || 'null'); } catch { /* corrupt save */ }
try {
  if (!savedGame || !DIFFICULTIES[savedGame.difficulty]) throw 0;
  const n = DIFFICULTIES[savedGame.difficulty].size;
  if (savedGame.cells.length !== n * n) throw 0;
  loadGame(savedGame);
} catch {
  loadGame();
}
});
$('#undoBtn').addEventListener('click', undo);
$('#hintBtn').addEventListener('click', hint);

const settingsPanel = $('#settingsPanel');
$('#settingsBtn').addEventListener('click', e => { e.stopPropagation(); settingsPanel.hidden = !settingsPanel.hidden; });
document.addEventListener('click', () => { settingsPanel.hidden = true; });
settingsPanel.addEventListener('click', e => e.stopPropagation());
function updateSettingsItems() {
  $('#timerItem').classList.toggle('active', showTimer);
  $('#errorsItem').classList.toggle('active', showErrors);
  $('#timerDisplay').style.visibility = showTimer ? '' : 'hidden';
}
$('#timerItem').addEventListener('click', () => {
  showTimer = !showTimer;
  store.set('showTimer', showTimer ? '1' : '0');
  updateSettingsItems();
});
$('#errorsItem').addEventListener('click', () => {
  showErrors = !showErrors;
  store.set('showErrors', showErrors ? '1' : '0');
  updateSettingsItems();
  if (puzzle) paint();
});
updateSettingsItems();

// ── Game setup ──

function loadGame(saved = null) {
  stopTimer();
  confettiRun++;
  $('#winBanner').classList.remove('show');
  const difficulty = saved ? saved.difficulty : $('#diffSelect').value;
  const seed = saved ? saved.seed : ($('#seedInput').value.trim() || randomSeed());
  puzzle = generate(seed, difficulty);
  cells = saved ? Uint8Array.from(saved.cells) : puzzle.givens.slice();
  status = saved ? 'playing' : 'ready';
  moves = saved ? saved.moves : 0;
  hints = saved ? saved.hints : 0;
  resumeAt = saved ? saved.elapsed : 0;
  history = [];
  cursor = 0;
  $('#diffSelect').value = difficulty;
  $('#seedInput').value = puzzle.seed;
  $('#seedDisplay').innerHTML = `seed: <code></code> &middot; ${$('#diffSelect').selectedOptions[0].text}`;
  $('#seedDisplay code').textContent = puzzle.seed;
  $('#timerDisplay').textContent = formatTime(resumeAt);
  $('#noteDisplay').textContent = saved ? 'resumed' : 'tap a cell: X → O → empty';
  renderBoard();
  if (saved) startTimer();
  else store.set('game', '');
}

function save() {
  if (status !== 'playing') { store.set('game', ''); return; }
  store.set('game', JSON.stringify({
    seed: puzzle.seed, difficulty: puzzle.difficulty, cells: [...cells], moves, hints, elapsed: elapsed(),
  }));
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ── Rendering ──

function renderBoard() {
  const el = document.createElement('div');
  el.className = 'board';
  el.style.setProperty('--cols', puzzle.size);
  el.tabIndex = 0;
  el.setAttribute('role', 'grid');
  el.setAttribute('aria-label', 'Binoxxo grid');
  cellEls = Array.from(cells, (_, i) => {
    const c = document.createElement('button');
    c.className = 'cell';
    c.tabIndex = -1;
    c.dataset.i = i;
    if (puzzle.givens[i]) c.classList.add('given');
    el.append(c);
    return c;
  });
  el.addEventListener('click', e => {
    const c = e.target.closest('.cell');
    if (c) { cursor = +c.dataset.i; cycle(+c.dataset.i, 1); }
  });
  el.addEventListener('contextmenu', e => {
    const c = e.target.closest('.cell');
    if (!c) return;
    e.preventDefault();
    cursor = +c.dataset.i;
    cycle(+c.dataset.i, -1);
  });
  el.addEventListener('keydown', onKey);
  el.addEventListener('focus', () => el.classList.add('kbd'));
  el.addEventListener('blur', () => el.classList.remove('kbd'));
  $('#boardWrap').replaceChildren(el);
  paint();
}

function paint() {
  const bad = showErrors ? conflicts(cells, puzzle.size) : new Set();
  cellEls.forEach((c, i) => {
    const v = cells[i];
    if (c.textContent !== (SYM[v] || '')) c.textContent = SYM[v] || '';
    c.classList.toggle('x', v === X);
    c.classList.toggle('o', v === O);
    c.classList.toggle('bad', bad.has(i));
    c.classList.toggle('cursor', i === cursor);
    c.setAttribute('aria-label', `row ${Math.floor(i / puzzle.size) + 1} column ${i % puzzle.size + 1}: ${SYM[v] || 'empty'}${puzzle.givens[i] ? ' (given)' : ''}`);
  });
  $('#leftDisplay').textContent = cells.filter(v => !v).length;
  $('#undoBtn').disabled = !history.length || status === 'won';
}

// ── Moves ──

function set(i, v, { record = true } = {}) {
  if (status === 'won' || puzzle.givens[i] || cells[i] === v) return;
  if (status === 'ready') { status = 'playing'; startTimer(); }
  $('#noteDisplay').textContent = '';
  if (record) history.push([i, cells[i]]);
  cells[i] = v;
  moves++;
  paint();
  const c = cellEls[i];
  c.classList.remove('pop', 'hinted');
  if (v) { void c.offsetWidth; c.classList.add('pop'); }
  if (isSolved(cells, puzzle.size)) win();
  else if (isFull(cells)) $('#noteDisplay').textContent = 'full, but something breaks a rule';
}

const NEXT = { [EMPTY]: X, [X]: O, [O]: EMPTY };
const PREV = { [EMPTY]: O, [O]: X, [X]: EMPTY };
function cycle(i, dir) { set(i, (dir > 0 ? NEXT : PREV)[cells[i]]); }

function undo() {
  if (status === 'won' || !history.length) return;
  const [i, v] = history.pop();
  cells[i] = v;
  moves++;
  $('#noteDisplay').textContent = '';
  paint();
}

/** Fixes one wrong cell, otherwise reveals the next logically deducible one. */
function hint() {
  if (status === 'won') return;
  let i = cells.findIndex((v, k) => v && v !== puzzle.solution[k]);
  let note = 'that one was wrong';
  if (i < 0) {
    i = nextDeduction(cells, puzzle.size);
    if (i < 0) i = cells.findIndex(v => !v);
    note = 'this one follows from the rules';
  }
  if (i < 0) return;
  hints++;
  cursor = i;
  set(i, puzzle.solution[i]);
  if (status !== 'won') $('#noteDisplay').textContent = note;
  cellEls[i].classList.add('hinted');
}

function onKey(e) {
  const n = puzzle.size;
  let r = Math.floor(cursor / n), c = cursor % n;
  const k = e.key;
  if (k === 'ArrowUp') r = (r + n - 1) % n;
  else if (k === 'ArrowDown') r = (r + 1) % n;
  else if (k === 'ArrowLeft') c = (c + n - 1) % n;
  else if (k === 'ArrowRight') c = (c + 1) % n;
  else if (k === 'x' || k === 'X' || k === '1') { set(cursor, X); e.preventDefault(); return; }
  else if (k === 'o' || k === 'O' || k === '0' || k === '2') { set(cursor, O); e.preventDefault(); return; }
  else if (k === 'Backspace' || k === 'Delete') { set(cursor, EMPTY); e.preventDefault(); return; }
  else if (k === 'Enter' || k === ' ') { cycle(cursor, e.shiftKey ? -1 : 1); e.preventDefault(); return; }
  else return;
  e.preventDefault();
  cursor = r * n + c;
  paint();
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.target.tagName !== 'INPUT') { e.preventDefault(); undo(); }
  else if (e.key === 'h' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') hint();
});

function win() {
  status = 'won';
  stopTimer();
  store.set('game', '');
  $('.board').classList.add('done');
  paint();
  const sec = elapsed();
  let extra;
  if (hints) {
    extra = ` · ${hints} hint${hints > 1 ? 's' : ''}`;
  } else {
    const key = `best:${puzzle.difficulty}`;
    const best = parseFloat(store.get(key));
    if (!(best <= sec)) {
      store.set(key, sec);
      extra = Number.isFinite(best) ? ' · new best!' : '';
    } else {
      extra = ` · best ${formatTime(best)}`;
    }
  }
  $('#winBanner').innerHTML = `Solved!<small>${formatTime(sec)}${extra}</small>`;
  $('#winBanner').classList.add('show');
  launchConfetti();
}

// ── Timer ──

const elapsed = () => (timerStart ? (performance.now() - timerStart) / 1000 : resumeAt);

function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function startTimer() {
  timerStart = performance.now() - resumeAt * 1000;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => { $('#timerDisplay').textContent = formatTime(elapsed()); }, 250);
}

function stopTimer() {
  clearInterval(timerInterval);
  if (status === 'won') $('#timerDisplay').textContent = formatTime(elapsed());
  else { timerStart = 0; resumeAt = 0; }
}

// ── Confetti ──

let confettiRun = 0;

function launchConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const run = ++confettiRun;
  const canvas = $('#confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const W = canvas.width, H = canvas.height;
  const COLORS = ['#c45d3e', '#2c2826', '#f5c842', '#6a9e6a', '#5b8fc9', '#c47db8'];
  const DURATION = 3500;
  const start = performance.now();
  const particles = Array.from({ length: 300 }, () => ({
    x: Math.random() * W,
    y: H + Math.random() * 20,
    vx: (Math.random() - 0.5) * 8,
    vy: -(Math.random() * 18 + 8),
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.3,
    w: Math.random() * 10 + 5,
    h: Math.random() * 5 + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  function draw(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    if (t > DURATION || run !== confettiRun) return;
    ctx.globalAlpha = 1 - Math.pow(t / DURATION, 2);
    for (const p of particles) {
      p.x += p.vx;
      p.vy += 0.18;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

let savedGame = null;
try { savedGame = JSON.parse(store.get('game') || 'null'); } catch { /* corrupt save */ }
try {
  if (!savedGame || !DIFFICULTIES[savedGame.difficulty]) throw 0;
  const n = DIFFICULTIES[savedGame.difficulty].size;
  if (savedGame.cells.length !== n * n) throw 0;
  loadGame(savedGame);
} catch {
  loadGame();
}
