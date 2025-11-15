const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ========== CONFIGURATION ==========
const PORT = process.env.PORT || 8080;
const FPS = 60;
const FRAME_TIME = 1000 / FPS; // ~16.67ms

// Game dimensions
const FAVICON_WIDTH = 16;
const FAVICON_HEIGHT = 16;
const CENTER_X = FAVICON_WIDTH / 2;
const CENTER_Y = FAVICON_HEIGHT / 2;

// Ball settings
const BALL_VELOCITY_X = 0.15; // Slower ball
const BALL_VELOCITY_Y = 0.15;
const BALL_RADIUS = 0.5; // Single pixel ball

// Paddle settings
const PADDLE_SIZE = 2;
const PADDLE_SPEED = 2;
const PADDLE_COLLISION_TOLERANCE = 2;

// Game loop settings
const MIN_PLAYERS = 2;
const RESET_DELAY = 100; // ms when not enough players

// Team configuration
const TEAM_RED = "red";
const TEAM_BLUE = "blue";
// ===================================

// Create HTTP server for WebSocket upgrade (required for render.com)
const server = http.createServer((req, res) => {
  // Health check endpoint for render.com
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  // Serve index.html at root
  if (req.url === "/" || req.url === "/index.html") {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading index.html");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  // For any other requests, return 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("WebSocket Game Server - Use WebSocket connection");
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

const clients = new Map(); // Map<WebSocket, number>
const paddlePositions = new Map(); // Map<number, position>

// Team scores
const teamScores = {
  [TEAM_RED]: 0,
  [TEAM_BLUE]: 0,
};

// Score flash tracking (for visual feedback)
let lastScoringTeam = null;
let scoreFlashFrames = 0;
const SCORE_FLASH_DURATION = 30; // frames

// Get team for a player number (odd = red, even = blue)
function getTeam(playerNumber) {
  return playerNumber % 2 === 1 ? TEAM_RED : TEAM_BLUE;
}

// Game state
const gameState = {
  ballX: CENTER_X,
  ballY: CENTER_Y,
  ballVelX: BALL_VELOCITY_X,
  ballVelY: BALL_VELOCITY_Y,
  faviconWidth: FAVICON_WIDTH,
  faviconHeight: FAVICON_HEIGHT,
  paddleSize: PADDLE_SIZE,
  paddleSpeed: PADDLE_SPEED,
};

// Get game world dimensions based on number of players
function getWorldWidth(totalPlayers) {
  return FAVICON_WIDTH * totalPlayers;
}

// Reassign all clients to sequential numbers (1, 2, 3, ...)
function reassignNumbers() {
  let newNumber = 1;
  const reassignments = new Map();

  clients.forEach((oldNumber, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      reassignments.set(ws, newNumber);
      clients.set(ws, newNumber);

      if (!paddlePositions.has(newNumber)) {
        paddlePositions.set(newNumber, CENTER_Y);
      }

      newNumber++;
    }
  });

  reassignments.forEach((newNumber, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "assigned",
          number: newNumber,
          totalPlayers: clients.size,
          team: getTeam(newNumber),
        })
      );
    }
  });

  console.log(`Reassigned numbers. Total clients: ${clients.size}`);
}

