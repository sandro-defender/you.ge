#!/usr/bin/env node

/**
 * HTML Build Script
 * This script updates the version number in workbox-service-worker.js
 * It does NOT copy files to a dist directory anymore.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SERVICE_WORKER_FILE = 'workbox-service-worker.js';

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
 * Update version in workbox-service-worker.js
 */
function updateServiceWorkerVersion() {
    const filePath = path.join(__dirname, SERVICE_WORKER_FILE);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: ${SERVICE_WORKER_FILE} not found!`);
        process.exit(1);
    }

    // Read the file
    let content = fs.readFileSync(filePath, 'utf8');

    // Get new version
    const version = getVersionTimestamp();

    // Replace const VERSION = '...'; with new version
    // This regex matches: const VERSION = 'anything'; or "anything";
    // We use ^\s* to ensure it's the start of the line (ignoring whitespace) to avoid matching comments
    const regex = /^\s*const VERSION = ['"].*['"];/m;

    if (regex.test(content)) {
        content = content.replace(regex, `const VERSION = '${version}';`);
        console.log(`   ✅ Updated version to: ${version}`);
    } else {
        console.warn(`   ⚠️ Warning: Could not find "const VERSION = '...';" pattern in ${SERVICE_WORKER_FILE}`);
        // Fallback: try replacing __VERSION__ if it exists (first run)
        if (content.includes('__VERSION__')) {
            content = content.replace('__VERSION__', version);
            console.log(`   ✅ Replaced __VERSION__ with: ${version}`);
        }
    }

    // Write back to file
    fs.writeFileSync(filePath, content, 'utf8');
}

// Main execution
console.log('🔒 Build Script (Version Update Only)\n');
console.log('━'.repeat(50));

updateServiceWorkerVersion();

console.log('━'.repeat(50));
console.log(`\n✨ Version update complete!`);
