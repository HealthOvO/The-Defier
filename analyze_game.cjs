const fs = require('fs');

const code = fs.readFileSync('js/game.js', 'utf8');
const lines = code.split('\n');

const methods = [];
let currentMethod = null;
let braceCount = 0;
let startLine = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!currentMethod) {
        const match = line.match(/^    ([a-zA-Z0-9_]+)\(/);
        if (match) {
            currentMethod = match[1];
            startLine = i;
            braceCount = 0;
        }
    }
    
    if (currentMethod) {
        for (let char of line) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
        }
        
        if (braceCount === 0 && (i > startLine || line.includes('}'))) {
            methods.push({
                name: currentMethod,
                lines: i - startLine + 1
            });
            currentMethod = null;
        }
    }
}

methods.sort((a, b) => b.lines - a.lines);
console.log("Top 30 largest methods in game.js:");
methods.slice(0, 30).forEach(m => console.log(`${m.name}: ${m.lines} lines`));
