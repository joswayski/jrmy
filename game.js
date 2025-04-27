// Game variables
let scene, camera, renderer;
let player,
  playerHealth = 100; // This will be managed by the server, but keep for local display/prediction
let score = 0; // Score might need server-side validation/sync later
let clientZombies = {}; // { id: { mesh: THREE.Group, data: {} } }
let bullets = [];
let obstacles = [];
let gameActive = false;
let isPaused = false;
let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;
let isJumping = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let clock = new THREE.Clock();
let lastSentStateTime = 0; // Throttle sending updates
const stateUpdateInterval = 100; // ms (e.g., 10 times per second)

// Multiplayer variables
let socket;
let myId;
let isHost = false; // Track if this client is the host
let serverGameInProgress = false; // Track server game state
let remotePlayers = {}; // { id: { mesh: THREE.Mesh, data: {} } }

let muzzleFlash = null;

// Weapon variables
let currentWeapon = "pistol";
let weapons = {
  pistol: {
    damage: 25,
    fireRate: 0.5, // seconds between shots
    bulletSpeed: 30, // Increased from 15
    bulletColor: 0xffff00,
    bulletSize: 0.1,
    lastFired: 0,
  },
  shotgun: {
    damage: 15,
    fireRate: 1.0, // seconds between shots
    bulletSpeed: 25, // Increased from 12
    bulletColor: 0xff9900,
    bulletSize: 0.08,
    pellets: 5,
    spread: 0.1,
    lastFired: 0,
  },
  machineGun: {
    damage: 10,
    fireRate: 0.1, // seconds between shots
    bulletSpeed: 40, // Increased from 20
    bulletColor: 0x00ffff,
    bulletSize: 0.06,
    lastFired: 0,
  },
};

// DOM elements
const startScreen = document.getElementById("start-screen");
const pauseScreen = document.getElementById("pause-screen");
const startButton = document.getElementById("start-button");
const hostStartButton = document.getElementById("host-start-button"); // Get host button
const resumeButton = document.getElementById("resume-button");
const quitButton = document.getElementById("quit-button");
const scoreElement = document.getElementById("score");
const healthElement = document.getElementById("health");
const uiElement = document.getElementById("ui");
const crosshairElement = document.getElementById("crosshair");
const weaponElement = document.createElement("div");
weaponElement.id = "weapon-info";
weaponElement.style.position = "absolute";
weaponElement.style.bottom = "10px";
weaponElement.style.left = "10px";
weaponElement.style.color = "white";
weaponElement.style.fontFamily = "Arial, sans-serif";
weaponElement.style.fontSize = "16px";
weaponElement.textContent = `Weapon: ${currentWeapon}`;
document.body.appendChild(weaponElement);

// Hide UI elements initially
uiElement.style.display = "none";
crosshairElement.style.display = "none";
weaponElement.style.display = "none";

// Initialize game when start button is clicked
startButton.addEventListener("click", () => {
  // This button now just initializes the client and connects
  startScreen.style.display = "none";
  // gameActive = true; // Don't activate locally until server confirms
  // Show UI elements when game starts (maybe wait?)
  // uiElement.style.display = "block";
  // crosshairElement.style.display = "block";
  // weaponElement.style.display = "block";
  init();
  animate(); // Start rendering loop
  updateWeaponDisplay(); // Needs initial setup
  // Connect to server AFTER basic init
  connectToServer();
});

// Add listener for host start button
hostStartButton.addEventListener("click", () => {
  if (socket && socket.connected && isHost && !serverGameInProgress) {
    console.log("Host clicking Start Game...");
    socket.emit("startGame");
    hostStartButton.style.display = "none"; // Hide after clicking
  }
});

// Pause menu event listeners
resumeButton.addEventListener("click", () => {
  pauseScreen.style.display = "none";
  isPaused = false;
  // Show UI elements when resuming
  uiElement.style.display = "block";
  crosshairElement.style.display = "block";
  weaponElement.style.display = "block";
  renderer.domElement.requestPointerLock();
});

quitButton.addEventListener("click", () => {
  gameActive = false;
  isPaused = false;
  startScreen.style.display = "flex";
  pauseScreen.style.display = "none";
  // Hide UI elements when quitting
  uiElement.style.display = "none";
  crosshairElement.style.display = "none";
  weaponElement.style.display = "none";
  resetGame();
  if (socket) {
    socket.disconnect(); // Disconnect from server
  }
});

// Initialize the game
function init() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  scene.fog = new THREE.Fog(0x87ceeb, 0, 500);

  // Create camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.y = 1.6; // Player height

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Create floor
  const floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.8,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  scene.add(floor);

  // Create local player
  player = new THREE.Object3D();
  // player.position will be set by server initially or default
  scene.add(player);
  camera.position.set(0, 1.6, 0); // Set camera relative to player container
  player.add(camera);

  // Create weapon model
  createWeaponModel();

  // Create environment (obstacles) - keep client-side for collision detection?
  // Or sync from server? For now, keep client-side for simplicity.
  createEnvironment();

  // Create enemies - Will be handled by server sync
  // createEnemies();

  // Create weapon pickups - Keep client-side for now
  createWeaponPickups();

  // Set up controls
  setupControls();

  // Window resize handler
  window.addEventListener("resize", onWindowResize);
}

// --- Multiplayer Functions ---

