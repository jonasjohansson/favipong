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
const clientTeams = new Map(); // Map<WebSocket, team>
const paddlePositions = new Map(); // Map<number, position>
let nextTeam = TEAM_RED; // Alternate teams for new connections

// Team scores
const teamScores = {
  [TEAM_RED]: 0,
  [TEAM_BLUE]: 0,
};

// Score flash tracking (for visual feedback)
let lastScoringTeam = null;
let scoreFlashFrames = 0;
const SCORE_FLASH_DURATION = 30; // frames

// Helper function to get active clients
function getActiveClients() {
  return Array.from(clients.keys()).filter(ws => ws.readyState === WebSocket.OPEN);
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

// Clean up closed connections
function cleanupClosedConnections() {
  const closedConnections = [];
  clients.forEach((playerNumber, ws) => {
    if (ws.readyState !== WebSocket.OPEN) {
      closedConnections.push({ ws, playerNumber });
    }
  });
  closedConnections.forEach(({ ws, playerNumber }) => {
    clients.delete(ws);
    clientTeams.delete(ws);
    if (playerNumber) {
      paddlePositions.delete(playerNumber);
    }
  });
}

// Reassign all clients to sequential numbers (1, 2, 3, ...)
function reassignNumbers() {
  cleanupClosedConnections();

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

  const activeClientsCount = reassignments.size;
  reassignments.forEach((newNumber, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      // Get persistent team for this connection
      const team = clientTeams.get(ws) || TEAM_RED;
      ws.send(
        JSON.stringify({
          type: "assigned",
          number: newNumber,
          totalPlayers: activeClientsCount,
          team: team,
        })
      );
    }
  });

  console.log(`Reassigned numbers. Active clients: ${activeClientsCount}, Total in map: ${clients.size}`);
}

  // Broadcast game state to all clients
function broadcastGameState() {
  const activeClients = getActiveClients();
  const totalPlayers = activeClients.length;
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

  // Send to active clients only
  activeClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Handle paddle collision and scoring
function handlePaddleCollision(playerNumber) {
  // Find the WebSocket for this player number to get their persistent team
  let team = TEAM_RED; // Default fallback
  for (const [ws, pNum] of clients.entries()) {
    if (pNum === playerNumber && ws.readyState === WebSocket.OPEN) {
      team = clientTeams.get(ws) || TEAM_RED;
      break;
    }
  }
  
  teamScores[team]++;
  lastScoringTeam = team;
  scoreFlashFrames = SCORE_FLASH_DURATION;
}

// Game loop
function gameLoop() {
  const activeClients = getActiveClients();
  const totalPlayers = activeClients.length;
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

  // Helper to check paddle collision
  function checkPaddleCollision(playerNumber, paddleX, paddleY, isVertical) {
    if (!paddlePositions.has(playerNumber)) return false;
    
    if (isVertical) {
      // Vertical paddle (left/right edges)
      const distanceY = Math.abs(gameState.ballY - paddleY);
      return distanceY <= PADDLE_SIZE + PADDLE_COLLISION_TOLERANCE;
    } else {
      // Horizontal paddle (top/bottom)
      const distanceX = Math.abs(gameState.ballX - paddleX);
      return distanceX <= PADDLE_SIZE + PADDLE_COLLISION_TOLERANCE;
    }
  }

  // Left paddle (player 1)
  // Paddle is at x=0, so collision happens when ball reaches x=0 or x=1
  if (gameState.ballX <= 1 && gameState.ballVelX < 0) {
    const paddleY = paddlePositions.get(1);
    if (paddleY !== undefined && checkPaddleCollision(1, 0, paddleY, true)) {
      gameState.ballVelX = Math.abs(gameState.ballVelX);
      gameState.ballX = 1; // Position ball just to the right of paddle
      if (!scoredThisFrame) {
        handlePaddleCollision(1);
        scoredThisFrame = true;
      }
    }
  }

  // Right paddle (last player)
  // Paddle is at x=worldWidth-1, so collision happens when ball reaches x=worldWidth-1 or x=worldWidth-2
  const lastPlayer = totalPlayers;
  const rightPaddleX = worldWidth - 1;
  if (gameState.ballX >= rightPaddleX - 1 && gameState.ballVelX > 0) {
    const paddleY = paddlePositions.get(lastPlayer);
    if (paddleY !== undefined && checkPaddleCollision(lastPlayer, rightPaddleX, paddleY, true)) {
      gameState.ballVelX = -Math.abs(gameState.ballVelX);
      gameState.ballX = rightPaddleX - 1; // Position ball just to the left of paddle
      if (!scoredThisFrame) {
        handlePaddleCollision(lastPlayer);
        scoredThisFrame = true;
      }
    }
  }

  // Top/bottom paddles (middle players)
  for (let i = 2; i < totalPlayers; i++) {
    const paddleY = paddlePositions.get(i);
    if (paddleY === undefined) continue;
    
    const paddleXInWorld = (i - 1) * FAVICON_WIDTH + paddleY;

    // Top paddle
    if (gameState.ballY <= PADDLE_SIZE + 1 && gameState.ballVelY < 0) {
      if (checkPaddleCollision(i, paddleXInWorld, 0, false)) {
        gameState.ballVelY = Math.abs(gameState.ballVelY);
        gameState.ballY = PADDLE_SIZE + 1;
        if (!scoredThisFrame) {
          handlePaddleCollision(i);
          scoredThisFrame = true;
        }
      }
    }

    // Bottom paddle
    if (gameState.ballY >= FAVICON_HEIGHT - PADDLE_SIZE - 1 && gameState.ballVelY > 0) {
      if (checkPaddleCollision(i, paddleXInWorld, FAVICON_HEIGHT - 1, false)) {
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
  console.log(`New WebSocket connection. Current map size: ${clients.size}`);
  
  cleanupClosedConnections();
  
  // Assign a persistent team to this connection
  const assignedTeam = nextTeam;
  clientTeams.set(ws, assignedTeam);
  nextTeam = nextTeam === TEAM_RED ? TEAM_BLUE : TEAM_RED;
  
  clients.set(ws, 0);
  console.log(`Added new connection with team ${assignedTeam}. Map size: ${clients.size}`);
  reassignNumbers();

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "paddleMove") {
        const playerNumber = clients.get(ws);
        if (playerNumber && message.direction) {
          const currentPos = paddlePositions.get(playerNumber) || CENTER_Y;
          let newPos = currentPos;
          const totalPlayers = getActiveClients().length;

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

  // Helper to remove client and cleanup
  function removeClient() {
    const playerNumber = clients.get(ws);
    if (playerNumber) {
      paddlePositions.delete(playerNumber);
    }
    clients.delete(ws);
    clientTeams.delete(ws);
    reassignNumbers();
  }

  ws.on("close", () => {
    const playerNumber = clients.get(ws);
    console.log(`Client ${playerNumber} disconnected. Map size: ${clients.size}`);
    removeClient();
  });

  ws.on("error", (error) => {
    console.error(`Error with client:`, error);
    if (clients.has(ws)) {
      removeClient();
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
