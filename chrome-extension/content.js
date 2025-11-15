// ========== CONFIGURATION ==========
// WebSocket URL - defaults to production URL (favipong.onrender.com)
// For local development, set via localStorage: localStorage.setItem('wsUrl', 'ws://localhost:8080')
// Production URL: wss://favipong.onrender.com
const WS_URL = (() => {
  // Check localStorage first (for runtime configuration/override)
  if (typeof localStorage !== "undefined" && localStorage.getItem("wsUrl")) {
    return localStorage.getItem("wsUrl");
  }
  // Default to production Render.com URL
  return "wss://favipong.onrender.com";
})();
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 2000; // ms
const PADDLE_MOVE_INTERVAL = 50; // ms (slower paddle movement)

// Canvas settings
const CANVAS_WIDTH = 16;
const CANVAS_HEIGHT = 16;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;

// Visual settings
const BALL_COLOR = "#FFFFFF";
const BACKGROUND_COLOR = "#000000";
const TEAM_RED_COLOR = "#FF4444";
const TEAM_BLUE_COLOR = "#4444FF";
const WARNING_LINE_COLOR = "rgba(255, 255, 255, ";
const SCORE_FLASH_GREEN = "#00FF00";
const SCORE_FLASH_RED = "#FF0000";
const SCORE_FLASH_DURATION = 30; // frames

// Paddle settings
const PADDLE_SIZE = 2;
const PADDLE_WIDTH = 1; // For vertical paddles
const PADDLE_HEIGHT = 1; // For horizontal paddles

// Warning line settings
const WARNING_DISTANCE_MULTIPLIER = 2; // Show warning within 2 favicons
// ===================================

// Content script for distributed Pong game in favicons
let currentNumber = null;
let totalPlayers = 0;
let currentTeam = null;
let faviconLink = null;
let ws = null;
let reconnectAttempts = 0;

// Game state from server
let gameState = {
  ballX: CENTER_X,
  ballY: CENTER_Y,
  ballVelX: 0.15,
  paddlePositions: {},
  teamScores: { red: 0, blue: 0 },
  lastScoringTeam: null,
};

// Score flash state (not used - flash is now based on hit/miss)
let scoreFlashFrames = 0;

// Paddle movement keys
const keys = {};

// Get team color for current player
function getTeamColor(playerNum) {
  // Use persistent team if available, otherwise fallback to number-based
  if (currentTeam === "red") {
    return TEAM_RED_COLOR;
  } else if (currentTeam === "blue") {
    return TEAM_BLUE_COLOR;
  }
  // Fallback
  return playerNum % 2 === 1 ? TEAM_RED_COLOR : TEAM_BLUE_COLOR;
}

// Track previous scores to only update title when score changes
let previousRedScore = null;
let previousBlueScore = null;

// Update document title with scores (only when score changes)
function updateTitle() {
  if (!gameState.teamScores) return;

  const redScore = gameState.teamScores.red || 0;
  const blueScore = gameState.teamScores.blue || 0;

  // Only update if score changed
  if (redScore !== previousRedScore || blueScore !== previousBlueScore) {
    document.title = `${redScore}:${blueScore}`;
    previousRedScore = redScore;
    previousBlueScore = blueScore;
  }
}

// Score flash tracking (kept for compatibility but not actively used)
function checkScoreChange() {
  // Flash logic is now handled by hit/miss detection
  if (scoreFlashFrames > 0) {
    scoreFlashFrames--;
  }
}

