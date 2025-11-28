# HTML Obfuscation for Cloudflare Pages

This repository includes an HTML obfuscation build system that encodes your HTML files to make them unreadable in the browser's "View Source" while maintaining full functionality.

## How It Works

The build script (`build-obfuscate.js`) does the following:

1. **Encodes HTML** - Converts your HTML files to Base64 encoding
2. **Splits into chunks** - Breaks the encoded data into smaller pieces to make manual decoding harder
3. **Wraps in JavaScript** - Creates a self-decoding wrapper that automatically decodes and renders the HTML when the page loads
4. **Obfuscates variable names** - Uses random variable names to make the code harder to understand

## Usage

### Building Obfuscated Files

Run the build script to create obfuscated versions of your HTML files:

```bash
npm run build
```

This will:
- Create a `dist/` directory
- Generate obfuscated versions of all HTML files
- Copy all other files (images, CSS, JS, etc.) to `dist/`

### Deploying to Cloudflare Pages

#### Option 1: Manual Deployment (Recommended for Testing)

1. Build the obfuscated files: `npm run build`
2. Go to your Cloudflare Pages dashboard
3. Upload the contents of the `dist/` directory

#### Option 2: Automated GitHub Deployment

Update your Cloudflare Pages build settings:

1. Go to Cloudflare Pages → Your Project → Settings → Builds & deployments
2. Set the following:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (or leave empty)

Now every time you push to GitHub, Cloudflare will:
1. Run `npm run build`
2. Deploy the obfuscated files from the `dist/` directory

## What Gets Obfuscated

The following HTML files are obfuscated:
- `index.html`
- `index-new.html`
- `index-or.html`
- `html/403.html`
- `html/404.html`
- `html/500.html`
- `html/prompt.html`

## Security Note

⚠️ **Important**: This obfuscation makes your HTML source code **harder to read**, but it's **not true encryption**. Anyone with enough technical knowledge can still decode it. This is suitable for:

- Discouraging casual users from viewing source
- Making it harder to copy your code
- Adding a basic layer of protection

For truly sensitive data, use server-side protection or authentication.

## Testing Locally

To test the obfuscated files locally:

```bash
# Build the files
npm run build

# Serve the dist directory with a local server
cd dist
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000 in your browser and check "View Source" - you'll see the obfuscated code!

## Cleaning Build Files

To remove the `dist/` directory:

```bash
npm run clean
```

## Files Modified

- `build-obfuscate.js` - The obfuscation build script
- `package.json` - NPM scripts for building
- `.gitignore` - Excludes `dist/` from version control
- `_headers` - Updated with compression headers