function connectToServer() {
  // Ensure using the correct server address (localhost for local testing)
  const serverAddress =
    window.location.hostname === "localhost" ? "http://localhost:3000" : ""; // Use relative path if served from same origin, otherwise specify full address
  console.log(
    `Attempting to connect to server at: ${serverAddress || "relative path"}`
  );
  socket = io(serverAddress); // Connect to the server address

  socket.on("connect_error", (err) => {
    console.error("Connection Error:", err);
    // Display error to user?
    startScreen.style.display = "flex";
    startScreen.querySelector("h1").textContent = "Connection Failed";
    startScreen.querySelector(
      "p"
    ).textContent = `Could not connect to server. Is it running? ${err.message}`;
    gameActive = false;
  });

  socket.on("connect", () => {
    console.log("Successfully connected to server with ID:", socket.id);
  });

  socket.on("initialize", (data) => {
    myId = data.id;
    isHost = data.isHost; // Store host status
    serverGameInProgress = data.gameInProgress; // Store game status
    console.log(
      `Received initialization data. My ID: ${myId}, Host: ${isHost}, Game Started: ${serverGameInProgress}`
    );

    // Show Host Start button if applicable
    if (isHost && !serverGameInProgress) {
      console.log("Showing Host Start Button");
      hostStartButton.style.display = "block";
    } else {
      hostStartButton.style.display = "none";
    }

    // Only activate game fully if it's already in progress or started
    if (serverGameInProgress) {
      activateGameUI();
    }

    // Set local player's initial position based on server data
    if (data.players[myId]) {
      player.position.set(
        data.players[myId].x,
        data.players[myId].y,
        data.players[myId].z
      );
      player.rotation.y = data.players[myId].rotationY || 0;
      camera.rotation.x = data.players[myId].rotationX || 0;
      playerHealth = data.players[myId].health;
      healthElement.textContent = playerHealth;
      currentWeapon = data.players[myId].currentWeapon || "pistol";
      updateWeaponDisplay();
      createWeaponModel(); // Update weapon model based on server state
    } else {
      console.warn("My player data not found in initialization payload?");
      // Use a default starting position if not provided?
      player.position.set(0, 1.6, 0);
    }

    // Add existing players
    for (const playerId in data.players) {
      if (playerId !== myId) {
        addRemotePlayer(data.players[playerId]);
      }
    }

    // Add existing zombies
    console.log("Initializing existing zombies:", data.zombies);
    for (const zombieId in data.zombies) {
      addOrUpdateZombie(data.zombies[zombieId]);
    }
  });

  socket.on("playerJoined", (playerData) => {
    console.log("Player joined:", playerData.id);
    if (playerData.id !== myId) {
      addRemotePlayer(playerData);
    }
  });

  socket.on("playerUpdated", (playerData) => {
    if (playerData.id !== myId) {
      updateRemotePlayer(playerData);
    }
  });

  socket.on("playerShot", (shotData) => {
    if (shotData.shooterId !== myId && remotePlayers[shotData.shooterId]) {
      console.log(`Player ${shotData.shooterId} shot with ${shotData.weapon}`);
      // TODO: Add visual/audio effect for remote player shooting
      // Maybe show a muzzle flash on their weapon model?
      playShootSound(
        shotData.weapon,
        remotePlayers[shotData.shooterId].mesh.position
      ); // Play sound from their location
    }
  });

  socket.on("playerLeft", (playerId) => {
    console.log("Player left:", playerId);
    removeRemotePlayer(playerId);
  });

  socket.on("healthUpdate", (data) => {
    if (data.id === myId) {
      playerHealth = data.health;
      healthElement.textContent = playerHealth;
      console.log("My health updated:", playerHealth);
      // Add a visual hit indicator (e.g., screen flash red briefly)
      document.body.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
      setTimeout(() => {
        document.body.style.backgroundColor = "";
      }, 150);
    } else if (remotePlayers[data.id]) {
      remotePlayers[data.id].data.health = data.health;
      console.log(`Player ${data.id} health updated: ${data.health}`);
      // Could update remote player visual based on health?
    }
  });

  socket.on("playerDied", (playerId) => {
    console.log(`Player ${playerId} died.`);
    if (playerId === myId) {
      // Handled by respawn logic for now
      console.log("I died!");
      // Optionally show a "You died" message before respawn clears it
    } else if (remotePlayers[playerId]) {
      // Maybe make the remote player visually disappear or play death animation
      remotePlayers[playerId].mesh.visible = false; // Hide temporarily
      console.log(`Remote player ${playerId} mesh hidden.`);
    }
  });

  socket.on("respawn", (data) => {
    if (socket.id === myId) {
      // Check if the respawn message is for me
      console.log("Received respawn instruction.");
      player.position.set(data.x, data.y, data.z);
      playerHealth = 100; // Reset health locally
      healthElement.textContent = playerHealth;
      velocity.set(0, 0, 0); // Reset velocity
      isJumping = false;
      // Reset UI elements or show respawn message?
      startScreen.style.display = "none"; // Ensure start screen is hidden if it popped up
      uiElement.style.display = "block";
      crosshairElement.style.display = "block";
      weaponElement.style.display = "block";
      if (isPaused) togglePause(); // Force unpause if needed
    } else if (remotePlayers[myId]) {
      // This check seems wrong, should check if respawn ID matches a remote player
      console.warn("Received respawn for a remote player? ID:", myId); // Likely error in logic or server sending
    } else {
      // Respawn message for a remote player who died earlier
      const respawnedPlayerId = Object.keys(remotePlayers).find(
        (id) => remotePlayers[id].data.health <= 0
      ); // Needs better tracking
      if (respawnedPlayerId && remotePlayers[respawnedPlayerId]) {
        remotePlayers[respawnedPlayerId].mesh.position.set(
          data.x,
          data.y,
          data.z
        );
        remotePlayers[respawnedPlayerId].data.health = 100;
        remotePlayers[respawnedPlayerId].mesh.visible = true; // Make visible again
        console.log(`Remote player ${respawnedPlayerId} respawned.`);
      } else if (remotePlayers[data.id]) {
        // Check if respawn is for existing remote player
        remotePlayers[data.id].mesh.position.set(data.x, data.y, data.z);
        remotePlayers[data.id].data.health = 100;
        remotePlayers[data.id].mesh.visible = true;
        console.log(`Remote player ${data.id} respawned.`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
    // Handle disconnection (show message, disable input, etc.)
    gameActive = false;
    startScreen.style.display = "flex";
    startScreen.querySelector("h1").textContent = "Disconnected";
    startScreen.querySelector("p").textContent =
      "Lost connection to the server.";
    resetGame(); // Clean up local state
  });

  // Add listener for game starting
  socket.on("gameStarted", () => {
    console.log("Received gameStarted event from server.");
    serverGameInProgress = true;
    hostStartButton.style.display = "none"; // Hide button if it was visible
    activateGameUI(); // Show game UI for all players
    gameActive = true; // Allow local updates/input now
  });

  // Add listener for zombies spawning
  socket.on("zombiesSpawned", (zombieData) => {
    console.log("Received zombiesSpawned event:", zombieData);
    for (const zombieId in zombieData) {
      addOrUpdateZombie(zombieData[zombieId]);
    }
  });

  // TODO: Add listener for zombie updates (position, health)
  socket.on("zombieUpdate", (updateData) => {
    // updateData could be an object { id: zombieId, x, y, z, health, ... }
    // Or an array of updates [ {id, ...}, {id, ...} ]
    console.log("Received zombieUpdate (TODO: Implement handling)", updateData);
    // Example for single update:
    // if(clientZombies[updateData.id]) {
    //    updateZombie(updateData);
    // }
  });

  // TODO: Add listener for zombie death
  socket.on("zombieDied", (zombieId) => {
    console.log(`Received zombieDied event for ${zombieId}`);
    removeZombie(zombieId);
  });
}

// Helper function to show game UI
function activateGameUI() {
  console.log("Activating Game UI");
  uiElement.style.display = "block";
  crosshairElement.style.display = "block";
  weaponElement.style.display = "block";
  // If not already locked, attempt pointer lock
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
}

// --- Define Player Models ---

// Function to create the fat guy model
function createFatGuyModel() {
  const modelGroup = new THREE.Group();

  // Main body (large sphere)
  const bodyRadius = 0.8;
  const bodyGeometry = new THREE.SphereGeometry(bodyRadius, 16, 12);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8888ff,
    roughness: 0.7,
  }); // Light blueish color
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
  bodyMesh.position.y = bodyRadius; // Position so bottom is near y=0
  modelGroup.add(bodyMesh);

  // Head (smaller sphere on top)
  const headRadius = 0.3;
  const headGeometry = new THREE.SphereGeometry(headRadius, 12, 10);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xffccaa,
    roughness: 0.8,
  }); // Skin-like color
  const headMesh = new THREE.Mesh(headGeometry, headMaterial);
  headMesh.position.y = bodyRadius * 2 + headRadius * 0.8; // Position above body
  modelGroup.add(headMesh);

  // Simple limbs (optional - cylinders or smaller spheres)
  const limbRadius = 0.2;
  const limbHeight = 0.6;
  const limbGeometry = new THREE.CylinderGeometry(
    limbRadius,
    limbRadius * 0.8,
    limbHeight,
    8
  );
  const limbMaterial = bodyMaterial; // Use same color as body

  // Arms
  const leftArm = new THREE.Mesh(limbGeometry, limbMaterial);
  leftArm.position.set(-bodyRadius, bodyRadius * 1.2, 0);
  leftArm.rotation.z = Math.PI / 6; // Angle slightly down
  modelGroup.add(leftArm);

  const rightArm = new THREE.Mesh(limbGeometry, limbMaterial);
  rightArm.position.set(bodyRadius, bodyRadius * 1.2, 0);
  rightArm.rotation.z = -Math.PI / 6; // Angle slightly down
  modelGroup.add(rightArm);

  // Legs (shorter cylinders)
  const legHeight = 0.5;
  const legGeometry = new THREE.CylinderGeometry(
    limbRadius * 1.2,
    limbRadius,
    legHeight,
    8
  );

  const leftLeg = new THREE.Mesh(legGeometry, limbMaterial);
  leftLeg.position.set(-bodyRadius * 0.5, legHeight / 2, 0);
  modelGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, limbMaterial);
  rightLeg.position.set(bodyRadius * 0.5, legHeight / 2, 0);
  modelGroup.add(rightLeg);

  // Add a weapon holder (empty Object3D)
  const weaponHolder = new THREE.Object3D();
  weaponHolder.name = "weaponHolder";
  // Position it near the right hand roughly
  weaponHolder.position.set(
    bodyRadius * 0.8,
    bodyRadius * 1.1,
    bodyRadius * 0.3
  ); // Adjust x, y, z as needed
  weaponHolder.rotation.y = -Math.PI / 12; // Slight angle outward
  modelGroup.add(weaponHolder);

  // Add shadows to all parts
  modelGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true; // Parts can receive shadows from other parts
    }
  });

  return modelGroup;
}

