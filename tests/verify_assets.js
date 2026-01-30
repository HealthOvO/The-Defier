const fs = require('fs');
const path = require('path');

const assets = [
    'assets/images/realms/realm_bg_1.webp',
    'assets/images/realms/realm_bg_2.webp',
    'assets/images/realms/realm_bg_3.webp',
    'assets/images/enemies/boss_banditLeader.webp',
    'assets/images/enemies/boss_demonWolf.webp',
    'assets/images/enemies/boss_swordElder.webp'
];

let allExist = true;
assets.forEach(asset => {
    const fullPath = path.join(process.cwd(), asset);
    if (fs.existsSync(fullPath)) {
        console.log(`[OK] Found: ${asset}`);
    } else {
        console.error(`[MISSING] ${asset}`);
        allExist = false;
    }
});

if (allExist) {
    console.log('All assets verified.');
} else {
    process.exit(1);
}
