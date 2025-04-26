// Game variables
let scene, camera, renderer;
let player,
  playerHealth = 100;
let score = 0;
let enemies = [];
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
  startScreen.style.display = "none";
  gameActive = true;
  // Show UI elements when game starts
  uiElement.style.display = "block";
  crosshairElement.style.display = "block";
  weaponElement.style.display = "block";
  init();
  animate();
  updateWeaponDisplay();
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

  // Create player
  player = new THREE.Object3D();
  player.position.set(0, 1.6, 0);
  scene.add(player);
  camera.position.set(0, 0, 0);
  player.add(camera);

  // Create weapon model
  createWeaponModel();

  // Create environment
  createEnvironment();

  // Create enemies
  createEnemies();

  // Create weapon pickups
  createWeaponPickups();

  // Set up controls
  setupControls();

  // Window resize handler
  window.addEventListener("resize", onWindowResize);
}

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

// Create enemy targets
function createEnemies() {
  // Create zombie body parts
  const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
  const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
  const armGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);

  // Create some zombies at random positions
  for (let i = 0; i < 10; i++) {
    // Create zombie container
    const zombie = new THREE.Group();

    // Create a new material instance for each zombie
    const zombieMaterial = new THREE.MeshStandardMaterial({
      color: 0x556b2f,
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

    // Position body parts
    body.position.y = 0.6;
    head.position.y = 1.5;
    leftArm.position.set(-0.5, 0.6, 0);
    rightArm.position.set(0.5, 0.6, 0);
    leftLeg.position.set(-0.2, 0, 0);
    rightLeg.position.set(0.2, 0, 0);

    // Add body parts to zombie
    zombie.add(body);
    zombie.add(head);
    zombie.add(leftArm);
    zombie.add(rightArm);
    zombie.add(leftLeg);
    zombie.add(rightLeg);

    // Add some random rotation to make zombies look more undead
    head.rotation.x = Math.random() * 0.2 - 0.1;
    head.rotation.z = Math.random() * 0.2 - 0.1;
    body.rotation.z = Math.random() * 0.1 - 0.05;

    // Position zombie at random location
    const x = Math.random() * 100 - 50;
    const z = Math.random() * 100 - 50;
    zombie.position.set(x, 0.4, z); // Raise zombie to proper height

    // Add shadows
    zombie.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
      }
    });

    // Add zombie properties
    zombie.userData.health = 100;
    zombie.userData.maxHealth = 100;
    zombie.userData.isEnemy = true;
    zombie.userData.isAggro = false;
    zombie.userData.animationTime = Math.random() * Math.PI * 2; // Random start phase
    zombie.userData.animationSpeed = 0.5 + Math.random() * 0.5; // Random speed

    // Create health bar
    createHealthBar(zombie);

    scene.add(zombie);
    enemies.push(zombie);
  }
}

// Create a health bar for an enemy
function createHealthBar(enemy) {
  // Create health bar container
  const healthBarContainer = new THREE.Object3D();
  healthBarContainer.name = "healthBarContainer";

  // Create background bar
  const barGeometry = new THREE.PlaneGeometry(1.2, 0.2);
  const backgroundMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const backgroundBar = new THREE.Mesh(barGeometry, backgroundMaterial);

  // Create health indicator bar
  const healthBarGeometry = new THREE.PlaneGeometry(1.2, 0.2);
  const healthBarMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
  healthBar.name = "healthIndicator";

  // Position the health bar above the enemy
  healthBarContainer.position.set(0, 2.5, 0);
  healthBar.position.set(0, 0, 0.01); // Slightly in front of background

  // Add to container
  healthBarContainer.add(backgroundBar);
  healthBarContainer.add(healthBar);

  // Add container to enemy
  enemy.add(healthBarContainer);

  // Initial rotation to face player
  healthBarContainer.lookAt(player.position);
}

