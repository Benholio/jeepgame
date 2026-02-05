import { io, Socket } from 'socket.io-client';
import { PlayerState, ServerMessage, PositionUpdate, TERRAIN_SEED } from '@shared/types';

export type PlayerJoinedCallback = (id: string) => void;
export type PlayerLeftCallback = (id: string) => void;
export type PlayersUpdateCallback = (players: PlayerState[]) => void;
export type WelcomeCallback = (id: string, terrainSeed: number) => void;

export class SocketClient {
  private socket: Socket;
  private playerId: string = '';
  private terrainSeed: number = TERRAIN_SEED;

  private onPlayerJoined?: PlayerJoinedCallback;
  private onPlayerLeft?: PlayerLeftCallback;
  private onPlayersUpdate?: PlayersUpdateCallback;
  private onWelcome?: WelcomeCallback;

  constructor() {
    this.socket = io({
      transports: ['websocket'],
      autoConnect: false
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('message', (message: ServerMessage) => {
      switch (message.type) {
        case 'welcome':
          this.playerId = message.id;
          this.terrainSeed = message.terrainSeed;
          console.log('Received welcome, player ID:', this.playerId);
          if (this.onWelcome) {
            this.onWelcome(message.id, message.terrainSeed);
          }
          break;

        case 'playerJoined':
          console.log('Player joined:', message.id);
          if (this.onPlayerJoined) {
            this.onPlayerJoined(message.id);
          }
          break;

        case 'playerLeft':
          console.log('Player left:', message.id);
          if (this.onPlayerLeft) {
            this.onPlayerLeft(message.id);
          }
          break;

        case 'players':
          if (this.onPlayersUpdate) {
            // Filter out self from the players list
            const otherPlayers = message.players.filter(p => p.id !== this.playerId);
            this.onPlayersUpdate(otherPlayers);
          }
          break;
      }
    });
  }

  connect(): void {
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  sendPosition(state: Omit<PositionUpdate, 'type'>): void {
    const message: PositionUpdate = {
      type: 'position',
      ...state
    };
    this.socket.emit('message', message);
  }

  setOnPlayerJoined(callback: PlayerJoinedCallback): void {
    this.onPlayerJoined = callback;
  }

  setOnPlayerLeft(callback: PlayerLeftCallback): void {
    this.onPlayerLeft = callback;
  }

  setOnPlayersUpdate(callback: PlayersUpdateCallback): void {
    this.onPlayersUpdate = callback;
  }

  setOnWelcome(callback: WelcomeCallback): void {
    this.onWelcome = callback;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getTerrainSeed(): number {
    return this.terrainSeed;
  }

  isConnected(): boolean {
    return this.socket.connected;
  }
}
