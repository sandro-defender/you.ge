// version.js
window.APP_VERSION = {
  "main-version": "0.0.1"
}; 

/*
 * VERSION MANAGEMENT SYSTEM
 * -------------------------
 * 
 * This file contains the application version information.
 * 
 * CHANGES MADE:
 * - Converted from JSON to JavaScript format for better compatibility with InfinityFree hosting
 * - Version is now defined as a global variable (window.APP_VERSION) instead of a JSON object
 * 
 * HOW TO UPDATE VERSION:
 * 1. Change the "main-version" value in this file
 * 2. Upload the updated file to the server
 * 3. Users will be prompted to update when they detect the new version
 * 
 * COMPATIBILITY:
 * - Works with all hosting providers that support JavaScript files
 * - No CORS issues since it's loaded from the same domain
 * - Cache-busting is handled by adding a timestamp parameter to the script URL
 */ 