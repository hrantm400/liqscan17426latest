const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\hrant\\Desktop\\rsibiassupere\\liquidityscan-web\\frontend\\src';

// Regex patterns to match standalone text colors that don't already have dark: or light: prefixes
// We need to be careful with regex to match word boundaries and exclude those preceded by dark: or light:
const replacements = [
    // text-gray-300 -> dark:text-gray-300 light:text-slate-600
    { rx: /(?<!dark:|light:)\btext-gray-300\b/g, replacement: 'dark:text-gray-300 light:text-slate-600' },
    // text-gray-400 -> dark:text-gray-400 light:text-slate-500
    { rx: /(?<!dark:|light:)\btext-gray-400\b/g, replacement: 'dark:text-gray-400 light:text-slate-500' },
    // text-gray-500 -> dark:text-gray-500 light:text-slate-500
    { rx: /(?<!dark:|light:)\btext-gray-500\b/g, replacement: 'dark:text-gray-500 light:text-slate-500' },
    // text-gray-600 -> dark:text-gray-600 light:text-slate-400
    { rx: /(?<!dark:|light:)\btext-gray-600\b/g, replacement: 'dark:text-gray-600 light:text-slate-400' },

    // bg-surface-dark/50 -> dark:bg-surface-dark/50 light:bg-white/50
    { rx: /(?<!dark:|light:)\bbg-surface-dark\/50\b/g, replacement: 'dark:bg-surface-dark/50 light:bg-white/50' },
    // bg-surface-dark -> dark:bg-surface-dark light:bg-white
    { rx: /(?<!dark:|light:)\bbg-surface-dark\b(?!\/)/g, replacement: 'dark:bg-surface-dark light:bg-white' },
];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

let changedCount = 0;
const files = walk(srcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let hasChanges = false;

    replacements.forEach(rule => {
        if (rule.rx.test(content)) {
            content = content.replace(rule.rx, rule.replacement);
            hasChanges = true;
        }
    });

    if (hasChanges) {
        fs.writeFileSync(file, content, 'utf8');
        changedCount++;
        console.log(`Updated: ${file.replace(srcDir, '')}`);
    }
});

console.log(`\nSuccessfully applied contrast fixes to ${changedCount} files.`);
