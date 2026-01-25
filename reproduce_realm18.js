// Simulate minimal Player class
const FATE_RING = { paths: {} };
class Player {
    constructor() {
        this.realm = 18;
        this.maxHp = 100;
        this.baseEnergy = 4;
        this.drawCount = 5;
        this.maxCooldown = 10;
        this.skillCooldown = 0;
        this.fateRing = { path: null };
        this.permaBuffs = {};
    }

    recalculateStats() {
        let newMaxHp = 100; // Base
        let newBaseEnergy = 4;
        let newDrawCount = 5;

        // Realm 18 logic copy-pasted from player.js
        if (this.realm === 18) {
            newMaxHp = Math.floor(newMaxHp * 0.5);
            newBaseEnergy = Math.max(1, Math.floor(newBaseEnergy * 0.5));
            newDrawCount = Math.max(1, Math.floor(newDrawCount * 0.5));
        }

        this.maxHp = newMaxHp;
        this.baseEnergy = newBaseEnergy;
        this.drawCount = newDrawCount;
    }
}

const p = new Player();
p.recalculateStats();
console.log('HP:', p.maxHp);
console.log('Energy:', p.baseEnergy);
console.log('Draw:', p.drawCount);
console.log('MaxCooldown:', p.maxCooldown);
