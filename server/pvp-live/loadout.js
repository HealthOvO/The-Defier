const crypto = require('crypto');
const { RULE_VERSION, RULES } = require('./engine/rules');

const LOADOUT_NORMALIZATION_VERSION = 'pvp-live-loadout-v1';
const DEFAULT_IDENTITY_SLOT = 'balanced';
const DEFAULT_LOADOUT_LABEL = '默认斗法谱';

class PvpLoadoutValidationError extends Error {
    constructor(reason, message) {
        super(message || reason);
        this.name = 'PvpLoadoutValidationError';
        this.code = 'loadout_illegal';
        this.reason = reason || 'loadout_illegal';
    }
}

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeDefaultDeck() {
    const deck = ['pvp_burst', 'pvp_strike', 'pvp_guard'];
    const pattern = ['pvp_strike', 'pvp_guard', 'pvp_strike', 'pvp_burst'];
    for (let index = 0; deck.length < 20; index += 1) {
        deck.push(pattern[index % pattern.length]);
    }
    return deck.map(id => ({ id, upgraded: false }));
}

function cleanShortText(value, fallback, maxLength = 40) {
    const text = typeof value === 'string' ? value.trim() : '';
    return (text || fallback).slice(0, maxLength);
}

function getLegalCardsHash() {
    const ids = Object.keys(RULES.cards || {}).sort();
    return crypto.createHash('sha256')
        .update(JSON.stringify({ ruleVersion: RULE_VERSION, ids }))
        .digest('hex')
        .slice(0, 16);
}

function normalizeDeck(rawDeck) {
    const deck = Array.isArray(rawDeck) ? rawDeck : makeDefaultDeck();
    if (deck.length !== 20) {
        throw new PvpLoadoutValidationError('invalid_deck_size', '斗法谱必须正好 20 张');
    }
    return deck.map((entry, index) => {
        const id = typeof entry === 'string' ? entry.trim() : entry && typeof entry.id === 'string' ? entry.id.trim() : '';
        const definition = RULES.cards[id];
        if (!definition) {
            throw new PvpLoadoutValidationError('loadout_card_not_legal', `斗法谱包含非法卡牌: ${id || index}`);
        }
        if (Math.floor(Number(definition.cost) || 0) <= 0) {
            throw new PvpLoadoutValidationError('loadout_zero_cost_card', `斗法谱包含 0 费卡牌: ${id}`);
        }
        return {
            id,
            upgraded: !!(entry && typeof entry === 'object' && entry.upgraded)
        };
    });
}

function makeLoadoutHash(snapshotInput) {
    return crypto.createHash('sha256')
        .update(JSON.stringify(snapshotInput))
        .digest('hex')
        .slice(0, 24);
}

function normalizeLoadoutSnapshot(loadoutInput = {}, { now = () => Date.now(), ruleVersion = RULE_VERSION } = {}) {
    const source = loadoutInput && typeof loadoutInput === 'object' && !Array.isArray(loadoutInput) ? loadoutInput : {};
    const deck = normalizeDeck(source.deck);
    const identitySlot = cleanShortText(source.identitySlot, DEFAULT_IDENTITY_SLOT, 32);
    const label = cleanShortText(source.label, DEFAULT_LOADOUT_LABEL, 40);
    const legalCardsHash = getLegalCardsHash();
    const hashPayload = {
        normalizationVersion: LOADOUT_NORMALIZATION_VERSION,
        ruleVersion,
        legalCardsHash,
        identitySlot,
        deck
    };
    const loadoutHash = makeLoadoutHash(hashPayload);
    return {
        ...hashPayload,
        loadoutHash,
        label,
        deckSize: deck.length,
        locked: true,
        lockedAt: Math.max(0, Math.floor(Number(now()) || Date.now()))
    };
}

function publicLoadoutSummary(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        loadoutHash: snapshot.loadoutHash || '',
        label: snapshot.label || DEFAULT_LOADOUT_LABEL,
        identitySlot: snapshot.identitySlot || DEFAULT_IDENTITY_SLOT,
        deckSize: Math.max(0, Math.floor(Number(snapshot.deckSize) || (Array.isArray(snapshot.deck) ? snapshot.deck.length : 0))),
        ruleVersion: snapshot.ruleVersion || RULE_VERSION,
        normalizationVersion: snapshot.normalizationVersion || LOADOUT_NORMALIZATION_VERSION,
        legalCardsHash: snapshot.legalCardsHash || '',
        locked: snapshot.locked !== false
    };
}

function cloneLoadoutSnapshot(snapshot) {
    return cloneData(snapshot || normalizeLoadoutSnapshot());
}

module.exports = {
    LOADOUT_NORMALIZATION_VERSION,
    PvpLoadoutValidationError,
    normalizeLoadoutSnapshot,
    publicLoadoutSummary,
    cloneLoadoutSnapshot,
    makeDefaultDeck
};