// --- End Player Models ---

// Create a simple weapon model attached to the camera
function createWeaponModel() {
  // Clear any existing weapon model
  const existingWeapon = camera.getObjectByName("weaponModel");
  if (existingWeapon) {
    camera.remove(existingWeapon);
  }

  // Create weapon container
  const weaponContainer = new THREE.Object3D();
  weaponContainer.name = "weaponModel";
  weaponContainer.position.set(0.2, -0.2, -0.5);

  let weaponGeometry, weaponMaterial;

  switch (currentWeapon) {
    case "pistol":
      weaponGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
      break;
    case "shotgun":
      weaponGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x663300 });
      break;
    case "machineGun":
      weaponGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.6);
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
      break;
    default:
      weaponGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  }

  const weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
  weaponContainer.add(weaponMesh);

  // Create muzzle flash (initially invisible)
  const flashGeometry = new THREE.CircleGeometry(0.1, 16);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
  });

  muzzleFlash = new THREE.Mesh(flashGeometry, flashMaterial);
  muzzleFlash.name = "muzzleFlash";

  // Position flash at the end of the weapon
  muzzleFlash.position.set(0, 0, -0.15 - weaponGeometry.parameters.depth / 2);
  muzzleFlash.rotation.y = Math.PI / 2;

  weaponContainer.add(muzzleFlash);
  camera.add(weaponContainer);
}

