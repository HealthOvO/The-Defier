const fs = require('fs');
const path = require('path');

// 1. Load Character Data
const charDataPath = path.join(__dirname, '../js/data/characters.js');
const charDataContent = fs.readFileSync(charDataPath, 'utf8');

// Mock context to eval the file
const mockContext = {};
// We need to execute the file content. 
// Since characters.js is "const CHARACTERS = ...", we can eval it and get CHARACTERS.
// But "const" restricts scope. Let's replace "const " with "global." or just use logic to extract.
// Simple Eval wrapper
eval(charDataContent.replace('const CHARACTERS', 'global.CHARACTERS'));

if (!global.CHARACTERS) {
    console.error("❌ Failed to load CHARACTERS data.");
    process.exit(1);
}

console.log("✅ CHARACTERS data loaded.");

// 2. Define the exact logic we implemented in game.js
function resolveAvatar(char) {
    return char.image || char.portrait || (char.avatar && char.avatar.includes('/') ? char.avatar : null);
}

// 3. Test Cases
const testCases = [
    { id: 'linFeng', expectedType: 'image', desc: 'Lin Feng should have an image' },
    { id: 'xiangYe', expectedType: 'image', desc: 'Xiang Ye should have an image' },
    { id: 'wuYu', expectedType: 'image', desc: 'Wu Yu should have a portrait (handled as image)' },
    { id: 'yanHan', expectedType: 'image', desc: 'Yan Han should have an avatar path (handled as image)' }
];

let errors = [];

console.log("---------------------------------------------------");
console.log("🧪 Verifying Character Avatar Logic");
console.log("---------------------------------------------------");

testCases.forEach(test => {
    const char = global.CHARACTERS[test.id];
    if (!char) {
        console.error(`❌ Character not found: ${test.id}`);
        errors.push(`Missing character: ${test.id}`);
        return;
    }

    const resolvedPath = resolveAvatar(char);
    const hasImage = !!resolvedPath;

    // Check if file actually exists if we found a path
    let fileExists = false;
    if (hasImage) {
        const absolutePath = path.join(__dirname, '../', resolvedPath);
        fileExists = fs.existsSync(absolutePath);
    }

    console.log(`[${test.id}]`);
    console.log(`   Logic Path: ${resolvedPath || 'None (Emoji Fallback)'}`);

    if (test.expectedType === 'image') {
        if (!hasImage) {
            console.error(`   ❌ FAILED: Expected image path, got null/emoji.`);
            errors.push(`${test.id}: Logic failed to resolve image.`);
        } else if (!fileExists) {
            console.error(`   ❌ FAILED: Image path resolved but file not found on disk: ${resolvedPath}`);
            errors.push(`${test.id}: File missing: ${resolvedPath}`);
        } else {
            console.log(`   ✅ PASS: Resolved to ${resolvedPath}`);
        }
    }
});

console.log("---------------------------------------------------");

if (errors.length > 0) {
    console.error(`❌ Verification Failed with ${errors.length} errors.`);
    process.exit(1);
} else {
    console.log("✅ All Avatar Checks Passed!");
    process.exit(0);
}