function updateFavicon() {
  if (!currentNumber || !totalPlayers) return;

  // Create canvas for favicon rendering
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");

  // Enable better rendering quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Check for score changes
  checkScoreChange();

  // Draw background with score flash effect
  if (scoreFlashFrames > 0 && gameState.lastScoringTeam) {
    const isOurTeam = gameState.lastScoringTeam === currentTeam;
    const flashColor = isOurTeam ? SCORE_FLASH_GREEN : SCORE_FLASH_RED;
    const flashIntensity = scoreFlashFrames / SCORE_FLASH_DURATION;
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // Blend with black background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.globalAlpha = 1 - flashIntensity * 0.5;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // Calculate this favicon's slice of the world
  const faviconStartX = (currentNumber - 1) * CANVAS_WIDTH;
  const faviconEndX = currentNumber * CANVAS_WIDTH;
  const worldWidth = CANVAS_WIDTH * totalPlayers;
  const maxWarningDistance = CANVAS_WIDTH * WARNING_DISTANCE_MULTIPLIER;
  const ballInMyArea = gameState.ballX >= faviconStartX && gameState.ballX < faviconEndX;

  // Left warning line (ball coming from left)
  // Player 1 (leftmost) should NOT see left warning - ball can't come from left
  // Other players see warning when ball is approaching from left (outside their area)
  if (currentNumber !== 1) {
    const leftEdgeX = faviconStartX;
    const distanceFromLeftEdge = gameState.ballX - leftEdgeX;
    if (distanceFromLeftEdge >= -maxWarningDistance && distanceFromLeftEdge <= maxWarningDistance && gameState.ballVelX > 0) {
      const distance = Math.abs(distanceFromLeftEdge);
      const intensity = Math.max(0, 1 - distance / maxWarningDistance);
      const lineHeight = Math.floor(CANVAS_HEIGHT * intensity);
      const opacity = intensity;

      if (lineHeight > 0) {
        ctx.fillStyle = `${WARNING_LINE_COLOR}${opacity})`;
        ctx.fillRect(0, (CANVAS_HEIGHT - lineHeight) / 2, 1, lineHeight);
      }
    }
  }

  // Right warning line (ball coming from right)
  // Last player (rightmost) should NOT see right warning - ball can't come from right
  // Other players see warning when ball is approaching from right (outside their area)
  if (currentNumber !== totalPlayers) {
    const rightEdgeX = faviconEndX;
    const distanceFromRightEdge = rightEdgeX - gameState.ballX;
    if (distanceFromRightEdge >= -maxWarningDistance && distanceFromRightEdge <= maxWarningDistance && gameState.ballVelX < 0) {
      const distance = Math.abs(distanceFromRightEdge);
      const intensity = Math.max(0, 1 - distance / maxWarningDistance);
      const lineHeight = Math.floor(CANVAS_HEIGHT * intensity);
      const opacity = intensity;

      if (lineHeight > 0) {
        ctx.fillStyle = `${WARNING_LINE_COLOR}${opacity})`;
        ctx.fillRect(CANVAS_WIDTH - 1, (CANVAS_HEIGHT - lineHeight) / 2, 1, lineHeight);
      }
    }
  }

  // Draw ball only if it's in this favicon's slice
  if (gameState.ballX >= faviconStartX && gameState.ballX < faviconEndX) {
    const localBallX = gameState.ballX - faviconStartX;
    ctx.fillStyle = BALL_COLOR;
    ctx.fillRect(Math.floor(localBallX), Math.floor(gameState.ballY), 1, 1);
  }

  // Draw paddles based on player number with team colors
  if (currentNumber === 1) {
    // Player 1: Left paddle (vertical) at left edge
    const paddleY = gameState.paddlePositions[1] || CENTER_Y;
    ctx.fillStyle = getTeamColor(1);
    ctx.fillRect(0, paddleY - PADDLE_SIZE, PADDLE_WIDTH, PADDLE_SIZE * 2);
  } else if (currentNumber === totalPlayers && totalPlayers > 1) {
    // Last player: Right paddle (vertical) at right edge
    const paddleY = gameState.paddlePositions[totalPlayers] || CENTER_Y;
    ctx.fillStyle = getTeamColor(totalPlayers);
    ctx.fillRect(CANVAS_WIDTH - 1, paddleY - PADDLE_SIZE, PADDLE_WIDTH, PADDLE_SIZE * 2);
  } else if (currentNumber > 1 && currentNumber < totalPlayers) {
    // Middle players: Top and bottom paddles (horizontal)
    const paddleX = gameState.paddlePositions[currentNumber] || CENTER_Y;
    const teamColor = getTeamColor(currentNumber);

    // Top paddle
    ctx.fillStyle = teamColor;
    ctx.fillRect(paddleX - PADDLE_SIZE, 0, PADDLE_SIZE * 2, PADDLE_HEIGHT);

    // Bottom paddle
    ctx.fillStyle = teamColor;
    ctx.fillRect(paddleX - PADDLE_SIZE, CANVAS_HEIGHT - 1, PADDLE_SIZE * 2, PADDLE_HEIGHT);
  }

  // Convert canvas to PNG data URL
  const dataUrl = canvas.toDataURL("image/png");

  // Find or create favicon link element
  if (!faviconLink) {
    faviconLink = document.querySelector("link[rel*='icon']");
    if (!faviconLink) {
      faviconLink = document.createElement("link");
      faviconLink.rel = "icon";
      document.head.appendChild(faviconLink);
    }
  }

  // Update favicon
  faviconLink.href = dataUrl;

  // Also update apple-touch-icon if it exists
  let appleIcon = document.querySelector("link[rel='apple-touch-icon']");
  if (appleIcon) {
    appleIcon.href = dataUrl;
  }
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  try {
    console.log("[Content Script] Connecting to WebSocket server...");
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("[Content Script] Connected to WebSocket server");
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "assigned") {
          currentNumber = message.number;
          totalPlayers = message.totalPlayers || 0;
          currentTeam = message.team || null;
          console.log("[Content Script] Assigned number:", currentNumber, "Team:", currentTeam, "Total players:", totalPlayers);
          setupControls();
          updateTitle();
        } else if (message.type === "gameState") {
          gameState.ballX = message.ballX || CENTER_X;
          gameState.ballY = message.ballY || CENTER_Y;
          gameState.ballVelX = message.ballVelX || 0.15;
          gameState.paddlePositions = message.paddlePositions || {};
          gameState.teamScores = message.teamScores || { red: 0, blue: 0 };
          gameState.lastScoringTeam = message.lastScoringTeam || null;
          totalPlayers = message.totalPlayers || totalPlayers;
          updateFavicon();
          updateTitle();
        }
      } catch (error) {
        console.error("[Content Script] Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("[Content Script] WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("[Content Script] WebSocket connection closed");
      ws = null;
      currentNumber = null;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(() => {
          console.log(`[Content Script] Reconnecting... (attempt ${reconnectAttempts})`);
          connectWebSocket();
        }, RECONNECT_DELAY_BASE * reconnectAttempts);
      }
    };
  } catch (error) {
    console.error("[Content Script] Error creating WebSocket connection:", error);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(() => {
        console.log(`[Content Script] Retrying connection... (attempt ${reconnectAttempts})`);
        connectWebSocket();
      }, RECONNECT_DELAY_BASE * reconnectAttempts);
    }
  }
}