// Create weapon pickups scattered around the map
function createWeaponPickups() {
  const pickupGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);

  // Create shotgun pickup
  const shotgunPickupMaterial = new THREE.MeshStandardMaterial({
    color: 0xff7700,
    emissive: 0x331100,
  });
  const shotgunPickup = new THREE.Mesh(pickupGeometry, shotgunPickupMaterial);
  shotgunPickup.position.set(10, 1, 15);
  shotgunPickup.userData.isWeaponPickup = true;
  shotgunPickup.userData.weaponType = "shotgun";
  scene.add(shotgunPickup);

  // Create machine gun pickup
  const machineGunPickupMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x003333,
  });
  const machineGunPickup = new THREE.Mesh(
    pickupGeometry,
    machineGunPickupMaterial
  );
  machineGunPickup.position.set(-15, 1, -10);
  machineGunPickup.userData.isWeaponPickup = true;
  machineGunPickup.userData.weaponType = "machineGun";
  scene.add(machineGunPickup);
}

// Create environmental elements and obstacles
function createEnvironment() {
  // Create some buildings/walls
  const buildingGeometry = new THREE.BoxGeometry(5, 10, 5);
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

  // Create a few buildings at specific positions
  const buildingPositions = [
    { x: -20, z: -15 },
    { x: 15, z: -25 },
    { x: -30, z: 10 },
    { x: 25, z: 20 },
    { x: 0, z: -40 },
    { x: -15, z: 30 },
  ];

  buildingPositions.forEach((pos) => {
    const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building.position.set(pos.x, 5, pos.z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    obstacles.push(building);
  });

  // Add some smaller crates/boxes as cover
  const crateGeometry = new THREE.BoxGeometry(2, 2, 2);
  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });

  for (let i = 0; i < 20; i++) {
    const crate = new THREE.Mesh(crateGeometry, crateMaterial);

    // Position crates at random locations
    const x = Math.random() * 80 - 40;
    const z = Math.random() * 80 - 40;
    crate.position.set(x, 1, z);
    crate.castShadow = true;
    crate.receiveShadow = true;

    scene.add(crate);
    obstacles.push(crate);
  }

  // Add some trees
  const treePositions = [];
  for (let i = 0; i < 15; i++) {
    // Make sure trees don't overlap with buildings
    let valid = false;
    let x, z;

    while (!valid) {
      x = Math.random() * 100 - 50;
      z = Math.random() * 100 - 50;
      valid = true;

      // Check distance from buildings
      for (const pos of buildingPositions) {
        const dx = x - pos.x;
        const dz = z - pos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 10) {
          valid = false;
          break;
        }
      }
    }

    treePositions.push({ x, z });
  }

  // Create trees
  treePositions.forEach((pos) => {
    // Tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(pos.x, 2.5, pos.z);
    trunk.castShadow = true;
    scene.add(trunk);
    obstacles.push(trunk);

    // Tree leaves
    const leavesGeometry = new THREE.ConeGeometry(3, 6, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.set(pos.x, 7, pos.z);
    leaves.castShadow = true;
    scene.add(leaves);
  });

  // Add a skybox
  const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
  const skyboxMaterials = [
    new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }), // Right
    new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }), // Left
    new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }), // Top
    new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }), // Bottom
    new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }), // Front
    new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }), // Back
  ];

  const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterials);
  scene.add(skybox);
}

// Create enemy targets - REMOVED OLD CLIENT-SIDE LOGIC
/*
function createEnemies() { ... }
*/

// Create a health bar for an enemy - REMOVED OLD CLIENT-SIDE LOGIC
/*
function createHealthBar(enemy) { ... }
*/

// Update enemy health bars - REMOVED OLD CLIENT-SIDE LOGIC
/*
function updateHealthBars() { ... }
*/

// Set up keyboard and mouse controls
function setupControls() {
  // Keyboard controls
  document.addEventListener("keydown", (event) => {
    if (isPaused) return;

    switch (event.code) {
      case "KeyW":
        moveForward = true;
        break;
      case "KeyS":
        moveBackward = true;
        break;
      case "KeyA":
        moveLeft = true;
        break;
      case "KeyD":
        moveRight = true;
        break;
      case "Space":
        if (!isJumping) {
          isJumping = true;
          velocity.y = 10; // Jump force
        }
        break;
      case "Digit1":
        switchWeapon("pistol");
        break;
      case "Digit2":
        switchWeapon("shotgun");
        break;
      case "Digit3":
        switchWeapon("machineGun");
        break;
      case "Escape":
        togglePause();
        break;
    }
  });

  document.addEventListener("keyup", (event) => {
    if (isPaused) return;

    switch (event.code) {
      case "KeyW":
        moveForward = false;
        break;
      case "KeyS":
        moveBackward = false;
        break;
      case "KeyA":
        moveLeft = false;
        break;
      case "KeyD":
        moveRight = false;
        break;
    }
  });

  // Mouse controls for looking around
  document.addEventListener("mousemove", (event) => {
    if (!gameActive || isPaused) return;

    // Rotate player based on mouse movement
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    player.rotation.y -= movementX * 0.002;
    camera.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, camera.rotation.x - movementY * 0.002)
    );
  });

  // Lock pointer when clicking on game
  renderer.domElement.addEventListener("click", () => {
    if (!isPaused) {
      renderer.domElement.requestPointerLock();
    }
  });

  // Shooting
  document.addEventListener("mousedown", (event) => {
    if (!gameActive || isPaused) return;
    if (event.button === 0) {
      // Left mouse button
      shoot();
    }
  });
}

