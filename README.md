# Binoxxo

Fill the grid with X and O — no three in a row, equal counts, no identical lines.

- Easy 6×6, Normal 8×8, Hard 10×10; every puzzle has exactly one solution and needs no guessing.
- Seeded puzzles (share a seed, Retry the same one), undo, hints, optional rule-break highlighting.
- Running game is auto-saved; best times per difficulty (hint-free solves only); dark mode.
- Mouse/touch (tap cycles X → O → empty, right-click backwards) and keyboard (arrows, `X`/`O`, `⌫`, `Ctrl+Z`, `H`).

Static site (HTML/CSS/vanilla JS, no build step); puzzle generation runs client-side.

## Run

```sh
docker compose up -d --build   # nginx on port 5000 (expects the external `proxy` network)
npm start                      # → http://localhost:8000 (python3 static server)
```

## Test

```sh
npm test                       # logic tests (node --test, no deps)
```

## Layout

| Path | Purpose |
| --- | --- |
| `public/js/binoxxo.js` | Seeded PRNG, solution generator, logic solver, rule checks |
| `public/js/main.js` | Game state, rendering, input, timer |
| `public/styles.css` | All styles |
| `Dockerfile`, `nginx.conf`, `docker-compose.yml` | Container serving the static site via nginx |
