import Phaser from 'phaser';
import { PlayerState, WORLD_WIDTH } from '@shared/types';

export class GhostVehicle {
  scene: Phaser.Scene;
  id: string;

  private chassisWidth = 100;
  private chassisHeight = 20;
  private wheelRadius = 25;
  private wheelOffset = 40;

  private chassisGraphics: Phaser.GameObjects.Graphics;
  private frontWheelGraphics: Phaser.GameObjects.Graphics;
  private rearWheelGraphics: Phaser.GameObjects.Graphics;

  // Interpolation state
  private currentState: PlayerState;
  private targetState: PlayerState;
  private interpolationTime = 0;
  private interpolationDuration = 100; // ms

  private color: number;
  private outlineColor: number;

  constructor(scene: Phaser.Scene, id: string, initialState: PlayerState, color: number) {
    this.scene = scene;
    this.id = id;
    this.currentState = { ...initialState };
    this.targetState = { ...initialState };
    this.color = color;
    this.outlineColor = GhostVehicle.darkenColor(color, 0.7);

    // Create graphics with transparency
    this.chassisGraphics = scene.add.graphics();
    this.frontWheelGraphics = scene.add.graphics();
    this.rearWheelGraphics = scene.add.graphics();

    this.render();
  }

  updateState(newState: PlayerState): void {
    this.currentState = { ...this.targetState };
    this.targetState = { ...newState };
    this.interpolationTime = 0;
  }

  update(delta: number, localPlayerX: number): void {
    // Interpolate between states
    this.interpolationTime += delta;
    const t = Math.min(this.interpolationTime / this.interpolationDuration, 1);

    // Smooth interpolation
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // Handle wrapping for x position
    let targetX = this.targetState.x;
    let currentX = this.currentState.x;

    // Adjust for world wrap
    const dx = targetX - currentX;
    if (Math.abs(dx) > WORLD_WIDTH / 2) {
      if (dx > 0) {
        currentX += WORLD_WIDTH;
      } else {
        targetX += WORLD_WIDTH;
      }
    }

    const interpolatedState = {
      x: lerp(currentX, targetX, t) % WORLD_WIDTH,
      y: lerp(this.currentState.y, this.targetState.y, t),
      angle: this.lerpAngle(this.currentState.angle, this.targetState.angle, t),
      frontWheelAngle: this.lerpAngle(this.currentState.frontWheelAngle, this.targetState.frontWheelAngle, t),
      rearWheelAngle: this.lerpAngle(this.currentState.rearWheelAngle, this.targetState.rearWheelAngle, t)
    };

    this.renderAt(interpolatedState, localPlayerX);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    // Handle angle wrapping
    let delta = b - a;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return a + delta * t;
  }

  private renderAt(state: { x: number; y: number; angle: number; frontWheelAngle: number; rearWheelAngle: number }, localPlayerX: number): void {
    const alpha = 0.5;

    // Calculate render position (may need to render wrapped)
    let renderX = state.x;

    // Check if we need to render at a wrapped position
    const distToLocal = state.x - localPlayerX;
    if (Math.abs(distToLocal) > WORLD_WIDTH / 2) {
      if (distToLocal > 0) {
        renderX = state.x - WORLD_WIDTH;
      } else {
        renderX = state.x + WORLD_WIDTH;
      }
    }

    // Draw chassis
    this.chassisGraphics.clear();
    this.chassisGraphics.fillStyle(this.color, alpha);
    this.chassisGraphics.lineStyle(3, this.outlineColor, alpha);

    const cx = renderX;
    const cy = state.y;
    const angle = state.angle;

    const hw = this.chassisWidth / 2;
    const hh = this.chassisHeight / 2;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const corners = [
      { x: cx + (-hw * cos - -hh * sin), y: cy + (-hw * sin + -hh * cos) },
      { x: cx + (hw * cos - -hh * sin), y: cy + (hw * sin + -hh * cos) },
      { x: cx + (hw * cos - hh * sin), y: cy + (hw * sin + hh * cos) },
      { x: cx + (-hw * cos - hh * sin), y: cy + (-hw * sin + hh * cos) }
    ];

    this.chassisGraphics.beginPath();
    this.chassisGraphics.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      this.chassisGraphics.lineTo(corners[i].x, corners[i].y);
    }
    this.chassisGraphics.closePath();
    this.chassisGraphics.fillPath();
    this.chassisGraphics.strokePath();

