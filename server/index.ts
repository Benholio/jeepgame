import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from './GameRoom.js';
import { ClientMessage, ServerMessage } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = Number(process.env.PORT) || 3000;
const gameRoom = new GameRoom();

// Serve static files in production
app.use(express.static(path.join(__dirname, '../dist/client')));

// Broadcast player states at regular intervals
const BROADCAST_INTERVAL = 50; // 20 Hz
setInterval(() => {
  const players = gameRoom.getAllPlayers();
  if (players.length > 0) {
    const message: ServerMessage = {
      type: 'players',
      players
    };
    io.emit('message', message);
  }
}, BROADCAST_INTERVAL);

// Cleanup stale players
setInterval(() => {
  const staleIds = gameRoom.cleanupStalePlayers();
  for (const id of staleIds) {
    const message: ServerMessage = {
      type: 'playerLeft',
      id
    };
    io.emit('message', message);
  }
}, 10000);

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Add player to game room
  gameRoom.addPlayer(socket.id);

  // Send welcome message with player ID, terrain seed, and assigned color
  const player = gameRoom.getPlayer(socket.id);
  const welcomeMessage: ServerMessage = {
    type: 'welcome',
    id: socket.id,
    terrainSeed: gameRoom.getTerrainSeed(),
    color: player!.state.color
  };
  socket.emit('message', welcomeMessage);

  // Notify other players
  const joinMessage: ServerMessage = {
    type: 'playerJoined',
    id: socket.id
  };
  socket.broadcast.emit('message', joinMessage);

  // Handle messages from client
  socket.on('message', (message: ClientMessage) => {
    if (message.type === 'position') {
      gameRoom.updatePlayerState(socket.id, {
        x: message.x,
        y: message.y,
        angle: message.angle,
        frontWheelAngle: message.frontWheelAngle,
        rearWheelAngle: message.rearWheelAngle,
        velocityX: message.velocityX,
        velocityY: message.velocityY
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    gameRoom.removePlayer(socket.id);

    const leaveMessage: ServerMessage = {
      type: 'playerLeft',
      id: socket.id
    };
    io.emit('message', leaveMessage);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`LAN: http://0.0.0.0:${PORT} (use your machine's IP)`);
});
