# Savoria 3D

A fully local side-scrolling platformer in a 3D-rendered world, set in the Savoria universe. Your art, your worlds, your characters. No internet needed, ever.

## Play

Double-click **Play Savoria 3D.command**. It starts a tiny local server (port 8977) and opens the game in your browser. Works with wifi off.

## Controls

- **← →** (or A/D) move
- **Space** or **↑** jump, press again mid-air for a double jump
- **Esc** pause

## The Game

Pick a chef (Fatsio, Dinnerette, or Chefno), then work through the world map: 6 worlds, 12 levels, unlocked in order.

1. **Pasta Plains** (Italian) — Farfalle Fields, Penne Ridge
2. **Sushi Shores** (Japanese) — Nori Narrows, Wasabi Falls
3. **Taco Territory** (Mexican) — Guaca Mesa, Salsa Rapids
4. **Curry Cliffs** (Indian) — Turmeric Terraces, Vindaloo Heights
5. **Dumpling Dynasty** (Chinese) — Bao Bridges, Wonton Wall
6. **Dessert Dome** (Sweet) — Macaron Pass, then Don Funghi's boss fight: dodge his charge, stomp him when he's tired. Three stomps wins.

- 🍅 Tomatoes are coins. Stomping enemies pays 2. Every 100 = extra life.
- ✨ Glowing arches are bonus doors: they warp you to a coin vault in the clouds, and a second door brings you back.
- 🌿 Basil heals a heart. Bubbled powerups: **Speed Pasta**, **Parmesan Shield**, **Basil Boost** (higher jumps).
- 🚩 Grey flag = mid-level checkpoint. Marinara/salsa/broth = do not touch.
- Stars per level (finish + 60% tomatoes + 2 hearts left). Progress saves locally.

## Tech

Three.js (vendored in `vendor/`, no CDN), vanilla JS, zero build step, zero external requests. Terrain and parallax hills are 3D geometry; characters are billboard sprites from the Savoria Godot project. Side-view camera with facing lookahead.

- `js/levels.js` — themes + a segment DSL (`run`, `gap`, `steps`, `river`, `plats`, `boss`…). A level is ~12 lines; add more by copying a recipe.
- `js/game.js` — engine: physics (with coyote time, jump buffering, ledge step-up), enemies, boss, particles, synth SFX.
- `js/main.js` — menus, world map, HUD, lives, save data.
