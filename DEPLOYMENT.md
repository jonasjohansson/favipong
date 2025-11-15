# Deployment Notes

## Render.com Configuration

- **Service Name**: favipong
- **URL**: https://favipong.onrender.com
- **WebSocket URL**: wss://favipong.onrender.com

## Render.com Setup

1. **Service Type**: Web Service
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. **Environment**: Node.js
5. **Health Check**: `/healthz` endpoint

## Extension Configuration

The extension defaults to production URL: `wss://favipong.onrender.com`

To override for local development:
```javascript
localStorage.setItem('wsUrl', 'ws://localhost:8080')
```

To reset to production:
```javascript
localStorage.removeItem('wsUrl')
```

## After Migration

All paths are relative and portable. The project should work the same after moving to GitHub.

Key files:
- `server.js` - WebSocket server (uses `process.env.PORT`)
- `content.js` - Extension content script (uses configurable WS_URL)
- `manifest.json` - Chrome extension manifest
- `package.json` - Node.js dependencies

