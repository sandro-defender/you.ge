#!/usr/bin/env node

/**
 * HTML Build Script
 * This script processes HTML files and updates version numbers
 */

const fs = require('fs');
const path = require('path');

// Configuration
const HTML_FILES = [
    'index.html',
    'index-new.html',
    'index-or.html',
    'html/403.html',
    'html/404.html',
    'html/500.html',
    'html/prompt.html'
];

const OUTPUT_DIR = 'dist'; // Output directory for files

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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

    // Write to output directory
    const outputPath = path.join(__dirname, OUTPUT_DIR, filePath);
    const outputDir = path.dirname(outputPath);

    // Create subdirectories if needed
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, htmlContent, 'utf8');

    console.log(`   ✅ Copied: ${filePath}`);
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
console.log('🔒 HTML Build Script\n');
console.log('━'.repeat(50));

// Process all HTML files
HTML_FILES.forEach(processFile);

// Copy other files
copyOtherFiles();

console.log('━'.repeat(50));
console.log(`\n✨ Build complete! Files are in: ${OUTPUT_DIR}/`);