// Connect when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", connectWebSocket);
} else {
  connectWebSocket();
}

// Setup keyboard controls for paddle movement
function setupControls() {
  if (!currentNumber || !ws) return;

  document.removeEventListener("keydown", handlePaddleKeyDown);
  document.removeEventListener("keyup", handlePaddleKeyUp);

  document.addEventListener("keydown", handlePaddleKeyDown);
  document.addEventListener("keyup", handlePaddleKeyUp);
}

let paddleMoveInterval = null;

function handlePaddleKeyDown(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    return;
  }

  // Player 1 or last player: Up/Down for vertical paddles
  if ((currentNumber === 1 || currentNumber === totalPlayers) && totalPlayers > 1) {
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      if (!keys.up) {
        keys.up = true;
        sendPaddleMove("up");
        startContinuousMove("up");
      }
    } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      if (!keys.down) {
        keys.down = true;
        sendPaddleMove("down");
        startContinuousMove("down");
      }
    }
  }
  // Middle players: Left/Right for horizontal paddles
  else if (currentNumber > 1 && currentNumber < totalPlayers) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      e.preventDefault();
      if (!keys.left) {
        keys.left = true;
        sendPaddleMove("left");
        startContinuousMove("left");
      }
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      e.preventDefault();
      if (!keys.right) {
        keys.right = true;
        sendPaddleMove("right");
        startContinuousMove("right");
      }
    }
  }
}

function startContinuousMove(direction) {
  if (paddleMoveInterval) {
    clearInterval(paddleMoveInterval);
  }
  paddleMoveInterval = setInterval(() => {
    if (
      (direction === "up" && keys.up) ||
      (direction === "down" && keys.down) ||
      (direction === "left" && keys.left) ||
      (direction === "right" && keys.right)
    ) {
      sendPaddleMove(direction);
    } else {
      clearInterval(paddleMoveInterval);
      paddleMoveInterval = null;
    }
  }, PADDLE_MOVE_INTERVAL);
}

function handlePaddleKeyUp(e) {
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
    keys.up = false;
    if (paddleMoveInterval && !keys.down && !keys.left && !keys.right) {
      clearInterval(paddleMoveInterval);
      paddleMoveInterval = null;
    }
  } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
    keys.down = false;
    if (paddleMoveInterval && !keys.up && !keys.left && !keys.right) {
      clearInterval(paddleMoveInterval);
      paddleMoveInterval = null;
    }
  } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
    keys.left = false;
    if (paddleMoveInterval && !keys.up && !keys.down && !keys.right) {
      clearInterval(paddleMoveInterval);
      paddleMoveInterval = null;
    }
  } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
    keys.right = false;
    if (paddleMoveInterval && !keys.up && !keys.down && !keys.left) {
      clearInterval(paddleMoveInterval);
      paddleMoveInterval = null;
    }
  }
}

function sendPaddleMove(direction) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "paddleMove",
        direction: direction,
      })
    );
  }
}

// Reconnect on page visibility change
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
    connectWebSocket();
  } else if (currentNumber && !document.hidden) {
    updateFavicon();
  }
});

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getStatus") {
    sendResponse({
      connected: ws !== null && ws.readyState === WebSocket.OPEN,
      number: currentNumber,
      totalPlayers: totalPlayers,
    });
    return true;
  }
});
