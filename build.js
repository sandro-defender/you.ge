#!/usr/bin/env node

/**
 * HTML Build Script
 * This script processes HTML files and updates version numbers
 * Automatically includes all files except those in IGNORE_LIST
 */

const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = 'dist';

const IGNORE_LIST = [
    '.git',
    '.gitignore',
    'node_modules',
    OUTPUT_DIR,
    'build.js',
    'package.json',
    'package-lock.json',
    '.DS_Store',
    '.gemini'
];

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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
function processServiceWorker(srcPath, destPath) {
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
 * Recursively process directory
 */
function processDirectory(currentDir, relativePath = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
        const entryName = entry.name;
        const entryPath = path.join(currentDir, entryName);
        const entryRelativePath = path.join(relativePath, entryName);

        // Check ignore list
        if (IGNORE_LIST.includes(entryName)) {
            continue;
        }

        const destPath = path.join(__dirname, OUTPUT_DIR, entryRelativePath);

        if (entry.isDirectory()) {
            // Create directory in dist
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            // Recurse
            processDirectory(entryPath, entryRelativePath);
        } else {
            // Ensure parent directory exists
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            // Special handling for service worker
            if (entryName === 'workbox-service-worker.js') {
                processServiceWorker(entryPath, destPath);
            } else {
                // Copy file
                fs.copyFileSync(entryPath, destPath);
                console.log(`   ✅ Copied: ${entryRelativePath}`);
            }
        }
    }
}

// Main execution
console.log('🔒 HTML Build Script\n');
console.log('━'.repeat(50));

console.log('📦 Scanning and processing files...');
processDirectory(__dirname);

console.log('━'.repeat(50));
console.log(`\n✨ Build complete! Files are in: ${OUTPUT_DIR}/`);