// Switch to a different weapon
function switchWeapon(weaponType) {
  if (weapons[weaponType] && currentWeapon !== weaponType) {
    currentWeapon = weaponType;
    updateWeaponDisplay();
    createWeaponModel();
    // Notify server about weapon change
    if (socket && socket.connected) {
      socket.emit("playerUpdate", { currentWeapon: currentWeapon });
    }
  }
}

// Update the weapon UI display
function updateWeaponDisplay() {
  weaponElement.textContent = `Weapon: ${currentWeapon}`;
}

// Helper to play shoot sound (can be called locally and for remote shots)
function playShootSound(weaponType, position = null) {
  let soundFile = "";
  const weapon = weapons[weaponType];
  if (!weapon) return;

  switch (weaponType) {
    case "pistol":
      soundFile = "sounds/pistol_shot.wav"; // Replace with your actual file path
      break;
    case "shotgun":
      soundFile = "sounds/shotgun_shot.wav"; // Replace with your actual file path
      break;
    case "machineGun":
      soundFile = "sounds/machine_gun_shot.wav"; // Replace with your actual file path
      break;
  }

  if (soundFile) {
    const shootSound = new Audio(soundFile);
    // TODO: Implement positional audio if position is provided
    shootSound.play();
  }
}

// Create a bullet and shoot based on current weapon
function shoot() {
  const weapon = weapons[currentWeapon];
  const now = performance.now() / 1000; // Current time in seconds

  // Check fire rate
  if (now - weapon.lastFired < weapon.fireRate) {
    return; // Can't shoot yet
  }

  // Update last fired time
  weapon.lastFired = now;

  // Play weapon sound LOCALLY
  playShootSound(currentWeapon);

  // Notify the server that we shot
  if (socket && socket.connected) {
    socket.emit("shoot", {
      weapon: currentWeapon /*, add direction/target info if needed */,
    });
  }

  // Show muzzle flash
  if (muzzleFlash) {
    muzzleFlash.material.opacity = 1.0;
    setTimeout(() => {
      if (muzzleFlash) {
        muzzleFlash.material.opacity = 0.0;
      }
    }, 50);
  }

  // Handle different weapon types (client-side bullet creation for immediate feedback)
  // Server should validate and handle actual hit detection / damage
  if (currentWeapon === "shotgun") {
    for (let i = 0; i < weapon.pellets; i++) {
      createBullet(weapon, true);
    }
  } else {
    createBullet(weapon, false);
  }
}

// Create an individual bullet (client-side for visual effect)
function createBullet(weapon, applyShotgunSpread) {
  const bulletGeometry = new THREE.SphereGeometry(weapon.bulletSize, 8, 8);
  const bulletMaterial = new THREE.MeshBasicMaterial({
    color: weapon.bulletColor,
  });
  const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

  const cameraWorldPos = new THREE.Vector3();
  camera.getWorldPosition(cameraWorldPos);

  const cameraDirection = new THREE.Vector3(0, 0, -1);
  cameraDirection.applyMatrix4(camera.matrixWorld);
  cameraDirection.sub(cameraWorldPos).normalize();

  const bulletDistance = 0.5; // Start closer to camera/player center
  bullet.position
    .copy(cameraWorldPos)
    .add(cameraDirection.clone().multiplyScalar(bulletDistance));

  const bulletDirection = cameraDirection.clone();

  if (applyShotgunSpread) {
    bulletDirection.x += (Math.random() - 0.5) * weapon.spread;
    bulletDirection.y += (Math.random() - 0.5) * weapon.spread;
    bulletDirection.z += (Math.random() - 0.5) * weapon.spread;
    bulletDirection.normalize();
  }

  bullet.userData.velocity = bulletDirection.multiplyScalar(weapon.bulletSpeed);
  bullet.userData.alive = true;
  bullet.userData.isBullet = true;
  bullet.userData.damage = weapon.damage; // Keep damage info for potential client-side hit checks
  bullet.userData.ownerId = myId; // Mark who shot this bullet

  scene.add(bullet);
  bullets.push(bullet);
}

// Check if a bullet hit an enemy or obstacle (or REMOTE PLAYER)
function checkBulletCollisions() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    // Iterate backwards for safe removal
    const bullet = bullets[i];
    if (!bullet || !bullet.userData.alive) continue;

    let bulletRemoved = false;

    // Check collision with remote players - DISABLED FOR PvE
    /*
    for (const playerId in remotePlayers) {
        if (playerId === bullet.userData.ownerId) continue; // Don't hit self

        const remotePlayer = remotePlayers[playerId];
        if (!remotePlayer || !remotePlayer.mesh || !remotePlayer.mesh.visible) continue; // Skip if player doesn't exist or is dead/hidden

        // Simple distance check (could use bounding boxes for better accuracy)
        const distance = bullet.position.distanceTo(remotePlayer.mesh.position);
        const hitRadius = 1.0; // Adjust based on player model size

        if (distance < hitRadius) {
            console.log(`Client-side hit detected on player ${playerId}`);
            // Notify server about the hit
            if (socket && socket.connected) {
                socket.emit('takeDamage', { playerId: playerId, damage: bullet.userData.damage });
            }

            // Remove bullet visually on client
            createHitEffect(bullet.position.clone()); // Show hit effect
            bullet.userData.alive = false;
            scene.remove(bullet);
            bullets.splice(i, 1); // Remove from array
            bulletRemoved = true;
            break; // Bullet can only hit one player
        }
    }
    */

    if (bulletRemoved) continue; // Go to next bullet if already removed (though shouldn't happen now)

    // Check collision with obstacles (keep client-side for immediate feedback)
    if (bullet.userData.alive) {
      for (let j = 0; j < obstacles.length; j++) {
        const obstacle = obstacles[j];
        // Create a bounding box for the obstacle for more accurate collision
        const obstacleBox = new THREE.Box3().setFromObject(obstacle);

        // Check if bullet position is inside the obstacle's bounding box
        if (obstacleBox.containsPoint(bullet.position)) {
          // Bullet hit obstacle
          createHitEffect(bullet.position.clone());
          bullet.userData.alive = false;
          scene.remove(bullet);
          bullets.splice(i, 1); // Remove from array
          bulletRemoved = true;
          break;
        }
      }
    }

    // TODO: Check client-side collision with ZOMBIES for immediate feedback?
    // Note: Server should be the authority on damage/death
    if (bullet.userData.alive && !bulletRemoved) {
      for (const zombieId in clientZombies) {
        const zombie = clientZombies[zombieId];
        if (!zombie || !zombie.mesh) continue;

        // Simple distance check for now
        const distance = bullet.position.distanceTo(zombie.mesh.position);
        const hitRadius = 1.0; // Adjust based on zombie model size

        if (distance < hitRadius) {
          console.log(`Client-side bullet hit detected on zombie ${zombieId}`);
          createHitEffect(bullet.position.clone()); // Show hit effect
          // Remove bullet locally
          bullet.userData.alive = false;
          scene.remove(bullet);
          bullets.splice(i, 1);
          bulletRemoved = true;

          // Notify server about the hit
          if (socket && socket.connected) {
            socket.emit("zombieHit", {
              zombieId: zombieId,
              damage: bullet.userData.damage,
            });
          }
          break; // Bullet hits one zombie
        }
      }
    }
  }

  // Clean up any remaining dead bullets (should be less necessary now)
  // bullets = bullets.filter((bullet) => bullet.userData.alive);
}

