# Tanks-Inspired Browser Game Spec

## 1. Project Summary

Create a browser-based artillery game inspired by the old Flash game commonly known as **Tanks**. This project is **not affiliated with the original game or any prior ports**. It should capture the feel of turn-based tank artillery combat while using original code, assets, UI, and branding.

The first version is a **single-player local game** for **2 to 4 total tanks**, where any number of tanks can be AI-controlled. Online multiplayer is a future phase and is **out of scope for MVP**.

## 2. Product Goal

Build a small but replayable artillery game that is:
- easy for Codex/Claude to extend
- browser-first
- code-first
- fun in short sessions
- structured for future online multiplayer

## 3. MVP Scope

### In scope
- Browser game
- 2 to 4 tanks in a match
- Human and AI tanks in any combination
- Turn-based artillery combat
- Destructible or deformable-feeling terrain if feasible, otherwise simplified crater-based terrain damage
- Angle and power based shooting
- Wind affecting projectile trajectory
- Money and score rewards
- Store between rounds
- Basic weapons
- Basic upgrades
- Basic items
- Teams support
- Draw game option
- Persistent tank save data in browser storage

### Out of scope for MVP
- Online multiplayer
- Accounts
- Backend
- Matchmaking
- Cosmetics marketplace
- Mobile-specific UI polish
- Large weapon catalog
- Advanced particle effects
- Original Flash feature parity in every detail

## 4. Design Principles

- Keep the game readable and simple
- Prioritize gameplay feel over visual polish
- Use original names/UI/art where possible
- Keep systems modular for future expansion
- Avoid overengineering
- Favor deterministic game rules where practical
- Build with future multiplayer in mind, but do not let that complicate MVP

## 5. Target Platform

### MVP platform
- Desktop browser
- Keyboard-first controls
- Mouse used for menus and targeted items/weapons where applicable

### Future platforms
- Mobile browser or native wrapper
- Desktop app wrapper if desired
- Online multiplayer browser release

## 6. Core Gameplay Loop

1. Start or load a local match setup
2. Configure 2 to 4 tanks
3. Assign each tank as human or AI
4. Optionally assign teams
5. Start round on generated terrain
6. Players take turns moving, aiming, selecting weapon/item, and firing
7. Projectile resolves with gravity and wind
8. Damage, destruction, score, and money are applied
9. Round ends when only one tank or one team remains, or player declares draw
10. Enter store phase
11. Buy weapons, items, and upgrades
12. Start next round
13. Persist tank progression locally

## 7. Match Structure

### Player count
- Minimum: 2 tanks
- Maximum: 4 tanks

### Tank control types
- Human-controlled
- AI-controlled

### Team rules
- Free-for-all supported
- Team mode supported
- Match ends when only one team remains alive
- Friendly fire does not award money
- Friendly fire reduces score instead of increasing it

## 8. Tank Model

Each tank should have the following properties:
- display name
- color
- team
- controller type: human or AI
- current HP
- max HP
- current fuel
- base fuel per round
- cannon angle
- firepower
- score
- money
- inventory of weapons
- inventory of items
- permanent upgrades
- shield state
- alive/destroyed state
- persistent profile data for saved tanks

## 9. Turn Rules

On a tank's turn, the player can:
- move left/right until fuel runs out or movement is ended
- aim cannon angle
- adjust firepower
- switch weapons
- use a valid item
- fire once
- or teleport instead of firing

### Turn constraints
- A turn ends after firing
- A turn ends after teleporting
- A tank may not both teleport and fire on the same turn
- HP visibility is only shown for the active tank during its turn
- Wind should remain visible throughout the match

## 10. Combat Systems

### Projectile model
Shots should be affected by:
- firing angle
- firepower
- gravity
- wind

### Hit outcomes
- direct or near-direct damage to tanks
- terrain impact / crater effect if supported
- splash damage where appropriate for the weapon

### Rewards
- damaging enemies increases score and earns money
- destroying enemies grants higher rewards
- destruction reward is double the normal successful attack reward
- damaging teammates gives no money and reduces score

## 11. Wind System

Wind should be a core gameplay variable.

Requirements:
- direction and strength shown in UI
- clouds or another visual indicator move consistently with wind direction
- wind affects projectile flight
- wind value can remain fixed for the round or be configurable later

## 12. Movement and Terrain

### Movement
- Tanks move left/right using limited fuel each round
- Fuel resets each round based on tank stats/upgrades
- Terrain slope should matter visually and mechanically if feasible

### Terrain
Preferred MVP:
- Procedurally generated 2D terrain
- Tanks spawn in separated starting positions
- Terrain supports strategic firing arcs and movement constraints

Fallback MVP if needed:
- Static curated terrain maps
- Lightweight crater/deformation simulation

## 13. Weapons

### MVP weapon set
Keep initial catalog small.

Suggested MVP weapons:
- Basic Shell: default balanced projectile
- Heavy Shell: higher damage, smaller inventory
- Multi Shot: fires multiple weaker projectiles
- Air Strike: targeted attack affected by wind

### Weapon requirements
- Each weapon has cost, inventory count, damage profile, and behavior
- Players can switch between owned weapons during their turn
- Targeted weapons use mouse targeting
- ESC cancels targeting mode

## 14. Items

### Shields
- Activated from control bar
- Absorbs limited damage before depletion
- Prevents absorbed damage from reducing tank armor
- Excess damage beyond shield capacity spills into tank HP
- Persists across rounds until depleted
- Persists across saved sessions for saved tanks
- Only one shield can be active at a time

### Repair Kit
- Single-use item
- Restores a limited amount of HP