// Update enemy health bars
function updateHealthBars() {
  enemies.forEach((enemy) => {
    if (enemy.userData.health <= 0) return;

    const healthBarContainer = enemy.getObjectByName("healthBarContainer");
    if (!healthBarContainer) return;

    const healthBar = healthBarContainer.getObjectByName("healthIndicator");
    if (!healthBar) return;

    const healthPercent = enemy.userData.health / enemy.userData.maxHealth;

    // Scale health bar based on current health
    healthBar.scale.x = healthPercent;
    healthBar.position.x = -0.6 * (1 - healthPercent); // Align left edge

    // Change color based on health percentage
    if (healthPercent > 0.6) {
      healthBar.material.color.setHex(0x00ff00); // Green
    } else if (healthPercent > 0.3) {
      healthBar.material.color.setHex(0xffff00); // Yellow
    } else {
      healthBar.material.color.setHex(0xff0000); // Red
    }
  });
}

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
  if (weapons[weaponType]) {
    currentWeapon = weaponType;
    updateWeaponDisplay();
    createWeaponModel();
  }
}

// Update the weapon UI display
function updateWeaponDisplay() {
  weaponElement.textContent = `Weapon: ${currentWeapon}`;
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

  // Play weapon sound
  let soundFile = "";
  switch (currentWeapon) {
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
    shootSound.play();
  }

  // Show muzzle flash
  if (muzzleFlash) {
    muzzleFlash.material.opacity = 1.0;

    // Hide after short delay
    setTimeout(() => {
      if (muzzleFlash) {
        muzzleFlash.material.opacity = 0.0;
      }
    }, 50);
  }

  // Handle different weapon types
  if (currentWeapon === "shotgun") {
    // Shotgun fires multiple pellets in a spread
    for (let i = 0; i < weapon.pellets; i++) {
      createBullet(weapon, true);
    }
  } else {
    // Single bullet for other weapons
    createBullet(weapon, false);
  }
}

// Create an individual bullet
function createBullet(weapon, applyShotgunSpread) {
  const bulletGeometry = new THREE.SphereGeometry(weapon.bulletSize, 8, 8);
  const bulletMaterial = new THREE.MeshBasicMaterial({
    color: weapon.bulletColor,
  });
  const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

  // Get the camera's world position and direction
  const cameraWorldPos = new THREE.Vector3();
  camera.getWorldPosition(cameraWorldPos);

  // Get the camera's forward direction using its world matrix
  const cameraDirection = new THREE.Vector3(0, 0, -1);
  cameraDirection.applyMatrix4(camera.matrixWorld);
  cameraDirection.sub(cameraWorldPos).normalize();

  // Position the bullet slightly in front of the camera
  const bulletDistance = 1; // Distance in front of camera to spawn bullet
  bullet.position
    .copy(cameraWorldPos)
    .add(cameraDirection.clone().multiplyScalar(bulletDistance));

  // Set bullet direction based on camera look direction
  const bulletDirection = cameraDirection.clone();

  // Apply spread for shotgun
  if (applyShotgunSpread) {
    bulletDirection.x += (Math.random() - 0.5) * weapon.spread;
    bulletDirection.y += (Math.random() - 0.5) * weapon.spread;
    bulletDirection.z += (Math.random() - 0.5) * weapon.spread;
    bulletDirection.normalize();
  }

  bullet.userData.velocity = bulletDirection.multiplyScalar(weapon.bulletSpeed);
  bullet.userData.alive = true;
  bullet.userData.isBullet = true;
  bullet.userData.damage = weapon.damage;

  scene.add(bullet);
  bullets.push(bullet);
}