// Create visual effect for bullet impact
function createHitEffect(position) {
  // Create particle effect for impact
  const particleCount = 8;
  const particleGeometry = new THREE.SphereGeometry(0.05, 4, 4);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 1.0,
  });

  const particles = [];

  // Create particles that scatter from impact point
  for (let i = 0; i < particleCount; i++) {
    const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
    particle.position.copy(position);

    // Random direction
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();

    particle.userData.direction = direction;
    particle.userData.speed = Math.random() * 0.2 + 0.1;
    particle.userData.life = 1.0; // Full life

    scene.add(particle);
    particles.push(particle);
  }

  // Animate particles
  const animateParticles = () => {
    let allDead = true;

    particles.forEach((particle) => {
      if (particle.userData.life > 0) {
        allDead = false;

        // Move particle
        particle.position.add(
          particle.userData.direction
            .clone()
            .multiplyScalar(particle.userData.speed)
        );

        // Reduce life and opacity
        particle.userData.life -= 0.05;
        particle.material.opacity = particle.userData.life;
      } else {
        scene.remove(particle);
      }
    });

    if (!allDead) {
      requestAnimationFrame(animateParticles);
    }
  };

  animateParticles();
}

// Check for collision between player and obstacles
function checkPlayerCollisions() {
  // Keep obstacle collision logic
  const playerBox = new THREE.Box3().setFromCenterAndSize(
    player.position,
    new THREE.Vector3(1, 1.8, 1) // Approximate player size
  );

  for (let i = 0; i < obstacles.length; i++) {
    const obstacle = obstacles[i];
    const obstacleBox = new THREE.Box3().setFromObject(obstacle);

    if (playerBox.intersectsBox(obstacleBox)) {
      // More robust collision response needed here - push player out correctly
      // Simple pushback based on direction (can get stuck)
      const pushDirection = new THREE.Vector3()
        .subVectors(player.position, obstacle.position)
        .normalize();
      pushDirection.y = 0; // Don't push vertically from obstacles usually

      // Calculate overlap (less precise with this simple push)
      const overlap = 0.1; // Small push amount
      player.position.add(pushDirection.multiplyScalar(overlap));

      // Prevent falling through floor after collision
      if (player.position.y < 1.6) {
        player.position.y = 1.6;
        velocity.y = Math.max(0, velocity.y); // Stop downward velocity if hitting side
      }
    }
  }

  // Check for weapon pickups
  scene.children.forEach((object) => {
    if (object.userData.isWeaponPickup) {
      const distance = player.position.distanceTo(object.position);

      if (distance < 1.5) {
        // Picked up weapon
        switchWeapon(object.userData.weaponType);
        scene.remove(object); // Remove locally
        // TODO: Notify server that this pickup was taken? Or server manages pickups?
      }
    }
  });
}

