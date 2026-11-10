# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

- `npm start` — static server at http://localhost:8000 (python3 http.server on `public/`).
- `npm test` — logic tests via `node --test` (no dependencies).
- `docker compose up` — nginx serving `public/` on port 5000.

## Architecture

Static site, no backend, no build step:

- **`public/js/binoxxo.js`** — pure logic: `generate(seed, size, difficulty)` → `{ size, givens, solution }` (deterministic via FNV-hashed seed + mulberry32), `conflicts` (rule-break cells), `solveLogic`, `nextDeduction` (hints). Cells are a row-major `Uint8Array`: 0 empty, 1 X, 2 O.
- **`public/js/main.js`** — all UI/game code (ES module).
- **`public/index.html`**, **`public/styles.css`** — markup and styles.

**Key design decisions:**
- Same seed + size + difficulty always produces the same puzzle. Size (`SIZES` 6/8/10, default 10) and difficulty are independent selects.
- Generation: random full grid (row-by-row backtracking over valid line patterns), then clues are removed in random order while `solveLogic` at the difficulty's level still completes it → unique solution, no guessing. Level 1 = pairs/sandwiches/count completion; level 2 adds intersection of all still-possible line patterns incl. the no-duplicate-lines rule. `DIFFICULTIES`: Easy = level 1, keeps ≥45 % of cells; Normal = level 1, ≥33 %; Hard = level 2, as few clues as logic allows (~21 % at 10×10).
- Hint: fixes the first wrong cell, else fills the next logically deducible cell (`nextDeduction`). Hinted solves don't count for best times.
- localStorage keys: `size`, `difficulty`, `showTimer`, `showErrors`, `best:<size>:<difficulty>`, `game` (auto-saved running game: seed, size, difficulty, cells, moves, hints, elapsed), `dark`.