// Check if a bullet hit an enemy or obstacle
function checkBulletCollisions() {
  for (let i = 0; i < bullets.length; i++) {
    const bullet = bullets[i];
    if (!bullet.userData.alive) continue;

    // Check collision with each enemy
    for (let j = 0; j < enemies.length; j++) {
      const enemy = enemies[j];
      if (enemy.userData.health <= 0) continue;

      // Simple distance-based collision detection
      const distance = bullet.position.distanceTo(enemy.position);
      if (distance < 1) {
        // Enemy hit, reduce health
        enemy.userData.health -= bullet.userData.damage;
        enemy.userData.isAggro = true; // Set aggro when hit
        bullet.userData.alive = false;
        scene.remove(bullet);

        // Create hit impact effect
        createHitEffect(bullet.position.clone());

        if (enemy.userData.health <= 0) {
          // Flag as dead immediately
          enemy.userData.isDead = true;

          // Remove health bar immediately
          const healthBarContainer =
            enemy.getObjectByName("healthBarContainer");
          if (healthBarContainer) {
            enemy.remove(healthBarContainer);
          }

          // Enemy defeated animation - red flash
          enemy.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.material.emissive.setHex(0xff0000);
              object.material.transparent = true;
              object.material.opacity = 0.8;
            }
          });

          // Remove enemy from the array immediately to stop processing it
          const index = enemies.indexOf(enemy);
          if (index > -1) {
            enemies.splice(index, 1);
          }

          // Simple death animation - sink into the ground and disappear
          const deathDuration = 1000; // 1 second
          const startTime = Date.now();
          const startY = enemy.position.y;

          function animateDeath() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / deathDuration, 1);

            // Sink into ground
            enemy.position.y = startY - progress * 1.5;

            // Fade out
            enemy.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                object.material.opacity = 0.8 * (1 - progress);
              }
            });

            if (progress < 1) {
              requestAnimationFrame(animateDeath);
            } else {
              // Completely remove from scene when animation is done
              scene.remove(enemy);
            }
          }

          // Start death animation
          animateDeath();

          score += 100;
          scoreElement.textContent = score;
        } else {
          // Enemy hit, but not dead yet

          // Use the parent enemy's userData to track flashing state for the shared material
          if (!enemy.userData.isFlashingRed) {
            // Get the material (assuming all parts share the same one)
            const material = enemy.children[0]?.material;
            if (material) {
              // Store original emissive color on the parent enemy object
              enemy.userData.originalEmissive = material.emissive.clone();
              enemy.userData.isFlashingRed = true; // Mark parent as flashing

              // Set the shared material to red
              material.emissive.setHex(0xff0000);

              // Reset to original color after delay
              setTimeout(() => {
                // Check if the enemy still exists, is alive, and is still marked as flashing
                // (prevents issues if killed during the timeout)
                if (
                  enemies.includes(enemy) &&
                  enemy.userData.health > 0 &&
                  enemy.userData.isFlashingRed
                ) {
                  const currentMaterial = enemy.children[0]?.material;
                  if (currentMaterial) {
                    // Restore the original emissive color
                    if (enemy.userData.originalEmissive) {
                      currentMaterial.emissive.copy(
                        enemy.userData.originalEmissive
                      );
                    } else {
                      // Fallback: Reset to black if original somehow wasn't stored
                      currentMaterial.emissive.setHex(0x000000);
                    }
                  }
                }
                // Clean up flags on the parent enemy object regardless of checks above
                delete enemy.userData.isFlashingRed;
                delete enemy.userData.originalEmissive;
              }, 100); // Reset after 100ms
            }
          }
          // If already flashing, do nothing - the existing timeout will handle the reset.
        }

        break;
      }
    }

    // Check collision with obstacles
    if (bullet.userData.alive) {
      for (let j = 0; j < obstacles.length; j++) {
        const obstacle = obstacles[j];

        // Simple distance-based collision detection
        const distance = bullet.position.distanceTo(obstacle.position);
        if (distance < obstacle.geometry.parameters.width / 2 + 0.5) {
          // Bullet hit obstacle
          bullet.userData.alive = false;
          scene.remove(bullet);

          // Create hit impact effect
          createHitEffect(bullet.position.clone());
          break;
        }
      }
    }
  }

  // Remove dead bullets
  bullets = bullets.filter((bullet) => bullet.userData.alive);
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
  for (let i = 0; i < obstacles.length; i++) {
    const obstacle = obstacles[i];

    // Simple distance-based collision detection
    const distance = player.position.distanceTo(obstacle.position);
    const minDistance = obstacle.geometry.parameters.width / 2 + 0.5;

    if (distance < minDistance) {
      // Push player away from obstacle
      const pushDirection = new THREE.Vector3()
        .subVectors(player.position, obstacle.position)
        .normalize();

      player.position.add(
        pushDirection.multiplyScalar(minDistance - distance + 0.1)
      );
    }
  }

  // Check for weapon pickups
  scene.children.forEach((object) => {
    if (object.userData.isWeaponPickup) {
      const distance = player.position.distanceTo(object.position);

      if (distance < 1.5) {
        // Picked up weapon
        switchWeapon(object.userData.weaponType);
        scene.remove(object);
      }
    }
  });
}

