const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const t = require('@babel/types');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

const jsDir = path.resolve(__dirname, 'js');
const allFiles = [];

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.js') && !/bmob\.config(\.example)?\.js$/.test(fullPath)) {
            allFiles.push(fullPath);
        }
    }
}
walkDir(jsDir);

// 1. Replace `window.XXX` with `XXX` using regex to make them standard Identifiers
// EXCEPT for standard DOM window properties
const DOM_PROPS = new Set([
    'innerWidth', 'innerHeight', 'location', 'scrollTo', 'addEventListener', 
    'removeEventListener', 'getComputedStyle', 'localStorage', 'sessionStorage', 
    'fetch', 'setTimeout', 'setInterval', 'crypto', 'document', 'console'
]);

for (const file of allFiles) {
    let code = fs.readFileSync(file, 'utf8');
    // regex to match window.XXX where XXX is not a DOM prop
    code = code.replace(/window\.([a-zA-Z0-9_]+)/g, (match, p1) => {
        if (DOM_PROPS.has(p1) || p1 === '__THE_DEFIER_CONFIG__') return match;
        return p1;
    });
    fs.writeFileSync(file, code, 'utf8');
}

// 2. Build Symbol Registry
const symbolRegistry = new Map();

for (const file of allFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const ast = babel.parseSync(code, { sourceType: 'module', filename: file });

    traverse(ast, {
        Program(path) {
            path.get('body').forEach(stmt => {
                if (stmt.isVariableDeclaration()) {
                    stmt.node.declarations.forEach(decl => {
                        if (t.isIdentifier(decl.id)) symbolRegistry.set(decl.id.name, file);
                    });
                } else if (stmt.isFunctionDeclaration()) {
                    if (stmt.node.id) symbolRegistry.set(stmt.node.id.name, file);
                } else if (stmt.isClassDeclaration()) {
                    if (stmt.node.id) symbolRegistry.set(stmt.node.id.name, file);
                } else if (stmt.isExportNamedDeclaration()) {
                    if (stmt.node.declaration) {
                        if (stmt.node.declaration.type === 'VariableDeclaration') {
                            stmt.node.declaration.declarations.forEach(decl => {
                                if (t.isIdentifier(decl.id)) symbolRegistry.set(decl.id.name, file);
                            });
                        } else if (stmt.node.declaration.id) {
                            symbolRegistry.set(stmt.node.declaration.id.name, file);
                        }
                    }
                    stmt.node.specifiers.forEach(spec => {
                        if (t.isIdentifier(spec.exported)) symbolRegistry.set(spec.exported.name, file);
                    });
                }
            });
        }
    });
}

// Add special handling for things we know are defined in specific files
// just in case they are inside IIFEs or something
symbolRegistry.set('BackendClient', path.join(jsDir, 'services/backend-client.js'));
symbolRegistry.set('TheDefierBackendClient', path.join(jsDir, 'services/backend-client.js'));

// 3. Transform AST
for (const file of allFiles) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Quick cleanup of any window.XXX = XXX leftovers that might be just `XXX = XXX` now
    code = code.replace(/^([a-zA-Z0-9_]+)\s*=\s*\1;$/gm, '');

    const ast = babel.parseSync(code, { sourceType: 'module', filename: file });
    const neededImports = new Map();
    const definedHere = new Set();

    traverse(ast, {
        Program(path) {
            path.get('body').forEach(stmt => {
                if (stmt.isVariableDeclaration() || stmt.isFunctionDeclaration() || stmt.isClassDeclaration()) {
                    // Export it
                    let idNames = [];
                    if (stmt.isVariableDeclaration()) {
                        stmt.node.declarations.forEach(d => { if (t.isIdentifier(d.id)) idNames.push(d.id.name); });
                    } else if (stmt.node.id) {
                        idNames.push(stmt.node.id.name);
                    }
                    
                    idNames.forEach(n => definedHere.add(n));
                    stmt.replaceWith(t.exportNamedDeclaration(stmt.node));
                } else if (stmt.isExportNamedDeclaration()) {
                    if (stmt.node.declaration) {
                        if (stmt.node.declaration.type === 'VariableDeclaration') {
                            stmt.node.declaration.declarations.forEach(d => { if (t.isIdentifier(d.id)) definedHere.add(d.id.name); });
                        } else if (stmt.node.declaration.id) {
                            definedHere.add(stmt.node.declaration.id.name);
                        }
                    }
                    stmt.node.specifiers.forEach(s => definedHere.add(s.exported.name));
                }
            });
        },
        Identifier(path) {
            if (path.isReferencedIdentifier()) {
                const name = path.node.name;
                if (DOM_PROPS.has(name) || name === 'window' || name === 'document' || name === 'Math' || name === 'console' || name === 'Date' || name === 'JSON' || name === 'Object' || name === 'Array' || name === 'Promise' || name === 'Error' || name === 'String' || name === 'Number' || name === 'Boolean' || name === 'Map' || name === 'Set' || name === 'global' || name === 'globalThis' || name === 'module' || name === 'exports' || name === 'require') return;
                
                if (path.scope.hasBinding(name)) return;
                
                if (symbolRegistry.has(name)) {
                    const sourceFile = symbolRegistry.get(name);
                    if (sourceFile !== file) {
                        if (!neededImports.has(sourceFile)) neededImports.set(sourceFile, new Set());
                        neededImports.get(sourceFile).add(name);
                    }
                }
            }
        }
    });

    const importNodes = [];
    for (const [sourceFile, symbols] of neededImports.entries()) {
        let relPath = path.relative(path.dirname(file), sourceFile);
        if (!relPath.startsWith('.')) relPath = './' + relPath;
        relPath = relPath.replace(/\\/g, '/');
        
        const specifiers = Array.from(symbols).map(sym => t.importSpecifier(t.identifier(sym), t.identifier(sym)));
        importNodes.push(t.importDeclaration(specifiers, t.stringLiteral(relPath)));
    }

    if (importNodes.length > 0) {
        ast.program.body.unshift(...importNodes);
    }

    const output = generate(ast, {}, code);
    fs.writeFileSync(file, output.code, 'utf8');
}
console.log('Migration completed!');
