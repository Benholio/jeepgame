import Phaser from 'phaser';
import { WORLD_WIDTH } from '@shared/types';

// Get Matter from Phaser
const Matter = (Phaser.Physics.Matter as any).Matter as typeof MatterJS;

export class Terrain {
  scene: Phaser.Scene;
  seed: number;
  private segments: MatterJS.BodyType[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private wrapGraphicsLeft: Phaser.GameObjects.Graphics;
  private wrapGraphicsRight: Phaser.GameObjects.Graphics;

  private segmentWidth = 40;
  private baseHeight = 450;
  private amplitude1 = 50;
  private amplitude2 = 25;
  private amplitude3 = 10;
  private frequency1 = 0.002;
  private frequency2 = 0.005;
  private frequency3 = 0.015;

  private points: { x: number; y: number }[] = [];
  private wrapBuffer = 800; // How much terrain to duplicate at edges

  constructor(scene: Phaser.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
    this.graphics = scene.add.graphics();
    this.wrapGraphicsLeft = scene.add.graphics();
    this.wrapGraphicsRight = scene.add.graphics();

    this.generateTerrain();
  }

  private seededRandom(x: number): number {
    // Simple seeded random based on position
    const value = Math.sin(x * 0.1 + this.seed) * 10000;
    return value - Math.floor(value);
  }

  private getTerrainHeight(x: number): number {
    // Normalize x to be within world width for consistent terrain
    const normalizedX = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

    // Flat starting area for first 400 pixels
    if (normalizedX < 400) {
      const flatHeight = this.baseHeight;
      // Smooth transition from flat to hills
      if (normalizedX > 300) {
        const t = (normalizedX - 300) / 100;
        const hillHeight = this.getHillHeight(normalizedX);
        return flatHeight + (hillHeight - flatHeight) * (t * t);
      }
      return flatHeight;
    }

    return this.getHillHeight(normalizedX);
  }

  private getHillHeight(x: number): number {
    const y1 = Math.sin(x * this.frequency1 + this.seed) * this.amplitude1;
    const y2 = Math.sin(x * this.frequency2 + this.seed * 2) * this.amplitude2;
    const y3 = Math.sin(x * this.frequency3 + this.seed * 3) * this.amplitude3;
    const noise = (this.seededRandom(x * 0.1) - 0.5) * 5;
    return this.baseHeight + y1 + y2 + y3 + noise;
  }

  private generateTerrain(): void {
    // Generate points for the entire world width
    this.points = [];
    for (let x = 0; x <= WORLD_WIDTH; x += this.segmentWidth) {
      this.points.push({
        x: x,
        y: this.getTerrainHeight(x)
      });
    }

    // Ensure terrain loops - last point should match first
    this.points[this.points.length - 1].y = this.points[0].y;

    // Create main terrain segments
    this.createTerrainSegments(0);

    // Create wrap terrain segments (duplicate at edges for seamless looping)
    // Left wrap: copy end of terrain to before x=0
    this.createWrapSegments(-WORLD_WIDTH);
    // Right wrap: copy start of terrain to after WORLD_WIDTH
    this.createWrapSegments(WORLD_WIDTH);

    this.render();
  }

  private createTerrainSegments(offsetX: number): void {
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      const midX = (p1.x + p2.x) / 2 + offsetX;
      const midY = (p1.y + p2.y) / 2;
      const width = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      const segment = Matter.Bodies.rectangle(midX, midY + 25, width, 50, {
        isStatic: true,
        angle: angle,
        friction: 0.8,
        label: 'terrain'
      });

      this.segments.push(segment);
      this.scene.matter.world.add(segment);
    }
  }

  private createWrapSegments(offsetX: number): void {
    // Only create segments near the wrap boundary (within wrapBuffer)
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      // For left wrap (offsetX < 0), we want segments near WORLD_WIDTH
      // For right wrap (offsetX > 0), we want segments near 0
      const shouldCreate = offsetX < 0
        ? p1.x >= WORLD_WIDTH - this.wrapBuffer
        : p1.x <= this.wrapBuffer;

      if (!shouldCreate) continue;

      const midX = (p1.x + p2.x) / 2 + offsetX;
      const midY = (p1.y + p2.y) / 2;
      const width = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      const segment = Matter.Bodies.rectangle(midX, midY + 25, width, 50, {
        isStatic: true,
        angle: angle,
        friction: 0.8,
        label: 'terrain'
      });

      this.segments.push(segment);
      this.scene.matter.world.add(segment);
    }
  }

  private render(): void {
    // Render main terrain
    this.renderTerrainGraphics(this.graphics, 0);
    // Render wrapped copies for visual continuity
    this.renderTerrainGraphics(this.wrapGraphicsLeft, -WORLD_WIDTH);
    this.renderTerrainGraphics(this.wrapGraphicsRight, WORLD_WIDTH);
  }

  private renderTerrainGraphics(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
    graphics.clear();

    // Draw filled ground
    graphics.fillStyle(0x8b4513, 1);
    graphics.beginPath();
    graphics.moveTo(this.points[0].x + offsetX, this.points[0].y);

    for (let i = 1; i < this.points.length; i++) {
      graphics.lineTo(this.points[i].x + offsetX, this.points[i].y);
    }

    graphics.lineTo(WORLD_WIDTH + offsetX, 800);
    graphics.lineTo(0 + offsetX, 800);
    graphics.closePath();
    graphics.fillPath();

    // Draw grass line on top
    graphics.lineStyle(8, 0x228b22, 1);
    graphics.beginPath();
    graphics.moveTo(this.points[0].x + offsetX, this.points[0].y);

    for (let i = 1; i < this.points.length; i++) {
      graphics.lineTo(this.points[i].x + offsetX, this.points[i].y);
    }
    graphics.strokePath();

    // Add small grass tufts
    graphics.lineStyle(2, 0x32cd32, 1);
    for (let i = 0; i < this.points.length - 1; i += 2) {
      const p = this.points[i];
      const nextP = this.points[i + 1];
      const midX = (p.x + nextP.x) / 2 + offsetX;
      const midY = (p.y + nextP.y) / 2;

      for (let j = 0; j < 3; j++) {
        const ox = (this.seededRandom(i * 3 + j) - 0.5) * 30;
        const grassX = midX + ox;
        const grassY = midY + (this.seededRandom(i * 3 + j + 100) - 0.5) * 5;

        graphics.beginPath();
        graphics.moveTo(grassX, grassY);
        graphics.lineTo(grassX - 3, grassY - 10);
        graphics.strokePath();

        graphics.beginPath();
        graphics.moveTo(grassX, grassY);
        graphics.lineTo(grassX + 3, grassY - 12);
        graphics.strokePath();
      }
    }
  }

  getSpawnPosition(): { x: number; y: number } {
    return {
      x: 150,
      y: this.baseHeight - 80
    };
  }

  destroy(): void {
    for (const segment of this.segments) {
      Matter.Composite.remove(this.scene.matter.world.engine.world as any, segment);
    }
    this.segments = [];
    this.graphics.destroy();
    this.wrapGraphicsLeft.destroy();
    this.wrapGraphicsRight.destroy();
  }
}