// Update player position based on keyboard input
function updatePlayer(deltaTime) {
  // Apply gravity
  velocity.y -= 9.8 * deltaTime;

  // Calculate movement direction
  direction.z = Number(moveBackward) - Number(moveForward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();

  // Movement speed
  const speed = 5.0;

  // Move player based on keyboard input
  if (moveForward || moveBackward) {
    velocity.z = direction.z * speed;
  } else {
    velocity.z = 0;
  }

  if (moveLeft || moveRight) {
    velocity.x = direction.x * speed;
  } else {
    velocity.x = 0;
  }

  // Apply velocity to player position
  player.translateZ(velocity.z * deltaTime);
  player.translateX(velocity.x * deltaTime);
  player.position.y += velocity.y * deltaTime;

  // Ground check
  if (player.position.y < 1.6) {
    player.position.y = 1.6;
    velocity.y = 0;
    isJumping = false;
  }

  // Check for collisions with obstacles
  checkPlayerCollisions();
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
  if (!gameActive) return;

  requestAnimationFrame(animate);

  if (!isPaused) {
    const deltaTime = Math.min(0.1, clock.getDelta());

    // Update game objects
    updatePlayer(deltaTime);
    updateBullets(deltaTime);
    checkBulletCollisions();
    updateHealthBars();

    // Update enemy behavior
    updateEnemies(deltaTime);

    // Check if all enemies are defeated
    if (
      enemies.length === 0 ||
      enemies.every((enemy) => enemy.userData.health <= 0)
    ) {
      victory();
    }
  }

  // Render the scene
  renderer.render(scene, camera);
}

// Simple enemy AI behavior
function updateEnemies(deltaTime) {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.userData.health <= 0) continue;

    // Update zombie animation
    enemy.userData.animationTime += deltaTime * enemy.userData.animationSpeed;
    const time = enemy.userData.animationTime;

    // Animate arms and legs
    const leftArm = enemy.children[2];
    const rightArm = enemy.children[3];
    const leftLeg = enemy.children[4];
    const rightLeg = enemy.children[5];

    // Swinging arms and legs
    leftArm.rotation.x = Math.sin(time) * 0.5;
    rightArm.rotation.x = Math.sin(time + Math.PI) * 0.5;
    leftLeg.rotation.x = Math.sin(time + Math.PI) * 0.3;
    rightLeg.rotation.x = Math.sin(time) * 0.3;

    // Slight body sway
    enemy.children[0].rotation.z = Math.sin(time * 0.5) * 0.1;

    // Move enemies toward player if they're close enough or aggro'd
    const distanceToPlayer = enemy.position.distanceTo(player.position);

    if (distanceToPlayer < 20 || enemy.userData.isAggro) {
      // Show health bar when in aggro range or aggro'd
      const healthBarContainer = enemy.getObjectByName("healthBarContainer");
      if (healthBarContainer) {
        const backgroundBar = healthBarContainer.children[0];
        const healthBar = healthBarContainer.children[1];
        backgroundBar.material.opacity = 1;
        healthBar.material.opacity = 1;
      }

      // Calculate path to player (simple for now)
      const direction = new THREE.Vector3()
        .subVectors(player.position, enemy.position)
        .normalize();

      // Keep direction on the ground plane
      direction.y = 0;
      direction.normalize();

      // Check for obstacles in the way
      const raycaster = new THREE.Raycaster(
        enemy.position,
        direction,
        0,
        distanceToPlayer
      );

      const intersects = raycaster.intersectObjects(obstacles);

      if (intersects.length === 0) {
        // No obstacles, move toward player (slower for zombies)
        const moveAmount = direction.multiplyScalar(deltaTime * 1.5);
        enemy.position.x += moveAmount.x;
        enemy.position.z += moveAmount.z;

        // Keep enemy on the ground
        enemy.position.y = 0.4;

        // Make enemy look at player
        enemy.lookAt(player.position);

        // Update health bar rotation to face player
        if (healthBarContainer) {
          healthBarContainer.lookAt(player.position);
        }

        // Damage player if enemy is too close
        if (distanceToPlayer < 2 && gameActive) {
          playerHealth -= 1;
          healthElement.textContent = playerHealth;

          // Game over if health reaches 0
          if (playerHealth <= 0) {
            gameOver();
          }
        }
      } else {
        // There's an obstacle, try to navigate around it
        // Simple strategy: move in a random direction perpendicular to player direction
        const perpDirection = new THREE.Vector3(-direction.z, 0, direction.x);
        if (Math.random() > 0.5) perpDirection.negate();

        const moveAmount = perpDirection.multiplyScalar(deltaTime * 1.2);
        enemy.position.x += moveAmount.x;
        enemy.position.z += moveAmount.z;

        // Keep enemy on the ground
        enemy.position.y = 0.4;

        // Update health bar rotation to face player
        if (healthBarContainer) {
          healthBarContainer.lookAt(player.position);
        }
      }
    } else {
      // Hide health bar when out of aggro range and not aggro'd
      const healthBarContainer = enemy.getObjectByName("healthBarContainer");
      if (healthBarContainer) {
        const backgroundBar = healthBarContainer.children[0];
        const healthBar = healthBarContainer.children[1];
        backgroundBar.material.opacity = 0;
        healthBar.material.opacity = 0;
      }
    }
  }
}

