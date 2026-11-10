import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES, EMPTY, O, X, conflicts, generate, isSolved, linePatterns, nextDeduction, solveLogic,
} from '../public/js/binoxxo.js';

const SEEDS = Array.from({ length: 25 }, (_, i) => `s${i}`);

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
  for (const d of Object.keys(DIFFICULTIES)) {
    assert.deepEqual(generate('abc', d).givens, generate('abc', d).givens);
  }
  assert.notDeepEqual(generate('abc', 'hard').givens, generate('abd', 'hard').givens);
  assert.notDeepEqual(generate('abc', 'normal').solution, generate('abc', 'hard').solution);
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
  for (const d of Object.keys(DIFFICULTIES)) {
    for (const s of SEEDS) {
      const p = generate(s, d);
      assert.equal(p.size, DIFFICULTIES[d].size);
      assert.ok(isSolved(p.solution, p.size), `${d}/${s} solution invalid`);
      p.givens.forEach((v, i) => { if (v) assert.equal(v, p.solution[i]); });
      assert.ok(p.givens.some(v => v === EMPTY));
      assert.equal(conflicts(p.givens, p.size).size, 0);
    }
  }
});

test('puzzles are solvable by logic at their level (no guessing)', () => {
  for (const d of Object.keys(DIFFICULTIES)) {
    for (const s of SEEDS) {
      const p = generate(s, d);
      const cells = p.givens.slice();
      assert.ok(solveLogic(cells, p.size, DIFFICULTIES[d].level), `${d}/${s} not logic-solvable`);
      assert.deepEqual(cells, p.solution);
    }
  }
});

test('puzzles have exactly one solution', () => {
  for (const d of ['easy', 'normal']) {
    for (const s of SEEDS.slice(0, 10)) {
      const p = generate(s, d);
      assert.equal(countSolutions(p.givens, p.size), 1, `${d}/${s}`);
    }
  }
});

test('hard needs the pattern level on at least some seeds', () => {
  const needsLevel2 = SEEDS.some(s => {
    const p = generate(s, 'hard');
    return !solveLogic(p.givens.slice(), p.size, 1);
  });
  assert.ok(needsLevel2);
});

test('nextDeduction always points at an empty cell until solved', () => {
  const p = generate('hint', 'hard');
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
