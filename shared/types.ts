// Shared types for network communication between client and server

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  frontWheelAngle: number;
  rearWheelAngle: number;
  velocityX: number;
  velocityY: number;
}

// Client -> Server messages
export interface PositionUpdate {
  type: 'position';
  x: number;
  y: number;
  angle: number;
  frontWheelAngle: number;
  rearWheelAngle: number;
  velocityX: number;
  velocityY: number;
}

export type ClientMessage = PositionUpdate;

// Server -> Client messages
export interface PlayersUpdate {
  type: 'players';
  players: PlayerState[];
}

export interface PlayerJoined {
  type: 'playerJoined';
  id: string;
}

export interface PlayerLeft {
  type: 'playerLeft';
  id: string;
}

export interface Welcome {
  type: 'welcome';
  id: string;
  terrainSeed: number;
}

export type ServerMessage = PlayersUpdate | PlayerJoined | PlayerLeft | Welcome;

// Game constants shared between client and server
export const WORLD_WIDTH = 10000;
export const TERRAIN_SEED = 12345;