// Game over function
function gameOver() {
  gameActive = false;
  startScreen.style.display = "flex";
  startScreen.querySelector("h1").textContent = "Game Over";
  startScreen.querySelector("p").textContent = `Final Score: ${score}`;
  startButton.textContent = "Play Again";

  // Reset game variables
  resetGame();
}

// Victory function
function victory() {
  gameActive = false;
  startScreen.style.display = "flex";
  startScreen.querySelector("h1").textContent = "You are dead";
  startScreen.querySelector(
    "p"
  ).textContent = `You died with a score of ${score}!`;
  startButton.textContent = "Play Again";

  // Reset game variables
  resetGame();
}

// Reset game state
function resetGame() {
  playerHealth = 100;
  score = 0;
  scoreElement.textContent = score;
  healthElement.textContent = playerHealth;
  currentWeapon = "pistol";
  updateWeaponDisplay();

  // Reset weapon last fired times
  Object.keys(weapons).forEach((weapon) => {
    weapons[weapon].lastFired = 0;
  });

  // Remove game objects
  for (const bullet of bullets) {
    scene.remove(bullet);
  }
  bullets = [];

  for (const enemy of enemies) {
    scene.remove(enemy);
  }
  enemies = [];

  // Remove obstacles (they will be recreated when game restarts)
  for (const obstacle of obstacles) {
    scene.remove(obstacle);
  }
  obstacles = [];

  // Remove renderer
  document.body.removeChild(renderer.domElement);
}