### Teleport
- Single-use item
- Lets player choose a destination on the map
- Ends turn immediately after use

## 15. Upgrades

Permanent upgrades purchased in the store.

### MVP upgrades
- Armor: increases survivability / max HP
- Engine efficiency: improves movement value per fuel usage or total usable movement
- Starting fuel: increases fuel available each round
- Firepower tuning: optional if useful for progression balance

### Future upgrade
- Hill climbing upgrade

## 16. Store Phase

After each round, enter a store screen.

Players can:
- buy weapons
- buy items
- buy permanent upgrades
- review current money
- review tank stats
- save tank profile locally

Store goals:
- simple menu-driven UI
- clear prices and descriptions
- no heavy animation requirements

## 17. Save System

### MVP persistence
Use browser local storage or another client-only persistence layer.

Persistable data:
- tank name
- color
- money
- score
- owned weapons
- owned items
- upgrades
- shield state
- other progression stats as needed

### Requirements
- save/load tank profiles between sessions
- support using saved tanks in future games
- make save data versionable for future updates

## 18. AI

AI should be intentionally simple for MVP but structured for improvement.

### MVP AI behaviors
- choose target tank
- estimate angle and power
- account for wind loosely
- choose movement occasionally
- use basic weapon selection rules
- optionally use repair/shield/teleport under simple conditions

### AI difficulty tiers
- Easy
- Medium
- Hard

Difficulty can vary by:
- aim accuracy
- wind compensation quality
- item usage quality
- target prioritization

## 19. Controls

### Keyboard
- Up / Down: rotate cannon
- Left / Right: move tank
- Space: fire
- Page Up / Page Down or Shift+Up / Shift+Down: increase/decrease firepower
- Q / W: previous/next weapon
- ESC: cancel targeted action

### Mouse
- UI navigation
- target selection for targeted weapons/items
- optional draw game button

## 20. UI Screens

### Required screens
- Main menu
- New game / match setup
- Tank setup
- Match screen
- Store screen
- Save/load tank screen
- End-of-round / end-of-match summary

### Match HUD requirements
- active player indicator
- current weapon
- current item state
- firepower display
- wind bar
- fuel display
- money and score display
- HP display for active tank only
- draw game button

## 21. Match Setup Screen

Allow players to configure:
- number of tanks: 2 to 4
- each tank as human or AI
- color selection
- team assignment
- optional AI difficulty
- load saved tank profile or start fresh

## 22. Scoring and Economy

### Score
- Increase for successful attacks on enemies
- Increase more for destroying enemies
- Decrease for friendly fire

### Money
- Earned by damaging enemies
- Earned at higher rates for destroying enemies
- No money for friendly fire
- Can be awarded to all surviving players on draw

Economy should be simple and readable, not overly tuned for MVP.

## 23. Audio and Visual Direction

### Visuals
- Clean 2D look
- Original minimalist aesthetic
- Simple terrain, tank sprites/shapes, projectiles, explosions
- No need to imitate original assets directly

### Audio
- Minimal sound set for MVP:
  - fire
  - impact
  - explosion
  - UI click
  - purchase

Audio can be placeholder quality at first.

## 24. Technical Direction

### Architecture goals
- browser-first
- modular game state
- scene/render separation where reasonable
- support deterministic turn resolution as much as practical
- easy for Codex/Claude to extend

### Recommended project structure
- `src/game/core` for rules/state
- `src/game/render` for scene/UI rendering
- `src/game/content` for weapons/items/upgrades definitions
- `src/game/ai` for AI logic
- `src/game/storage` for local persistence

## 25. Multiplayer Readiness

Future multiplayer is not part of MVP, but the codebase should avoid making it impossible.

Prepare for future by:
- centralizing game rules
- separating input from rules resolution
- making turn actions explicit commands
- keeping weapon/item definitions data-driven where possible

Do not build networking yet.

## 26. Non-Goals

Do not include these in MVP unless trivial:
- account system
- cloud saves
- cosmetics
- battle pass
- matchmaking
- chat
- replays
- advanced mod support
- cross-platform multiplayer

## 27. MVP Milestones

### Milestone 1: Local combat prototype
- 2 tanks
- terrain
- aim, power, wind
- projectile firing
- damage and destruction

### Milestone 2: Full local match flow
- 2 to 4 tanks
- teams
- AI tanks
- score and money
- end conditions

### Milestone 3: Progression loop
- store
- items
- upgrades
- save/load tank profiles

### Milestone 4: Polish pass
- better UI
- better AI
- sound effects
- balancing

## 28. Acceptance Criteria for MVP

The MVP is successful when:
- a player can start a browser game locally
- a match supports 2 to 4 tanks
- tanks can be human or AI
- teams work
- tanks can move, aim, change power, switch weapons, and fire
- wind affects shots
- damage, destruction, score, and money work
- draw game works
- store works between rounds
- at least shields, repair kit, and teleport work
- at least armor, engine efficiency, and starting fuel upgrades work
- tank data can be saved and loaded locally
- the game is stable enough for repeated short play sessions

## 29. Prompting Guidance for Codex

When building this project:
- keep the browser version first
- do not add Electron
- do not add backend services
- keep the code modular and readable
- build one milestone at a time
- prefer working gameplay over architecture purity
- summarize files changed after each task
- avoid unnecessary dependencies

## 30. Summary

Build a browser-first, original, Tanks-inspired artillery game for 2 to 4 tanks with human and AI players, teams, wind, score, money, a between-round store, persistent tank saves, and a clean path to future online multiplayer. Focus on a fun local MVP first.

