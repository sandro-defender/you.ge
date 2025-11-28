#!/usr/bin/env node

/**
 * HTML Obfuscation Build Script
 * This script encodes HTML files to make them unreadable in the browser's "View Source"
 * while still functioning normally when loaded.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const FILES_TO_OBFUSCATE = [
    'index.html',
    'index-new.html',
    'index-or.html',
    'html/403.html',
    'html/404.html',
    'html/500.html',
    'html/prompt.html'
];

const OUTPUT_DIR = 'dist'; // Output directory for obfuscated files

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Obfuscate HTML content
 * Uses Base64 encoding + JavaScript wrapper to decode at runtime
 */
function obfuscateHTML(htmlContent) {
    // Encode the HTML content to Base64
    const base64Content = Buffer.from(htmlContent).toString('base64');

    // Split into chunks to make it harder to decode manually
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < base64Content.length; i += chunkSize) {
        chunks.push(base64Content.substring(i, i + chunkSize));
    }

    // Create obfuscated variable names
    const varNames = {
        data: '_0x' + Math.random().toString(36).substring(2, 8),
        decode: '_0x' + Math.random().toString(36).substring(2, 8),
        write: '_0x' + Math.random().toString(36).substring(2, 8)
    };

    // Create the self-decoding HTML wrapper
    const obfuscatedHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><script>
(function(){var ${varNames.data}=[${chunks.map(c => `"${c}"`).join(',')}].join('');
var ${varNames.decode}=function(s){try{return atob(s)}catch(e){return''}};
var ${varNames.write}=function(){document.open();document.write(${varNames.decode}(${varNames.data}));document.close()};
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',${varNames.write})}else{${varNames.write}()}})();
</script></head><body></body></html>`;

    return obfuscatedHTML;
}

/**
 * Process a single HTML file
 */
function processFile(filePath) {
    const fullPath = path.join(__dirname, filePath);

    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️  File not found: ${filePath}`);
        return;
    }

    console.log(`📄 Processing: ${filePath}`);

    // Read the original HTML
    const htmlContent = fs.readFileSync(fullPath, 'utf8');

    // Obfuscate it
    const obfuscated = obfuscateHTML(htmlContent);

    // Write to output directory
    const outputPath = path.join(__dirname, OUTPUT_DIR, filePath);
    const outputDir = path.dirname(outputPath);

    // Create subdirectories if needed
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, obfuscated, 'utf8');

    const originalSize = Buffer.from(htmlContent).length;
    const obfuscatedSize = Buffer.from(obfuscated).length;
    const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(1);

    console.log(`   ✅ Obfuscated: ${originalSize} → ${obfuscatedSize} bytes (${ratio}%)`);
}

/**
 * Get current timestamp in Asia/Tbilisi timezone
 * Format: YYYY.MM.DD-HH.MM
 */
function getVersionTimestamp() {
    const date = new Date();

    // Convert to Asia/Tbilisi timezone (UTC+4)
    const tbilisiTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));

    const year = tbilisiTime.getFullYear();
    const month = String(tbilisiTime.getMonth() + 1).padStart(2, '0');
    const day = String(tbilisiTime.getDate()).padStart(2, '0');
    const hours = String(tbilisiTime.getHours()).padStart(2, '0');
    const minutes = String(tbilisiTime.getMinutes()).padStart(2, '0');

    return `${year}.${month}.${day}-${hours}.${minutes}`;
}

/**
 * Process workbox-service-worker.js with version replacement
 */
function processServiceWorker() {
    const srcPath = path.join(__dirname, 'workbox-service-worker.js');
    const destPath = path.join(__dirname, OUTPUT_DIR, 'workbox-service-worker.js');

    if (!fs.existsSync(srcPath)) {
        console.warn('⚠️  workbox-service-worker.js not found');
        return;
    }

    // Read the file
    let content = fs.readFileSync(srcPath, 'utf8');

    // Replace __VERSION__ with timestamp
    const version = getVersionTimestamp();
    content = content.replace(/__VERSION__/g, version);

    // Write to destination
    fs.writeFileSync(destPath, content, 'utf8');

    console.log(`   ✅ Processed service worker with version: ${version}`);
}

/**
 * Copy non-HTML files to dist
 */
function copyOtherFiles() {
    const filesToCopy = [
        '_headers',
        '_redirects',
        '_routes.json',
        'manifest.json',
        'favicon.ico',
        'favicon2.ico',
        'apple-touch-icon.png',
        'README.md'
    ];

    const dirsToCopy = ['img', 'bar'];

    console.log('\n📦 Copying other files...');

    // Process service worker with version replacement
    processServiceWorker();

    // Copy individual files
    filesToCopy.forEach(file => {
        const srcPath = path.join(__dirname, file);
        const destPath = path.join(__dirname, OUTPUT_DIR, file);

        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`   ✅ Copied: ${file}`);
        }
    });

    // Copy directories recursively
    dirsToCopy.forEach(dir => {
        const srcPath = path.join(__dirname, dir);
        const destPath = path.join(__dirname, OUTPUT_DIR, dir);

        if (fs.existsSync(srcPath)) {
            copyDirRecursive(srcPath, destPath);
            console.log(`   ✅ Copied directory: ${dir}`);
        }
    });
}

/**
 * Recursively copy directory
 */
function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Main execution
console.log('🔒 HTML Obfuscation Build Script\n');
console.log('━'.repeat(50));

// Process all HTML files
FILES_TO_OBFUSCATE.forEach(processFile);

// Copy other files
copyOtherFiles();

console.log('━'.repeat(50));
console.log(`\n✨ Build complete! Obfuscated files are in: ${OUTPUT_DIR}/`);
console.log('\n📝 Next steps:');
console.log('   1. Review the files in the dist/ directory');
console.log('   2. Deploy the dist/ directory to Cloudflare Pages');
console.log('   3. Your HTML source will be unreadable in "View Source"\n');
