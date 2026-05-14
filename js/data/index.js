export { ENEMIES, ENEMY_ECOLOGY_TEMPLATES, CHAPTER_ELITE_COMBOS } from './enemies.js';
export { CARDS } from './cards.js';
export { TREASURES } from './treasures.js';
export { CHARACTERS } from './characters.js';

// Attach to window temporarily to not break legacy code that hasn't been migrated yet
import { ENEMIES, ENEMY_ECOLOGY_TEMPLATES, CHAPTER_ELITE_COMBOS } from './enemies.js';
import { CARDS } from './cards.js';
import { TREASURES } from './treasures.js';
import { CHARACTERS } from './characters.js';

if (typeof window !== 'undefined') {
    window.ENEMIES = ENEMIES;
    window.ENEMY_ECOLOGY_TEMPLATES = ENEMY_ECOLOGY_TEMPLATES;
    window.CHAPTER_ELITE_COMBOS = CHAPTER_ELITE_COMBOS;
    window.CARDS = CARDS;
    window.TREASURES = TREASURES;
    window.CHARACTERS = CHARACTERS;
}
