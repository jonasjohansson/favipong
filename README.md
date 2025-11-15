# Favicon WebSocket Game

A WebSocket-based multiplayer Pong game that runs in the browser favicon! Players are assigned to red or blue teams, and the game is distributed across multiple browser tabs.

## Local Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the WebSocket server:**
   ```bash
   npm start
   ```
   The server will run on `ws://localhost:8080`

3. **Load the Chrome extension:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the root folder of this project (the folder containing `manifest.json`)

4. **Test it:**
   - Open multiple browser windows/tabs
   - Each window will connect to the server and receive a unique number
   - Watch the favicon update with the game!

## Deployment to Render.com

### Server Deployment

1. **Push your code to GitHub** (if not already done)

2. **Create a new Web Service on Render.com:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select this repository

3. **Configure the service:**
   - **Name**: `favicon-pong-game` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free tier works fine

4. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically build and deploy your server
   - Service URL: `https://favipong.onrender.com`
   - WebSocket URL: `wss://favipong.onrender.com`

### Extension Configuration

The extension is pre-configured to use the production server at `wss://favipong.onrender.com`.

**For local development**, you can override the WebSocket URL:
1. Open any webpage
2. Open browser console (F12)
3. Run: `localStorage.setItem('wsUrl', 'ws://localhost:8080')`
4. Refresh the page

**To switch back to production:**
- Run: `localStorage.removeItem('wsUrl')` or `localStorage.setItem('wsUrl', 'wss://favipong.onrender.com')`
- Refresh the page

## How it works

- **Server (`server.js`)**: WebSocket server that manages game state, tracks players, handles collisions, and scores
- **Extension Background Script (`background.js`)**: Handles messages between content scripts and extension
- **Extension Content Script (`content.js`)**: Connects to WebSocket, renders game in favicon, handles keyboard controls
- **Favicon**: A 16x16 canvas that displays your slice of the game world

## Game Features

- **Team-based gameplay**: Players alternate between red and blue teams
- **Distributed rendering**: Each browser tab shows a different slice of the game world
- **Visual warnings**: White lines indicate when the ball is approaching
- **Score tracking**: Title bar shows team scores and player count
- **Score flash effects**: Green flash when your team scores, red when opponent scores

## Project Structure

```
.
├── server.js              # WebSocket server
├── package.json           # Node.js dependencies
├── manifest.json          # Extension manifest
├── background.js          # Service worker for WebSocket
├── content.js             # Content script for favicon updates
├── popup.html             # Extension popup UI
├── popup.js               # Popup script
├── test.html              # Test page
└── README.md              # This file
```

## Features

- Real-time WebSocket connection
- Automatic reconnection on disconnect
- Dynamic favicon updates using canvas
- Multiple browser window support
- Sequential number assignment (1, 2, 3, ...)