// Update player position based on keyboard input AND send to server
function updatePlayer(deltaTime) {
  // Apply gravity
  velocity.y -= 9.8 * deltaTime;

  // Calculate movement direction
  direction.z = Number(moveBackward) - Number(moveForward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();

  // Movement speed
  const speed = 5.0;

  // Calculate velocity based on input
  const forwardVelocity = direction.z * speed;
  const sideVelocity = direction.x * speed;

  // Apply velocity relative to player's rotation
  const moveDirection = new THREE.Vector3(sideVelocity, 0, forwardVelocity);
  moveDirection.applyQuaternion(player.quaternion); // Apply player's Y rotation

  // Apply movement
  player.position.x += moveDirection.x * deltaTime;
  player.position.z += moveDirection.z * deltaTime;
  player.position.y += velocity.y * deltaTime;

  // Ground check
  if (player.position.y < 1.6) {
    player.position.y = 1.6;
    velocity.y = 0;
    isJumping = false;
  }

  // Check for collisions with obstacles AFTER applying movement
  checkPlayerCollisions();

  // Send state update to server (throttled)
  const now = performance.now();
  if (
    socket &&
    socket.connected &&
    now - lastSentStateTime > stateUpdateInterval
  ) {
    socket.emit("playerUpdate", {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      rotationY: player.rotation.y, // Player body rotation
      rotationX: camera.rotation.x, // Camera pitch
      // Include other state like health if needed, though server might manage it
    });
    lastSentStateTime = now;
  }
}

// Update bullets position
function updateBullets(deltaTime) {
  for (let i = 0; i < bullets.length; i++) {
    const bullet = bullets[i];

    // Move bullet
    bullet.position.add(
      bullet.userData.velocity.clone().multiplyScalar(deltaTime)
    );

    // Remove bullets that have traveled too far
    if (bullet.position.distanceTo(player.position) > 100) {
      scene.remove(bullet);
      bullet.userData.alive = false;
    }
  }
}

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Toggle pause state
function togglePause() {
  if (!gameActive) return;

  isPaused = !isPaused;

  if (isPaused) {
    pauseScreen.style.display = "flex";
    // Hide UI elements when paused
    uiElement.style.display = "none";
    crosshairElement.style.display = "none";
    weaponElement.style.display = "none";
    document.exitPointerLock();
  } else {
    pauseScreen.style.display = "none";
    // Show UI elements when resuming
    uiElement.style.display = "block";
    crosshairElement.style.display = "block";
    weaponElement.style.display = "block";
    renderer.domElement.requestPointerLock();
  }
}

// Animation loop
function animate() {
  if (!gameActive && !socket?.connected) {
    // Stop if game not active OR disconnected
    // Clean up resources if needed?
    return;
  }

  requestAnimationFrame(animate);

  if (!isPaused) {
    const deltaTime = Math.min(0.1, clock.getDelta()); // Use clock delta for smoother updates

    // Update local player (applies input, gravity, sends updates)
    updatePlayer(deltaTime);

    // Update client-side bullets
    updateBullets(deltaTime);
    checkBulletCollisions(); // Check hits locally (now includes zombies)

    // Update enemy behavior - Client only updates visuals based on server data
    // updateEnemies(deltaTime);
    updateZombieVisuals(); // Update health bars etc.

    // Update enemy health bars - REMOVED OLD CLIENT-SIDE LOGIC
    // updateHealthBars();

    // No client-side victory condition based on enemies for now
    /*
    if (
      enemies.length === 0 ||
      enemies.every((enemy) => enemy.userData.health <= 0)
    ) {
      victory();
    }
    */
  }

  // Render the scene (always render, even if paused)
  renderer.render(scene, camera);
}

// Simple enemy AI behavior - REMOVED OLD CLIENT-SIDE LOGIC
/*
function updateEnemies(deltaTime) { ... }
*/

// Game over function (triggered by health reaching 0 from server update)
function gameOver() {
  // This might be triggered when health reaches 0 via 'healthUpdate' or 'playerDied'
  // The server handles respawn now, so client doesn't need to fully stop game state
  console.log("Game Over triggered locally (likely due to health reaching 0)");
  // Maybe show a temporary "You Died" message before respawn happens
  //   startScreen.style.display = "flex";
  //   startScreen.querySelector("h1").textContent = "You Died!";
  //   startScreen.querySelector("p").textContent = `Waiting to respawn... Score: ${score}`;
  // Don't reset game here, wait for server 'respawn' message
  gameActive = false; // Temporarily disable input?
}

// Victory function - REMOVED (no enemy win condition)
/*
function victory() { ... }
*/

// Reset game state (called on Quit or Disconnect)
function resetGame() {
  console.log("Resetting local game state...");
  playerHealth = 100; // Reset defaults
  score = 0;
  scoreElement.textContent = score;
  healthElement.textContent = playerHealth;
  currentWeapon = "pistol";
  updateWeaponDisplay();

  Object.keys(weapons).forEach((weapon) => {
    weapons[weapon].lastFired = 0;
  });

  // Remove local bullets
  for (const bullet of bullets) {
    scene.remove(bullet);
  }
  bullets = [];

  // Remove remote players
  for (const playerId in remotePlayers) {
    removeRemotePlayer(playerId);
  }
  remotePlayers = {};

  // Remove client-side zombies
  for (const zombieId in clientZombies) {
    removeZombie(zombieId);
  }
  clientZombies = {}; // Clear the object

  // Enemies are already disabled

  // Remove obstacles? No, keep environment for next game.

  // Clean up renderer only if truly quitting app, not just disconnecting
  // if (renderer && document.body.contains(renderer.domElement)) {
  //    document.body.removeChild(renderer.domElement);
  //    renderer = null; // Allow garbage collection
  // }
  // Reset camera/player object positions if needed? Server sets initial pos.
  if (player) player.position.set(0, 1.6, 0);

  gameActive = false; // Ensure game loop stops if not already
  isPaused = false; // Ensure not paused
  myId = null;
  isHost = false; // Reset host status
  serverGameInProgress = false; // Reset game status
}

// Simple representation for remote players - REPLACED
// const remotePlayerGeometry = new THREE.BoxGeometry(1, 1.8, 1);
// const remotePlayerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red cube

function addRemotePlayer(playerData) {
  if (remotePlayers[playerData.id]) return; // Already exists

  console.log(
    `Adding remote player ${playerData.id} with weapon ${playerData.currentWeapon}`
  );
  const remotePlayerMesh = createFatGuyModel(); // Use the new model function

  remotePlayerMesh.position.set(playerData.x, 0, playerData.z); // Set base position
  remotePlayerMesh.rotation.y = playerData.rotationY || 0;

  // Find the weapon holder and attach the initial weapon
  const weaponHolder = remotePlayerMesh.getObjectByName("weaponHolder");
  if (weaponHolder) {
    const weaponMesh = createRemoteWeaponMesh(
      playerData.currentWeapon || "pistol"
    );
    weaponHolder.add(weaponMesh);
  }

  scene.add(remotePlayerMesh);
  remotePlayers[playerData.id] = { mesh: remotePlayerMesh, data: playerData };
}

function updateRemotePlayer(playerData) {
  if (!remotePlayers[playerData.id]) {
    console.warn(
      `Received update for unknown player ${playerData.id}, adding.`
    );
    addRemotePlayer(playerData); // Attempt to add if missing
    return;
  }

  const remotePlayer = remotePlayers[playerData.id];
  const oldData = remotePlayer.data;

  // Update position and rotation (with interpolation TODO)
  remotePlayer.mesh.position.set(playerData.x, 0, playerData.z);
  remotePlayer.mesh.rotation.y = playerData.rotationY;

  // Update weapon model if changed
  if (playerData.currentWeapon !== oldData.currentWeapon) {
    console.log(
      `Player ${playerData.id} switched weapon to ${playerData.currentWeapon}`
    );
    const weaponHolder = remotePlayer.mesh.getObjectByName("weaponHolder");
    if (weaponHolder) {
      // Remove existing weapon
      const oldWeapon = weaponHolder.getObjectByName("remoteWeapon");
      if (oldWeapon) {
        weaponHolder.remove(oldWeapon);
      }
      // Add new weapon
      const newWeaponMesh = createRemoteWeaponMesh(playerData.currentWeapon);
      weaponHolder.add(newWeaponMesh);
    }
  }

  // Update stored data
  remotePlayer.data = playerData;

  // Head/Camera Pitch
  const head = remotePlayer.mesh.children.find(
    (child) =>
      child.geometry instanceof THREE.SphereGeometry && child.position.y > 1
  );
  if (head && playerData.rotationX !== undefined) {
    const visualPitch = Math.max(
      -Math.PI / 4,
      Math.min(Math.PI / 4, playerData.rotationX)
    );
    head.rotation.x = visualPitch;
  }
}

function removeRemotePlayer(playerId) {
  if (remotePlayers[playerId]) {
    scene.remove(remotePlayers[playerId].mesh);
    delete remotePlayers[playerId];
    console.log(`Removed remote player ${playerId}`);
  }
}

// --- Remote Weapon Model Function ---
function createRemoteWeaponMesh(weaponType) {
  let weaponGeometry,
    weaponMaterial,
    scaleFactor = 0.8; // Slightly smaller for remote view

  switch (weaponType) {
    case "pistol":
    default:
      weaponGeometry = new THREE.BoxGeometry(
        0.1 * scaleFactor,
        0.1 * scaleFactor,
        0.3 * scaleFactor
      );
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
      break;
    case "shotgun":
      weaponGeometry = new THREE.BoxGeometry(
        0.1 * scaleFactor,
        0.1 * scaleFactor,
        0.5 * scaleFactor
      );
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x663300 });
      break;
    case "machineGun":
      weaponGeometry = new THREE.BoxGeometry(
        0.1 * scaleFactor,
        0.1 * scaleFactor,
        0.6 * scaleFactor
      );
      weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
      break;
  }
  const weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
  weaponMesh.castShadow = true;
  weaponMesh.name = "remoteWeapon"; // Give it a name for easy finding/removal
  return weaponMesh;
}
// --- End Remote Weapon Model Function ---

