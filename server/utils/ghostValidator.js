/**
 * Ghost Data Validator
 * Ensures that uploaded ghost data for PVP matches the theoretical limits of the game
 */

const MAX_HP_LIMITS = {
    1: 300,   // Realm 1
    2: 800,   // Realm 2
    3: 2000,  // Realm 3
    4: 5000,  // Realm 4
    5: 12000, // Realm 5
    6: 30000, // Realm 6
    7: 80000, // Realm 7
    8: 200000, // Realm 8
    9: 500000 // Realm 9
};

function validateGhostData(realm, ghostData) {
    if (!ghostData || typeof ghostData !== 'object') {
        return { valid: false, reason: 'Invalid payload structure' };
    }

    // 1. Basic Structure Validation
    if (!ghostData.name || !ghostData.maxHp || !ghostData.deck) {
        return { valid: false, reason: 'Missing core attributes (name, maxHp, deck)' };
    }

    // 2. Stat Limits Validation
    const realmLimit = MAX_HP_LIMITS[realm] || 999999;
    if (ghostData.maxHp > realmLimit * 1.5) { // 1.5x buffer for extreme builds
        return { valid: false, reason: `MaxHP ${ghostData.maxHp} exceeds theoretical limit for realm ${realm}` };
    }

    if (ghostData.hp > ghostData.maxHp) {
        return { valid: false, reason: 'Current HP exceeds Max HP' };
    }

    // 3. Deck Validation
    if (!Array.isArray(ghostData.deck)) {
        return { valid: false, reason: 'Deck must be an array' };
    }

    if (ghostData.deck.length > 60) {
        return { valid: false, reason: 'Deck size exceeds absolute maximum (60)' };
    }

    // 4. Content Validation (Basic checks)
    const invalidCards = ghostData.deck.filter(c => typeof c !== 'object' || !c.id);
    if (invalidCards.length > 0) {
        return { valid: false, reason: 'Deck contains invalid card formats' };
    }

    return { valid: true };
}

module.exports = {
    validateGhostData
};
