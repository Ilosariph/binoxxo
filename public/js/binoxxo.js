// Pure puzzle logic (no DOM): seeded generation so a seed always gives the same puzzle.
//
// Binoxxo rules: fill every cell with X or O so that
//   1. no more than two equal symbols are adjacent in a row or column,
//   2. every row and column holds as many X as O,
//   3. no two rows (and no two columns) are identical.
//
// Cells are stored row-major in a Uint8Array: 0 = empty, 1 = X, 2 = O.

export const EMPTY = 0, X = 1, O = 2;

export const SIZES = [6, 8, 10];
export const DEFAULT_SIZE = 10;

// level 1: pairs, sandwiches and count completion only.
// level 2: additionally intersects all still-possible line patterns (incl. the no-duplicate rule).
// keep: share of cells that stay given at least (0 = remove as many as logic allows).
export const DIFFICULTIES = {
  easy: { level: 1, keep: 0.45 },
  normal: { level: 1, keep: 0.33 },
  hard: { level: 2, keep: 0 },
};

// Hashes a seed string into a 32-bit integer (FNV-1a + final avalanche).
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

// Small seedable PRNG so the same seed always yields the same puzzle.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 0x100000000).toString(16);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Lines ──

/** Cell indices of all 2n lines: rows 0..n-1, then columns. */
export function lines(size) {
  const out = [];
  for (let r = 0; r < size; r++) out.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push(Array.from({ length: size }, (_, r) => r * size + c));
  return out;
}

const patternCache = new Map();

/** Every valid complete line of the given length (balanced, no triple), as arrays of X/O. */
export function linePatterns(size) {
  if (patternCache.has(size)) return patternCache.get(size);
  const out = [];
  const cur = [];
  const half = size / 2;
  (function rec(nx, no) {
    const k = cur.length;
    if (k === size) { out.push(cur.slice()); return; }
    for (const v of [X, O]) {
      if (v === X ? nx === half : no === half) continue;
      if (k >= 2 && cur[k - 1] === v && cur[k - 2] === v) continue;
      cur.push(v);
      rec(nx + (v === X), no + (v === O));
      cur.pop();
    }
  })(0, 0);
  patternCache.set(size, out);
  return out;
}

// ── Validation ──

/** Indices of cells that break a rule (triples, over-full lines, duplicate complete lines). */
export function conflicts(cells, size) {
  const bad = new Set();
  const half = size / 2;
  const all = lines(size);
  for (const line of all) {
    for (let k = 2; k < size; k++) {
      const a = cells[line[k - 2]], b = cells[line[k - 1]], c = cells[line[k]];
      if (a && a === b && b === c) { bad.add(line[k - 2]); bad.add(line[k - 1]); bad.add(line[k]); }
    }
    for (const v of [X, O]) {
      const idx = line.filter(i => cells[i] === v);
      if (idx.length > half) idx.forEach(i => bad.add(i));
    }
  }
  for (const group of [all.slice(0, size), all.slice(size)]) {
    const seen = new Map();
    for (const line of group) {
      if (line.some(i => !cells[i])) continue;
      const key = line.map(i => cells[i]).join('');
      if (seen.has(key)) { seen.get(key).forEach(i => bad.add(i)); line.forEach(i => bad.add(i)); }
      else seen.set(key, line);
    }
  }
  return bad;
}

export const isFull = cells => cells.every(v => v !== EMPTY);
export const isSolved = (cells, size) => isFull(cells) && conflicts(cells, size).size === 0;

// ── Logical solver ──

const other = v => (v === X ? O : X);

/** Level-1 deductions on one line. Returns list of [cellIndex, value]. */
function simpleLine(cells, line, half) {
  const out = [];
  const n = line.length;
  const v = k => cells[line[k]];
  for (let k = 0; k < n; k++) {
    if (v(k)) continue;
    // _aa / aa_ / a_a
    if (k + 2 < n && v(k + 1) && v(k + 1) === v(k + 2)) { out.push([line[k], other(v(k + 1))]); continue; }
    if (k >= 2 && v(k - 1) && v(k - 1) === v(k - 2)) { out.push([line[k], other(v(k - 1))]); continue; }
    if (k >= 1 && k + 1 < n && v(k - 1) && v(k - 1) === v(k + 1)) { out.push([line[k], other(v(k - 1))]); continue; }
  }
  let nx = 0, no = 0;
  for (const i of line) { if (cells[i] === X) nx++; else if (cells[i] === O) no++; }
  if (nx + no < n && (nx === half || no === half)) {
    const fill = nx === half ? O : X;
    for (const i of line) if (!cells[i]) out.push([i, fill]);
  }
  return out;
}

