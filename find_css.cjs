const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (let file of list) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file));
    } else if (file.endsWith('.css')) {
      results.push(file);
    }
  }
  return results;
}

const files = getFiles('css');

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const blocks = content.split('}');
  
  let lineCount = 1;
  for (const block of blocks) {
    const newlines = (block.match(/\n/g) || []).length;
    
    if (block.includes('justify-content: center') && (block.includes('overflow-y: auto') || block.includes('overflow: auto') || block.includes('overflow-y: scroll') || block.includes('overflow-x: auto'))) {
      console.log(`${file}:`);
      console.log(block + '}');
      console.log('---');
    }
    lineCount += newlines;
  }
}
