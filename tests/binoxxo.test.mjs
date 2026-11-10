import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES, EMPTY, SIZES, O, X, conflicts, generate, isSolved, linePatterns, nextDeduction, solveLogic,
} from '../public/js/binoxxo.js';

const SEEDS = Array.from({ length: 15 }, (_, i) => `s${i}`);
const DIFFS = Object.keys(DIFFICULTIES);
const COMBOS = SIZES.flatMap(n => DIFFS.map(d => [n, d]));
const clues = p => p.givens.filter(v => v).length;

/** Counts solutions by brute-force backtracking (stops at 2). */
function countSolutions(givens, size) {
  const cells = givens.slice();
  let count = 0;
  (function rec(i) {
    if (count > 1) return;
    while (i < cells.length && cells[i]) i++;
    if (i === cells.length) { if (isSolved(cells, size)) count++; return; }
    for (const v of [X, O]) {
      cells[i] = v;
      if (conflicts(cells, size).size === 0) rec(i + 1);
    }
    cells[i] = EMPTY;
  })(0);
  return count;
}

test('same seed and difficulty give the same puzzle', () => {
  for (const [n, d] of COMBOS) {
    assert.deepEqual(generate('abc', n, d).givens, generate('abc', n, d).givens);
  }
  assert.notDeepEqual(generate('abc', 10, 'hard').givens, generate('abd', 10, 'hard').givens);
  assert.notDeepEqual(generate('abc', 10, 'normal').solution, generate('abc', 10, 'hard').solution);
  assert.throws(() => generate('abc', 7, 'easy'));
});

test('line patterns are balanced and triple-free', () => {
  assert.equal(linePatterns(6).length, 14);
  for (const p of linePatterns(10)) {
    assert.equal(p.filter(v => v === X).length, 5);
    assert.ok(!/(.)\1\1/.test(p.join('')));
  }
});

test('conflicts flags triples, over-full lines and duplicate lines', () => {
  const n = 4;
  const g = new Uint8Array(16);
  g.set([X, X, X], 0);
  assert.deepEqual([...conflicts(g, n)].sort(), [0, 1, 2]);
  const h = new Uint8Array(16);
  h.set([X, O, X, X], 0);
  assert.ok(conflicts(h, n).has(3));
  const d = Uint8Array.from([X, O, O, X, X, O, O, X, O, X, X, O, O, X, X, O]);
  assert.ok(conflicts(d, n).size > 0); // rows 0 and 1 identical
});

test('solutions are valid and givens match them', () => {
  for (const [n, d] of COMBOS) {
    for (const s of SEEDS) {
      const p = generate(s, n, d);
      assert.equal(p.size, n);
      assert.equal(p.solution.length, n * n);
      assert.ok(clues(p) >= Math.round(DIFFICULTIES[d].keep * n * n));
      assert.ok(isSolved(p.solution, p.size), `${d}/${s} solution invalid`);
      p.givens.forEach((v, i) => { if (v) assert.equal(v, p.solution[i]); });
      assert.ok(p.givens.some(v => v === EMPTY));
      assert.equal(conflicts(p.givens, p.size).size, 0);
    }
  }
});

test('puzzles are solvable by logic at their level (no guessing)', () => {
  for (const [n, d] of COMBOS) {
    for (const s of SEEDS) {
      const p = generate(s, n, d);
      const cells = p.givens.slice();
      assert.ok(solveLogic(cells, p.size, DIFFICULTIES[d].level), `${d}/${s} not logic-solvable`);
      assert.deepEqual(cells, p.solution);
    }
  }
});

test('puzzles have exactly one solution', () => {
  for (const [n, d] of COMBOS.filter(([n]) => n <= 8)) {
    for (const s of SEEDS.slice(0, 8)) {
      const p = generate(s, n, d);
      assert.equal(countSolutions(p.givens, p.size), 1, `${d}/${s}`);
    }
  }
});

test('easier difficulties leave more clues', () => {
  for (const n of SIZES) {
    const avg = d => SEEDS.reduce((a, s) => a + clues(generate(s, n, d)), 0) / SEEDS.length;
    const [e, m, h] = DIFFS.map(avg);
    assert.ok(e > m && m > h, `${n}: ${e} ${m} ${h}`);
  }
});

test('10×10 hard needs the pattern level on at least some seeds', () => {
  const needsLevel2 = SEEDS.some(s => {
    const p = generate(s, 10, 'hard');
    return !solveLogic(p.givens.slice(), p.size, 1);
  });
  assert.ok(needsLevel2);
});

test('nextDeduction always points at an empty cell until solved', () => {
  const p = generate('hint', 10, 'hard');
  const cells = p.givens.slice();
  let steps = 0;
  while (!isSolved(cells, p.size)) {
    const i = nextDeduction(cells, p.size);
    assert.ok(i >= 0 && cells[i] === EMPTY);
    cells[i] = p.solution[i];
    steps++;
  }
  assert.equal(steps, p.givens.filter(v => !v).length);
  assert.equal(nextDeduction(cells, p.size), -1);
});