/** Level-2 deductions on one line: cells equal in all patterns still possible. Null on contradiction. */
function patternLine(cells, line, patterns, siblings) {
  const taken = [];
  for (const s of siblings) {
    if (s === line || s.some(i => !cells[i])) continue;
    taken.push(s.map(i => cells[i]).join(''));
  }
  if (line.every(i => cells[i])) return [];
  let common = null;
  for (const p of patterns) {
    let ok = true;
    for (let k = 0; k < line.length; k++) if (cells[line[k]] && cells[line[k]] !== p[k]) { ok = false; break; }
    if (!ok || taken.includes(p.join(''))) continue;
    if (!common) common = p.slice();
    else for (let k = 0; k < line.length; k++) if (common[k] !== p[k]) common[k] = EMPTY;
  }
  if (!common) return null;
  const out = [];
  for (let k = 0; k < line.length; k++) if (!cells[line[k]] && common[k]) out.push([line[k], common[k]]);
  return out;
}

/**
 * Fills as much as possible by logic at the given level (1 or 2), in place.
 * Returns true if the grid ends up full.
 */
export function solveLogic(cells, size, level) {
  const half = size / 2;
  const all = lines(size);
  const rows = all.slice(0, size), cols = all.slice(size);
  const patterns = level >= 2 ? linePatterns(size) : null;
  let changed = true;
  while (changed) {
    changed = false;
    for (const line of all) {
      for (const [i, v] of simpleLine(cells, line, half)) if (!cells[i]) { cells[i] = v; changed = true; }
    }
    if (changed || level < 2) continue;
    for (let li = 0; li < all.length; li++) {
      const res = patternLine(cells, all[li], patterns, li < size ? rows : cols);
      if (!res) return false;
      for (const [i, v] of res) { cells[i] = v; changed = true; }
      if (changed) break;
    }
  }
  return isFull(cells);
}

/** Next cell a player could deduce by logic (for hints), or -1. Prefers level-1 steps. */
export function nextDeduction(cells, size) {
  const half = size / 2;
  const all = lines(size);
  for (const line of all) {
    const d = simpleLine(cells, line, half);
    if (d.length) return d[0][0];
  }
  const patterns = linePatterns(size);
  for (let li = 0; li < all.length; li++) {
    const d = patternLine(cells, all[li], patterns, li < size ? all.slice(0, size) : all.slice(size));
    if (d && d.length) return d[0][0];
  }
  return -1;
}

// ── Generation ──

/** Random complete valid grid (row by row backtracking over valid row patterns). */
function randomSolution(size, rng) {
  const half = size / 2;
  const patterns = linePatterns(size);
  const rows = [];
  const used = new Set();

  function colsOk() {
    const r = rows.length - 1;
    for (let c = 0; c < size; c++) {
      let nx = 0;
      for (let rr = 0; rr <= r; rr++) if (rows[rr][c] === X) nx++;
      if (nx > half || r + 1 - nx > half) return false;
      if (r >= 2 && rows[r][c] === rows[r - 1][c] && rows[r][c] === rows[r - 2][c]) return false;
    }
    if (r === size - 1) {
      const seen = new Set();
      for (let c = 0; c < size; c++) {
        const key = rows.map(row => row[c]).join('');
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }
    return true;
  }

  (function rec() {
    if (rows.length === size) return true;
    for (const p of shuffle(patterns.slice(), rng)) {
      const key = p.join('');
      if (used.has(key)) continue;
      rows.push(p); used.add(key);
      if (colsOk() && rec()) return true;
      rows.pop(); used.delete(key);
    }
    return false;
  })();

  return Uint8Array.from(rows.flat());
}

/**
 * Deterministic from (seed, size, difficulty). Clues are removed while the puzzle stays solvable
 * by pure logic at the difficulty's level, so the solution is unique and needs no guessing.
 */
export function generate(seed, size, difficulty) {
  if (!SIZES.includes(size)) throw new Error(`bad size ${size}`);
  const { level, keep } = DIFFICULTIES[difficulty];
  const minClues = Math.round(keep * size * size);
  const rng = mulberry32(hashSeed(`binoxxo:${size}:${difficulty}:${seed}`));
  const solution = randomSolution(size, rng);
  const givens = solution.slice();
  let clues = givens.length;
  for (const i of shuffle([...givens.keys()], rng)) {
    if (clues <= minClues) break;
    const v = givens[i];
    givens[i] = EMPTY;
    if (solveLogic(givens.slice(), size, level)) clues--;
    else givens[i] = v;
  }
  return { seed, size, difficulty, givens, solution };
}
