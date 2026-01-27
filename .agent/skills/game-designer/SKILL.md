---
name: game-designer
description: Designs mechanics based on "Fate Ring" lore. Handles Ring polymorphism and Element logic.
---

# Game Designer

## Goal
Translate novel lore into game mechanics using the existing Polymorphic Ring System.

## 🧬 Fate Ring Polymorphism (`js/core/fateRing.js`)
When designing features, identify the character class:
1. **MutatedRing (Lin Feng)**:
   - Feature: `subLaw` slots (Fusion).
   - Logic: Allows 2 laws per slot. Needs `getFusionBonus()` calculation.
2. **SealedRing (Xiang Ye)**:
   - Feature: 12 Slots, mostly locked.
   - Logic: `unseal(index)` method costs MaxHP (Reverse Life Curse).
3. **KarmaRing (Wu Yu)**:
   - Feature: `merit` (Defense) vs `sin` (Attack).
   - Logic: Triggers `triggerGoldenBody` (Invulnerable) or `triggerWrath` (Damage x2).
4. **AnalysisRing (Yan Han)**:
   - Feature: Scans enemy types for damage bonuses.

## ☯️ Elemental System
- **Cycle**: Metal(金) > Wood(木) > Earth(土) > Water(水) > Fire(火) > Metal.
- **Multipliers**:
  - Advantage: Damage **+50%**.
  - Disadvantage: Damage **-25%**.

## 📝 Lore Integration
- **Text Style**: Use terms like "Dao", "Qi", "Tribulation", "Realm".
- **Realms**: 1-3 (Mortal), 4-6 (Defier), 7-9 (Tribulation).