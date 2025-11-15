# Chrome Extension

A Chrome extension that displays the Favipong game in your browser's favicon.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this `chrome-extension` folder

## Usage

- The extension automatically connects to the WebSocket server
- Each browser tab gets assigned a unique player number
- Use arrow keys or WASD to control your paddle
- Watch the favicon update with the game in real-time!

## Configuration

The extension defaults to the production server: `wss://favipong.onrender.com`

For local development, override the WebSocket URL:
1. Open any webpage
2. Open browser console (F12)
3. Run: `localStorage.setItem('wsUrl', 'ws://localhost:8080')`
4. Refresh the page

To switch back to production:
- Run: `localStorage.removeItem('wsUrl')` or `localStorage.setItem('wsUrl', 'wss://favipong.onrender.com')`
- Refresh the page