// Broadcast game state to all clients
function broadcastGameState() {
  const totalPlayers = clients.size;
  if (totalPlayers === 0) return;

  // Decrease score flash counter
  if (scoreFlashFrames > 0) {
    scoreFlashFrames--;
  } else {
    lastScoringTeam = null;
  }

  const message = JSON.stringify({
    type: "gameState",
    ballX: gameState.ballX,
    ballY: gameState.ballY,
    ballVelX: gameState.ballVelX,
    totalPlayers: totalPlayers,
    paddlePositions: Object.fromEntries(paddlePositions),
    teamScores: teamScores,
    lastScoringTeam: lastScoringTeam,
  });

  clients.forEach((playerNumber, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Handle paddle collision and scoring
function handlePaddleCollision(playerNumber) {
  const team = getTeam(playerNumber);
  teamScores[team]++;
  lastScoringTeam = team;
  scoreFlashFrames = SCORE_FLASH_DURATION;
}

// Game loop
function gameLoop() {
  const totalPlayers = clients.size;
  if (totalPlayers < MIN_PLAYERS) {
    gameState.ballX = CENTER_X;
    gameState.ballY = CENTER_Y;
    setTimeout(gameLoop, RESET_DELAY);
    return;
  }

  const worldWidth = getWorldWidth(totalPlayers);

  // Update ball position
  gameState.ballX += gameState.ballVelX;
  gameState.ballY += gameState.ballVelY;

  // Ball collision with left/right walls
  if (gameState.ballX <= 0) {
    gameState.ballVelX = -gameState.ballVelX;
    gameState.ballX = 0;
  } else if (gameState.ballX >= worldWidth) {
    gameState.ballVelX = -gameState.ballVelX;
    gameState.ballX = worldWidth;
  }

  // Ball collision with top/bottom walls
  if (gameState.ballY <= 0 || gameState.ballY >= FAVICON_HEIGHT) {
    gameState.ballVelY = -gameState.ballVelY;
    gameState.ballY = Math.max(0, Math.min(FAVICON_HEIGHT, gameState.ballY));
  }

  // Ball collision with paddles
  let scoredThisFrame = false;

  // Left paddle (player 1)
  if (gameState.ballX <= PADDLE_SIZE + 1 && gameState.ballVelX < 0 && paddlePositions.has(1)) {
    const paddleY = paddlePositions.get(1);
    if (Math.abs(gameState.ballY - paddleY) <= PADDLE_SIZE + PADDLE_COLLISION_TOLERANCE) {
      gameState.ballVelX = Math.abs(gameState.ballVelX);
      gameState.ballX = PADDLE_SIZE + 1;
      if (!scoredThisFrame) {
        handlePaddleCollision(1);
        scoredThisFrame = true;
      }
    }
  }

  // Right paddle (last player)
  const lastPlayer = totalPlayers;
  const rightPaddleX = worldWidth - PADDLE_SIZE - 1;
  if (gameState.ballX >= rightPaddleX && gameState.ballVelX > 0 && paddlePositions.has(lastPlayer)) {
    const paddleY = paddlePositions.get(lastPlayer);
    if (Math.abs(gameState.ballY - paddleY) <= PADDLE_SIZE + PADDLE_COLLISION_TOLERANCE) {
      gameState.ballVelX = -Math.abs(gameState.ballVelX);
      gameState.ballX = rightPaddleX;
      if (!scoredThisFrame) {
        handlePaddleCollision(lastPlayer);
        scoredThisFrame = true;
      }
    }
  }

  // Top/bottom paddles (middle players)
  for (let i = 2; i < totalPlayers; i++) {
    if (paddlePositions.has(i)) {
      const paddleXInWorld = (i - 1) * FAVICON_WIDTH + (paddlePositions.get(i) || CENTER_Y);

      // Top paddle
      if (
        gameState.ballY <= PADDLE_SIZE + 1 &&
        gameState.ballVelY < 0 &&
        Math.abs(gameState.ballX - paddleXInWorld) <= PADDLE_SIZE + PADDLE_COLLISION_TOLERANCE
      ) {
        gameState.ballVelY = Math.abs(gameState.ballVelY);
        gameState.ballY = PADDLE_SIZE + 1;
        if (!scoredThisFrame) {
          handlePaddleCollision(i);
          scoredThisFrame = true;
        }
      }

      // Bottom paddle
      if (
        gameState.ballY >= FAVICON_HEIGHT - PADDLE_SIZE - 1 &&
        gameState.ballVelY > 0 &&
        Math.abs(gameState.ballX - paddleXInWorld) <= PADDLE_SIZE + PADDLE_COLLISION_TOLERANCE
      ) {
        gameState.ballVelY = -Math.abs(gameState.ballVelY);
        gameState.ballY = FAVICON_HEIGHT - PADDLE_SIZE - 1;
        if (!scoredThisFrame) {
          handlePaddleCollision(i);
          scoredThisFrame = true;
        }
      }
    }
  }

  // Keep ball in bounds
  gameState.ballX = Math.max(0, Math.min(worldWidth, gameState.ballX));
  gameState.ballY = Math.max(0, Math.min(FAVICON_HEIGHT, gameState.ballY));

  broadcastGameState();
  setTimeout(gameLoop, FRAME_TIME);
}

wss.on("connection", (ws) => {
  clients.set(ws, 0);
  reassignNumbers();

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "paddleMove") {
        const playerNumber = clients.get(ws);
        if (playerNumber && message.direction) {
          const currentPos = paddlePositions.get(playerNumber) || CENTER_Y;
          let newPos = currentPos;
          const totalPlayers = clients.size;

          // Player 1: left paddle (vertical)
          if (playerNumber === 1) {
            if (message.direction === "up") {
              newPos = Math.max(PADDLE_SIZE, currentPos - PADDLE_SPEED);
            } else if (message.direction === "down") {
              newPos = Math.min(FAVICON_HEIGHT - PADDLE_SIZE, currentPos + PADDLE_SPEED);
            }
          }
          // Last player: right paddle (vertical)
          else if (playerNumber === totalPlayers) {
            if (message.direction === "up") {
              newPos = Math.max(PADDLE_SIZE, currentPos - PADDLE_SPEED);
            } else if (message.direction === "down") {
              newPos = Math.min(FAVICON_HEIGHT - PADDLE_SIZE, currentPos + PADDLE_SPEED);
            }
          }
          // Middle players: top/bottom paddles (horizontal)
          else {
            if (message.direction === "left") {
              newPos = Math.max(PADDLE_SIZE, currentPos - PADDLE_SPEED);
            } else if (message.direction === "right") {
              newPos = Math.min(FAVICON_WIDTH - PADDLE_SIZE, currentPos + PADDLE_SPEED);
            }
          }

          paddlePositions.set(playerNumber, newPos);
        }
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    const playerNumber = clients.get(ws);
    console.log(`Client ${playerNumber} disconnected. Total clients: ${clients.size}`);

    if (playerNumber) {
      paddlePositions.delete(playerNumber);
    }
    clients.delete(ws);
    reassignNumbers();
  });

  ws.on("error", (error) => {
    console.error(`Error with client:`, error);
    if (clients.has(ws)) {
      const playerNumber = clients.get(ws);
      if (playerNumber) {
        paddlePositions.delete(playerNumber);
      }
      clients.delete(ws);
      reassignNumbers();
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`HTTP server: http://localhost:${PORT}`);
  console.log(`WebSocket server: ws://localhost:${PORT}`);
});

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Start game loop
gameLoop();
