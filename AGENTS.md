# Codex Working Guide

This repository is for a browser-first BabylonJS game built with TypeScript and Vite.

## Core rules

- Keep changes small, readable, and easy to review.
- Prefer the simplest working implementation.
- Avoid unnecessary dependencies.
- Avoid overengineering and speculative architecture.
- Preserve the browser-first setup.
- Do not add Electron, networking, backend services, auth, databases, multiplayer, or extra UI frameworks.
- Do not introduce real gameplay systems until the GDD exists.

## Architecture guidance

- Keep runtime and game-rule code reasonably separate from rendering code.
- Put Babylon scene and render-specific code in `src/game/render`.
- Put non-render coordination in `src/game/core`.
- Use `src/game/content`, `src/game/ai`, and `src/game/storage` only when work clearly belongs there.
- Prefer direct TypeScript modules over deep class hierarchies.

## Dependency and tooling guidance

- Add a dependency only when it solves an immediate problem better than local code.
- Keep Vite as the browser app shell.
- Keep TypeScript strict enough to catch mistakes without adding ceremony.
- Use the existing scripts and structure unless there is a concrete reason to change them.

## Verification before finishing

- Run the smallest relevant verification for the task.
- For app or scene changes, run `npm run build`.
- When startup or tooling changes are involved, also verify the dev server starts cleanly.
- If a command cannot be run, say so clearly.

## Required task summary

After each task, summarize:

- files changed
- commands used
- verification run
- any assumptions made
