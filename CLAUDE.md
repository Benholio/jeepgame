# Jeep Game - Multiplayer Hill Climb Racing Clone

## Project Overview
A web-based multiplayer game inspired by Hill Climb Racing featuring:
- Procedurally generated hills that loop infinitely
- Multiplayer: see other players (no collision)
- Simple shape-based graphics
- Physics-based vehicle with chassis, wheels, and suspension

## Tech Stack
- **Client**: Phaser 3 (with built-in Matter.js physics)
- **Server**: Node.js + Express + Socket.io
- **Build**: Vite + TypeScript
- **Shared**: Common types between client/server

## How to Run

### Development
```bash
npm install
npm run dev
```
This starts both the Vite dev server (port 5173) and the Express/Socket.io server (port 3000).

### Production Build
```bash
npm run build
npm start
```

## Architecture

### Vehicle Physics
- Rectangle chassis with 2 circular wheels
- Wheels connected via revolute joints (rotation) and distance constraints (suspension)
- Controls: Arrow keys or WASD for acceleration and tilting

### Terrain Generation
- Layered sine waves create natural-looking hills
- Generated as chain of line segments (Matter.js static body)
- Chunks generated ahead of player, removed behind
- Fixed world width (10,000px) with position wrapping for infinite loop
- Deterministic seed ensures all clients see identical terrain

### Multiplayer
- Client-authoritative model (each client runs physics locally)
- Position updates sent to server at ~20Hz
- Server broadcasts all player states to all clients
- Other players rendered as semi-transparent "ghosts" (visual only)

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Phaser game initialization |
| `src/scenes/GameScene.ts` | Main game logic, input handling |
| `src/objects/Vehicle.ts` | Player vehicle with physics |
| `src/objects/GhostVehicle.ts` | Other players (visual only) |
| `src/objects/Terrain.ts` | Procedural terrain generation |
| `src/network/SocketClient.ts` | WebSocket communication |
| `server/index.ts` | Express + Socket.io server |
| `server/GameRoom.ts` | Player management |
| `shared/types.ts` | TypeScript interfaces for network messages |

## Network Protocol

### Client -> Server
- `position`: Vehicle state (x, y, angle, wheelAngles, velocity)

### Server -> Client
- `players`: Array of all player states
- `playerJoined`: New player connected
- `playerLeft`: Player disconnected