// --- Zombie Model and Management ---

// Function to create the zombie model (adapted from old createEnemies)
function createZombieModel() {
  const zombieGroup = new THREE.Group();

  // Re-use geometry definitions
  const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
  const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
  const armGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);

  // Material (can be reused)
  const zombieMaterial = new THREE.MeshStandardMaterial({
    color: 0x556b2f, // Dark green
    roughness: 0.8,
    metalness: 0.2,
  });

  // Create body parts
  const body = new THREE.Mesh(bodyGeometry, zombieMaterial);
  const head = new THREE.Mesh(headGeometry, zombieMaterial);
  const leftArm = new THREE.Mesh(armGeometry, zombieMaterial);
  const rightArm = new THREE.Mesh(armGeometry, zombieMaterial);
  const leftLeg = new THREE.Mesh(legGeometry, zombieMaterial);
  const rightLeg = new THREE.Mesh(legGeometry, zombieMaterial);

  // Position body parts relative to the group origin (which will be at the zombie's feet)
  body.position.y = 0.6 + 0.4; // Center of body raised by half height + leg height
  head.position.y = body.position.y + 0.6 + 0.15; // Position head above body center
  leftArm.position.set(-0.5, body.position.y, 0);
  rightArm.position.set(0.5, body.position.y, 0);
  leftLeg.position.set(-0.2, 0.4, 0); // Center of leg raised by half height
  rightLeg.position.set(0.2, 0.4, 0);

  // Add body parts to zombie group
  zombieGroup.add(body);
  zombieGroup.add(head);
  zombieGroup.add(leftArm);
  zombieGroup.add(rightArm);
  zombieGroup.add(leftLeg);
  zombieGroup.add(rightLeg);

  // Add shadows
  zombieGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  // TODO: Add health bar creation (adapted from createHealthBar)
  // createZombieHealthBar(zombieGroup);

  return zombieGroup;
}

// Add or update a zombie based on server data
function addOrUpdateZombie(zombieData) {
  if (clientZombies[zombieData.id]) {
    // Update existing zombie
    const existingZombie = clientZombies[zombieData.id];
    // TODO: Interpolate position smoothly
    existingZombie.mesh.position.set(zombieData.x, zombieData.y, zombieData.z);
    existingZombie.data = zombieData; // Update stored data
    // TODO: Update health bar visual
  } else {
    // Create new zombie
    console.log("Creating mesh for new zombie:", zombieData.id);
    const zombieMesh = createZombieModel();
    zombieMesh.position.set(zombieData.x, zombieData.y, zombieData.z);
    zombieMesh.userData.id = zombieData.id; // Store ID for reference
    scene.add(zombieMesh);
    clientZombies[zombieData.id] = { mesh: zombieMesh, data: zombieData };
  }
}

// Remove a zombie from the scene
function removeZombie(zombieId) {
  if (clientZombies[zombieId]) {
    console.log("Removing zombie mesh:", zombieId);
    scene.remove(clientZombies[zombieId].mesh);
    delete clientZombies[zombieId];
  } else {
    console.warn("Tried to remove non-existent zombie:", zombieId);
  }
}

// TODO: Function to update zombie visuals (like health bars) based on data
function updateZombieVisuals() {
  // Iterate through clientZombies and update health bars, etc.
}

// --- End Zombie Management ---
