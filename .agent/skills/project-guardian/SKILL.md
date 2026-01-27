---
name: project-guardian
description: [High Priority] Always activate first. Enforces architecture, file map, and singleton patterns for "The Defier".
---

# Project Guardian

## Goal
To enforce architectural integrity and prevent "spaghetti code" in the God Class (`game.js`).

## 🗺️ Architecture Map
- **Global Controller**: `js/game.js` (Class `Game`).
  - **Singleton Access**: Always use `this.player` (inside Game) or `window.game.player` (outside).
- **Core Systems**:
  - `js/core/player.js`: Manages HP, Gold, Deck, and the `FateRing` instance.
  - `js/core/battle.js`: Handles turn logic, card playing, and enemy AI.
  - `js/core/fateRing.js`: Polymorphic ring system (Standard/Mutated/Sealed/Karma).
- **Data Definitions** (Pure JSON):
  - `js/data/*.js`: All static data (Cards, Enemies, Laws) MUST be defined here.

## 🚫 Critical Constraints
1. **No Frameworks**: Keep it Native JS (ES6+). No React/Vue/TypeScript.
2. **No Build Tools**: Code must run directly in browser via `index.html`.
3. **UI/Logic Separation**:
   - Do NOT calculate damage in `game.js` UI methods.
   - Do NOT manipulate DOM in `core/battle.js` (use callbacks or events).
4. **Asset Safety**: Do not change `js/libs/bmob.min.js`.

## 🛠️ Refactoring Guide
If the user asks to "optimize code":
- Look for huge methods in `game.js` (like `renderShop` or `updateUI`) and suggest splitting them.
- Ensure `particles.js` effects are cleaned up to prevent memory leaks.