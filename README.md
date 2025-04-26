# 3D Shooter Game

A simple 3D first-person shooter game built with HTML5 and Three.js.

## How to Play

1. Open `index.html` in a modern web browser
2. Click the "Start Game" button
3. Use the following controls:
   - WASD keys to move
   - Mouse to look around
   - Click to shoot
   - 1, 2, 3 keys to switch weapons
4. Defeat the red enemy cubes before they reach you
5. Each defeated enemy gives you 100 points
6. You lose health when enemies get too close
7. Game ends when your health reaches 0

## Weapons

The game features three different weapon types:

- **Pistol** (1): Standard weapon with medium damage and fire rate
- **Shotgun** (2): Fires multiple pellets in a spread pattern, effective at close range
- **Machine Gun** (3): Rapid-fire weapon with lower damage per shot but high rate of fire

You can find weapon pickups scattered around the map:
- Orange cubes for shotguns
- Cyan cubes for machine guns

## Environment

The game world includes:
- Buildings for cover
- Wooden crates
- Trees
- Various obstacles to navigate around

## Requirements

- A modern web browser with WebGL support
- No additional installations required

## Development

This game uses:
- Three.js for 3D rendering
- Native JavaScript for game logic
- HTML5 Pointer Lock API for mouse controls

## Features

- First-person shooter gameplay
- Multiple weapon types with different behaviors
- Enemy AI that follows the player and avoids obstacles
- Bullet physics and collision detection
- Health and scoring system
- Game over state with restart option
- Victory condition when all enemies are defeated

Enjoy the game! 
