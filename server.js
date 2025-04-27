const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity (restrict in production!)
    methods: ["GET", "POST"],
  },
});

const players = {}; // Stores data for connected players { socket.id: { id, x, y, z, rotationY, rotationX, health, currentWeapon } }
const zombies = {}; // Stores data for active zombies { id: { id, x, y, z, health, targetId } }
let nextZombieId = 0;
let gameInProgress = false; // Track if the game has started

const PORT = process.env.PORT || 3000;

// Serve static files from the current directory (where index.html, game.js are)
app.use(express.static(path.join(__dirname, "."))); // Serve files from the root directory

console.log(`Serving static files from: ${path.join(__dirname, ".")}`);

// --- Zombie Management ---
function spawnZombies(count) {
  console.log(`Spawning ${count} zombies...`);
  for (let i = 0; i < count; i++) {
    const zombieId = `zombie_${nextZombieId++}`;
    zombies[zombieId] = {
      id: zombieId,
      x: Math.random() * 80 - 40, // Spawn within a larger area
      y: 0.4, // Zombie height offset
      z: Math.random() * 80 - 40,
      health: 100,
      targetId: null, // Which player the zombie is targeting
      speed: 0.5 + Math.random() * 1.0, // Random speed
    };
  }
  // Notify all clients about the new zombies
  io.emit("zombiesSpawned", zombies);
  console.log("Zombies spawned:", Object.keys(zombies).length);
}

// TODO: Add zombie update logic (movement, targeting, etc.)
function updateZombies() {
  // Basic AI: Move towards the nearest player
  // Check for attacks
  // Broadcast updates periodically
}

//setInterval(updateZombies, 1000 / 10); // Update zombies 10 times per second

// --- Socket Connection Handling ---
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Designate the first player as host (simplistic approach)
  const isHost = Object.keys(players).length === 0;
  console.log(`Player ${socket.id} is host: ${isHost}`);

  // Create a new player object
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 10 - 5, // Start at a randomish position
    y: 1.6,
    z: Math.random() * 10 - 5,
    rotationY: 0, // Store Y rotation (player body)
    rotationX: 0, // Store X rotation (camera/head)
    health: 100,
    currentWeapon: "pistol",
  };

  // Send the new player their ID and the current state of all players AND zombies
  socket.emit("initialize", {
    id: socket.id,
    players,
    zombies,
    gameInProgress,
    isHost,
  });

  // Notify all other players about the new player
  socket.broadcast.emit("playerJoined", players[socket.id]);

  // Listen for player state updates (position, rotation, etc.)
  socket.on("playerUpdate", (data) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...data }; // Merge updates
      // Broadcast the updated state to other players
      socket.broadcast.emit("playerUpdated", players[socket.id]);
    }
  });

  // Listen for host starting the game
  socket.on("startGame", () => {
    // Only allow the host (first connected player) to start
    // This is a basic check, could be improved
    const playerIds = Object.keys(players);
    if (playerIds.length > 0 && socket.id === playerIds[0] && !gameInProgress) {
      console.log(`Host ${socket.id} started the game.`);
      gameInProgress = true;
      spawnZombies(10); // Spawn 10 zombies initially
      // Notify all clients that the game has started
      io.emit("gameStarted");
    } else if (gameInProgress) {
      console.log(
        `Player ${socket.id} tried to start game, but it's already in progress.`
      );
    } else {
      console.log(
        `Player ${socket.id} tried to start game, but is not the host.`
      );
    }
  });

  // Listen for shooting actions
  socket.on("shoot", (data) => {
    if (players[socket.id]) {
      // Just broadcast the shoot event for now. Server-side validation/hit detection would go here.
      console.log(`Player ${socket.id} shot with ${data.weapon}`);
      socket.broadcast.emit("playerShot", {
        shooterId: socket.id,
        weapon: data.weapon,
      });
    }
  });

  // Listen for player taking damage
  socket.on("takeDamage", (data) => {
    // TEMPORARILY DISABLED PLAYER DAMAGE - We only want PvE
    /* --- REMOVED OLD PVP LOGIC ---
    if (players[data.playerId]) {
       ...
    }
    */
    // TODO: Re-implement this handler for taking damage from ZOMBIES?
    // console.log( // Removed log related to disabled PvP path
    //   "takeDamage event received, but player damage is disabled:",
    //   data
    // );
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    const wasHost =
      Object.keys(players).length > 0 && socket.id === Object.keys(players)[0];
    delete players[socket.id];
    // Notify all other players that this player has left
    io.emit("playerLeft", socket.id);

    // Basic cleanup if host leaves
    if (wasHost && Object.keys(players).length === 0) {
      console.log("Host left, resetting game state.");
      gameInProgress = false;
      // Clear zombies
      for (const zombieId in zombies) {
        delete zombies[zombieId];
      }
      nextZombieId = 0;
      console.log("Zombies cleared.");
      // Notify remaining clients? Or just let them disconnect/reset on their end?
      // For now, let client handle reset on disconnect/reconnect.
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});
