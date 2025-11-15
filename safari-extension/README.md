# Safari Extension

A Safari extension that displays the Favipong game in your browser's favicon.

## Requirements

- Safari 14.0 or later (macOS Big Sur or later)
- Xcode (for building the extension)

## Building and Installation

Safari Web Extensions need to be built using Xcode. Here's how to set it up:

### Option 1: Using Xcode (Recommended for Distribution)

1. **Create an Xcode Project:**
   - Open Xcode
   - Create a new project → macOS → App
   - Name it "FavipongExtension"
   - Choose a location and create the project

2. **Add Extension Target:**
   - In Xcode, go to File → New → Target
   - Select "Safari Extension App"
   - Name it "FavipongExtension"
   - Make sure "Include Share Extension" is unchecked

3. **Copy Extension Files:**
   - Copy all files from this `safari-extension` folder to the extension target folder in your Xcode project
   - Make sure `manifest.json`, `background.js`, and `content.js` are included in the extension target

4. **Build and Run:**
   - Select the app target (not the extension)
   - Build and run the app (⌘R)
   - The app will launch and you can enable the extension in Safari

5. **Enable Extension in Safari:**
   - Open Safari → Preferences → Extensions
   - Enable "FavipongExtension"
   - Grant necessary permissions

### Option 2: Using Safari's Developer Tools (For Testing)

1. **Enable Developer Menu:**
   - Safari → Preferences → Advanced
   - Check "Show Develop menu in menu bar"

2. **Load Extension:**
   - Develop → Show Extension Builder
   - Click "+" → Add Extension
   - Select this `safari-extension` folder
   - Click "Run" to test the extension

## Usage

- The extension automatically connects to the WebSocket server
- Each browser tab gets assigned a unique player number
- Use arrow keys or WASD to control your paddle
- Watch the favicon update with the game in real-time!

## Configuration

The extension defaults to the production server: `wss://favipong.onrender.com`

For local development, override the WebSocket URL:
1. Open any webpage
2. Open browser console (⌥⌘C)
3. Run: `localStorage.setItem('wsUrl', 'ws://localhost:8080')`
4. Refresh the page

To switch back to production:
- Run: `localStorage.removeItem('wsUrl')` or `localStorage.setItem('wsUrl', 'wss://favipong.onrender.com')`
- Refresh the page

## Notes

- Safari Web Extensions use the Web Extensions API (similar to Chrome)
- The extension uses the `browser` namespace for better Safari compatibility
- Requires Safari 14+ (macOS Big Sur or later)

