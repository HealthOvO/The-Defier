---
name: game-designer
description: Comprehensive game design assistant for "The Defier". Merges specific Fate Ring lore mechanics with universal game design principles (Core Loop, Flow, Balancing).
allowed-tools: Read, Glob, Grep
---

# Game Designer

## Goal
To translate "Fate Ring" novel lore into playable, engaging mechanics, ensuring both narrative accuracy and psychological flow.

---

## 1. The Core Loop (30-Second Test)
Every mechanic designed for "The Defier" must satisfy this loop to ensure immediate fun:

1.  **ACTION**: Player plays a card (e.g., "Fireball") or activates a Ring Skill.
2.  **FEEDBACK**: Visual effects (Particles), Sound (SFX), and specific "Cultivation" text feedback (e.g., "The Qi surges!").
3.  **REWARD**: Enemy takes damage (Elementally amplified) or Player advances cultivation (Gain XP/Qi).
4.  **REPEAT**: Draw new cards, plan next elemental combo.

> **Design Principle**: "Early wins, gradually increase challenge." Ensure the Mortal Realm (1-3) hooks the player quickly before introducing the harsh punishments of the Defier Realm.

---

## 2. 🧬 Fate Ring Polymorphism (Core Mechanics)
Base Logic Reference: `js/core/fateRing.js`

When designing features, identify the specific Character Archetype and their unique Ring Logic:

### A. MutatedRing (Lin Feng - The Optimizer)
* **Target Player Type**: **Explorer/Achiever** (Loves finding combos).
* **Mechanic**: `subLaw` slots (Fusion).
* **Logic**: Allows 2 laws per slot.
    * *Design Task*: Always calculate `getFusionBonus()` when laws match (e.g., Fire + Wood = Intensity Boost).

### B. SealedRing (Xiang Ye - The Hardcore)
* **Target Player Type**: **Killer/Achiever** (Loves high risk, high reward).
* **Mechanic**: 12 Slots, mostly locked by "Reverse Life Curse".
* **Logic**: `unseal(index)` method costs **MaxHP**.
    * *Design Task*: Balance the HP cost so it feels like a "forbidden sacrifice" but doesn't make the game mathematically impossible.

### C. KarmaRing (Wu Yu - The Strategist)
* **Target Player Type**: **Socializer/Explorer** (Roleplay focus).
* **Mechanic**: Dual meter `merit` (Defense) vs `sin` (Attack).
* **Logic**:
    * `triggerGoldenBody`: Invulnerability (Defensive peak).
    * `triggerWrath`: Damage x2 (Offensive peak).
    * *Design Task*: Ensure players can't easily max both. Force a choice between "Saint" and "Demon".

### D. AnalysisRing (Yan Han - The Tactician)
* **Target Player Type**: **Achiever** (Loves extracting max value).
* **Mechanic**: Scans enemy types for weaknesses.
* **Logic**: Passive damage bonuses based on Enemy Tag knowledge.

---

## 3. ☯️ Elemental & Difficulty Balancing
Combine the "Flow State" theory with the rigid "Wu Xing" laws.

### The Elemental Cycle (Wu Xing)
**Metal(金) > Wood(木) > Earth(土) > Water(水) > Fire(火) > Metal(金)**

### Balancing Multipliers
* **Flow State Goal**: The player should feel smart for using the cycle, but not helpless if they ignore it.
    * **Advantage (+50%)**: Rewarding smart play.
    * **Disadvantage (-25%)**: Punishing brute force, but not blocking it completely.
    * **Resonance**: 3+ Laws of same element = Passive Field Effect (e.g., "Burning Ground").

### Difficulty Curve
* **Mortal Realm (Levels 1-10)**: High tolerance for mistakes. Focus on teaching the Cycle.
* **Tribulation Realm (Bosses)**: Strict elemental checks.
    * *Anti-Pattern*: Do not create enemies immune to ALL elements. Always leave a weakness.

---

## 4. 📝 Lore Integration & Progression
Merge narrative flavor with game progression systems.

### Text Style Guide (Immersion)
* **Do Not Use**: "Mana", "Level Up", "Magic", "Spell".
* **Do Use**: "Qi (气)", "Breakthrough (突破)", "Dao Law (道法)", "Technique (神通)".
* **Example**: Instead of "Heal 10 HP", use "Circulate Qi to recover 10 Vitality".

### Progression Pacing
* **Realms as Milestones**:
    1.  **Mortal (凡尘)**: 1-3重. Basic card drafting.
    2.  **Defier (逆命)**: 4-6重. Unlocks "Flying Dagger" or special relic slots.
    3.  **Tribulation (渡劫)**: 7-9重. Requires managing "Heavenly Thunder" (Risk mechanic).

---

## 5. Design Anti-Patterns (What NOT to do)
| ❌ Don't | ✅ Do |
|----------|-------|
| **Polish before Fun** | Prototype the "Fusion" mechanic with plain text before adding particles. |
| **Flat Math** | Don't just increase enemy HP by 10%. Add new "Intents" or "Laws". |
| **Lore Breaking** | Fire should never defeat Water, even if the card is Legendary. Respect the Wu Xing. |
| **Overwhelming Choice** | Don't unlock all 12 Sealed Slots at once. Pace the unsealing. |