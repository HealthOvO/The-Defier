---
name: card-forge
description: Generates JSON data for Cards, Treasures, and Enemies. Strictly follows the `effects` array pattern.
---

# Card Forge

## Goal
Generate game assets that strictly validate against `js/data/` structures.

## 🎴 Card Schema (`js/data/cards.js`)
**CRITICAL**: Cards MUST use an `effects` array. Do NOT use flat properties like `card.damage = 10`.

### Valid Effect Types
- `damage`: `{ type: 'damage', value: 10, target: 'enemy' }`
- `block`: `{ type: 'block', value: 8, target: 'self' }`
- `heal`: `{ type: 'heal', value: 5 }`
- `draw`: `{ type: 'draw', value: 2 }`
- `buff`: `{ type: 'buff', buffType: 'strength', value: 1, duration: 2 }`
- `conditional`: `{ type: 'conditionalDamage', condition: 'lowHp', threshold: 0.5, multiplier: 2 }`
- `execute`: `{ type: 'execute', value: 0.1 }` (Kill if HP < 10%)

## 🏺 Treasure Schema (`js/data/treasures.js`)
Treasures use `callbacks` for logic hooks.
- **Hooks**: `onBattleStart`, `onTurnStart`, `onCardPlayed`, `onKill`, `onDamageTaken`.

## 👹 Enemy Schema (`js/data/enemies.js`)
- `actionLoop`: Array of intent IDs (e.g., `['attack', 'buff', 'attack']`).
- `actions`: Dictionary defining the logic for each intent ID.