    // Draw a "cabin" on top
    this.chassisGraphics.fillStyle(this.outlineColor, alpha);
    const cabinWidth = 35;
    const cabinHeight = 20;
    const cabinOffsetX = -10;
    const cabinCorners = [
      {
        x: cx + ((cabinOffsetX - cabinWidth/2) * cos - (-hh - cabinHeight) * sin),
        y: cy + ((cabinOffsetX - cabinWidth/2) * sin + (-hh - cabinHeight) * cos)
      },
      {
        x: cx + ((cabinOffsetX + cabinWidth/2) * cos - (-hh - cabinHeight) * sin),
        y: cy + ((cabinOffsetX + cabinWidth/2) * sin + (-hh - cabinHeight) * cos)
      },
      {
        x: cx + ((cabinOffsetX + cabinWidth/2) * cos - -hh * sin),
        y: cy + ((cabinOffsetX + cabinWidth/2) * sin + -hh * cos)
      },
      {
        x: cx + ((cabinOffsetX - cabinWidth/2) * cos - -hh * sin),
        y: cy + ((cabinOffsetX - cabinWidth/2) * sin + -hh * cos)
      }
    ];
    this.chassisGraphics.beginPath();
    this.chassisGraphics.moveTo(cabinCorners[0].x, cabinCorners[0].y);
    for (let i = 1; i < cabinCorners.length; i++) {
      this.chassisGraphics.lineTo(cabinCorners[i].x, cabinCorners[i].y);
    }
    this.chassisGraphics.closePath();
    this.chassisGraphics.fillPath();

    // Calculate wheel positions
    const frontWheelX = cx + (this.wheelOffset * cos - (this.chassisHeight / 2 + this.wheelRadius) * sin);
    const frontWheelY = cy + (this.wheelOffset * sin + (this.chassisHeight / 2 + this.wheelRadius) * cos);
    const rearWheelX = cx + (-this.wheelOffset * cos - (this.chassisHeight / 2 + this.wheelRadius) * sin);
    const rearWheelY = cy + (-this.wheelOffset * sin + (this.chassisHeight / 2 + this.wheelRadius) * cos);

    // Draw wheels
    this.drawWheel(this.frontWheelGraphics, frontWheelX, frontWheelY, state.frontWheelAngle, alpha);
    this.drawWheel(this.rearWheelGraphics, rearWheelX, rearWheelY, state.rearWheelAngle, alpha);
  }

  private render(): void {
    this.renderAt({
      x: this.currentState.x,
      y: this.currentState.y,
      angle: this.currentState.angle,
      frontWheelAngle: this.currentState.frontWheelAngle,
      rearWheelAngle: this.currentState.rearWheelAngle
    }, this.currentState.x);
  }

  private drawWheel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, alpha: number): void {
    graphics.clear();

    // Tire (outer)
    graphics.fillStyle(0x2c3e50, alpha);
    graphics.fillCircle(x, y, this.wheelRadius);

    // Rim (inner)
    graphics.fillStyle(0x7f8c8d, alpha);
    graphics.fillCircle(x, y, this.wheelRadius * 0.6);

    // Hub
    graphics.fillStyle(0x34495e, alpha);
    graphics.fillCircle(x, y, this.wheelRadius * 0.25);

    // Spokes to show rotation
    graphics.lineStyle(3, 0x95a5a6, alpha);
    for (let i = 0; i < 5; i++) {
      const spokeAngle = angle + (i * Math.PI * 2 / 5);
      const innerR = this.wheelRadius * 0.25;
      const outerR = this.wheelRadius * 0.55;
      graphics.beginPath();
      graphics.moveTo(x + Math.cos(spokeAngle) * innerR, y + Math.sin(spokeAngle) * innerR);
      graphics.lineTo(x + Math.cos(spokeAngle) * outerR, y + Math.sin(spokeAngle) * outerR);
      graphics.strokePath();
    }
  }

  private static darkenColor(color: number, factor: number): number {
    const r = Math.floor(((color >> 16) & 0xff) * factor);
    const g = Math.floor(((color >> 8) & 0xff) * factor);
    const b = Math.floor((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  destroy(): void {
    this.chassisGraphics.destroy();
    this.frontWheelGraphics.destroy();
    this.rearWheelGraphics.destroy();
  }
}
