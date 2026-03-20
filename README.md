# Tanks 2026

Browser-first BabylonJS artillery game built with TypeScript and Vite. The current project implements a local MVP loop with hot-seat or AI tanks, teams, destructible-feeling heightfield terrain, score/money rewards, a between-round store, and browser-saved tank profiles.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Static deployment

This project builds to static files and can be hosted on GitHub Pages.

```bash
npm run build
```

The production output is written to `dist/`.

## Test

```bash
npm test
```

## Current gameplay

- 2 to 4 tanks per match
- human and AI tanks in any combination
- free-for-all and team mode
- fixed-step projectile simulation with wind
- basic shell, heavy shell, multi shot, and air strike
- shield, repair kit, and teleport items
- armor, engine, and fuel upgrades
- between-round store
- local profile save/load in browser storage

## Controls

- `W / A / S / D`: primary aim and movement controls
- `Arrow keys`: backup aim and movement controls
- `Q / E`: adjust power
- `Page Up / Page Down`: backup power controls
- `Z / X`: previous / next weapon
- `Space`: fire selected weapon
- `Esc`: cancel teleport or air-strike targeting
- mouse click on the battlefield: choose teleport or air-strike target

## Project structure

- `src/game/core`: deterministic rules, session flow, commands, and app coordination
- `src/game/render`: Babylon arena rendering, DOM shell, and lightweight audio
- `src/game/content`: weapons, items, upgrades, and economy defaults
- `src/game/ai`: simple legal-turn AI planning
- `src/game/storage`: browser save/load helpers

## Notes

- No backend, networking, Electron, auth, or database is used.
- Babylon renders the world only; menus and HUD use vanilla DOM/CSS overlay.
- Save data is versioned and stored locally in `localStorage`.
- A GitHub Pages workflow is included in `.github/workflows/deploy-pages.yml`.
