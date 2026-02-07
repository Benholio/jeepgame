import { PlayerState, TERRAIN_SEED } from '../shared/types.js';

export interface Player {
  id: string;
  state: PlayerState;
  lastUpdate: number;
}

export class GameRoom {
  private players: Map<string, Player> = new Map();
  private terrainSeed: number = TERRAIN_SEED;
  private nextColorIndex = 0;

  private static readonly COLORS = [
    0xe74c3c, // red
    0x3498db, // blue
    0x2ecc71, // green
    0xf39c12, // orange
    0x9b59b6, // purple
    0x1abc9c, // teal
    0xe67e22, // dark orange
    0xf1c40f, // yellow
  ];

  addPlayer(id: string): void {
    const color = GameRoom.COLORS[this.nextColorIndex % GameRoom.COLORS.length];
    this.nextColorIndex++;

    const player: Player = {
      id,
      state: {
        id,
        x: 200,
        y: 300,
        angle: 0,
        frontWheelAngle: 0,
        rearWheelAngle: 0,
        velocityX: 0,
        velocityY: 0,
        color
      },
      lastUpdate: Date.now()
    };
    this.players.set(id, player);
    console.log(`Player ${id} joined. Total players: ${this.players.size}`);
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    console.log(`Player ${id} left. Total players: ${this.players.size}`);
  }

  updatePlayerState(id: string, state: Omit<PlayerState, 'id' | 'color'>): void {
    const player = this.players.get(id);
    if (player) {
      player.state = { ...state, id, color: player.state.color };
      player.lastUpdate = Date.now();
    }
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  getAllPlayers(): PlayerState[] {
    return Array.from(this.players.values()).map(p => p.state);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getTerrainSeed(): number {
    return this.terrainSeed;
  }

  // Clean up stale players (no update in 30 seconds)
  cleanupStalePlayers(): string[] {
    const now = Date.now();
    const staleTimeout = 30000;
    const staleIds: string[] = [];

    for (const [id, player] of this.players) {
      if (now - player.lastUpdate > staleTimeout) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      this.removePlayer(id);
    }

    return staleIds;
  }
}
