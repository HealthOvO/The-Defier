const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function run() {
    console.log('Starting custom production build...');
    
    // Read the original index.html
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // 1. Extract and process JS
    const scriptRegex = /<script\s+src="([^"]+)"[^>]*><\/script>/g;
    const jsFiles = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        jsFiles.push(match[1].split('?')[0]);
    }

    let combinedJs = '';
    for (const file of jsFiles) {
        const filePath = path.resolve(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
            console.log(`Reading JS: ${file}`);
            combinedJs += fs.readFileSync(filePath, 'utf8') + '\n;\n';
        } else {
            console.warn(`Warning: JS file not found: ${file}`);
        }
    }

    console.log('Minifying JS (mangle disabled to protect global variables)...');
    // We disable mangle (variable renaming) and toplevel compression to ensure 
    // all global classes and variables (like 'game', 'Player', 'Utils') remain accessible to each other and HTML.
    const minifiedJs = await minify(combinedJs, { 
        compress: { toplevel: false }, 
        mangle: false 
    });

    const distDir = path.resolve(__dirname, '../dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(distDir, 'bundle.min.js'), minifiedJs.code);
    console.log(`JS Size reduced from ${(combinedJs.length / 1024 / 1024).toFixed(2)} MB to ${(minifiedJs.code.length / 1024 / 1024).toFixed(2)} MB`);

    // 2. Extract and process CSS
    const linkRegex = /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g;
    const cssFiles = [];
    while ((match = linkRegex.exec(html)) !== null) {
        cssFiles.push(match[1].split('?')[0]);
    }

    let combinedCss = '';
    for (const file of cssFiles) {
        const filePath = path.resolve(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
            console.log(`Reading CSS: ${file}`);
            combinedCss += fs.readFileSync(filePath, 'utf8') + '\n';
        }
    }

    console.log('Minifying CSS...');
    const minifiedCss = combinedCss
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
        .replace(/\s+/g, ' ')             // collapse whitespace
        .replace(/\{\s+/g, '{')
        .replace(/\}\s+/g, '}')
        .replace(/;\s+/g, ';')
        .replace(/:\s+/g, ':');
        
    fs.writeFileSync(path.join(distDir, 'bundle.min.css'), minifiedCss);
    console.log(`CSS Size reduced from ${(combinedCss.length / 1024).toFixed(2)} KB to ${(minifiedCss.length / 1024).toFixed(2)} KB`);

    // 3. Generate production HTML
    let prodHtml = html.replace(/<script\s+src="([^"]+)"[^>]*><\/script>\n?/g, '');
    prodHtml = prodHtml.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>\n?/g, '');
    
    prodHtml = prodHtml.replace('</head>', '    <link rel="stylesheet" href="bundle.min.css">\n</head>');
    prodHtml = prodHtml.replace('</body>', '    <script src="bundle.min.js"></script>\n</body>');

    fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml);
    
    // 4. Copy assets directory
    console.log('Copying assets...');
    const { execSync } = require('child_process');
    execSync(`cp -R ${path.resolve(__dirname, '../assets')} ${distDir}/`);

    console.log('Build complete! You can now serve the "dist" directory.');
}

run().catch(console.error);
