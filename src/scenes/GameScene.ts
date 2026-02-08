import Phaser from 'phaser';
import { Vehicle } from '../objects/Vehicle';
import { GhostVehicle } from '../objects/GhostVehicle';
import { Terrain } from '../objects/Terrain';
import { SocketClient } from '../network/SocketClient';
import { PlayerState, WORLD_WIDTH, TERRAIN_SEED } from '@shared/types';

export class GameScene extends Phaser.Scene {
  private vehicle!: Vehicle;
  private terrain!: Terrain;
  private socketClient!: SocketClient;
  private ghostVehicles: Map<string, GhostVehicle> = new Map();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private resetKey!: Phaser.Input.Keyboard.Key;

  private positionUpdateInterval = 50; // 20 Hz
  private lastPositionUpdate = 0;

  private playerCountText!: Phaser.GameObjects.Text;
  private instructionsText!: Phaser.GameObjects.Text;

  private cameraTarget!: Phaser.GameObjects.Rectangle;
  private lastVehicleX = 0;

  // Lap timing
  private readonly finishLineX = 150;
  private lapStartTime = 0;
  private bestLapTime: number | null = null;
  private lastCrossX = 0; // track player's x relative to finish line
  private hasPassedCheckpoint = false; // must travel far enough before crossing counts
  private lapTimeText!: Phaser.GameObjects.Text;
  private bestTimeText!: Phaser.GameObjects.Text;

  // Mobile touch controls
  private isMobile = false;
  private touchControls = {
    accelerate: false,
    reverse: false,
    tiltUp: false,
    tiltDown: false,
    reset: false
  };
  private touchButtonContainer?: Phaser.GameObjects.Container;

  private isReady = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // No world bounds - we handle wrapping manually
    // Only set gravity, no walls
    this.matter.world.disableGravity();
    this.matter.world.setGravity(0, 0.8);

    // Create background gradient
    this.createBackground();

    // Initialize socket client first
    this.socketClient = new SocketClient();
    this.setupNetworkCallbacks();
    this.socketClient.connect();

    // Create terrain with default seed (will be updated when we get welcome message)
    this.terrain = new Terrain(this, TERRAIN_SEED);

    // Create player vehicle
    const spawnPos = this.terrain.getSpawnPosition();
    this.vehicle = new Vehicle(this, spawnPos.x, spawnPos.y);
    this.lastVehicleX = spawnPos.x;

    // Initialize lap timing
    this.lapStartTime = this.time.now;
    this.lastCrossX = spawnPos.x;
    this.hasPassedCheckpoint = false;

    // Create invisible camera target that we'll move to follow the vehicle
    this.cameraTarget = this.add.rectangle(spawnPos.x, spawnPos.y, 1, 1, 0x000000, 0);

    // Set up camera to follow the target (no bounds - we handle wrapping)
    this.cameras.main.startFollow(this.cameraTarget, true, 0.1, 0.1);

    // Set up input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Create UI
    this.createUI();

    // Detect mobile and create touch controls
    this.isMobile = this.sys.game.device.input.touch;
    if (this.isMobile) {
      this.createTouchControls();
    }

    this.isReady = true;
  }

  private createBackground(): void {
    const graphics = this.add.graphics();

    // Sky gradient
    const skyHeight = 800;
    for (let y = 0; y < skyHeight; y++) {
      const ratio = y / skyHeight;
      const r = Math.floor(135 + ratio * 50);
      const g = Math.floor(206 + ratio * 20);
      const b = Math.floor(235 - ratio * 50);
      const color = (r << 16) | (g << 8) | b;
      graphics.lineStyle(1, color, 1);
      graphics.lineBetween(0, y, WORLD_WIDTH, y);
    }

    graphics.setScrollFactor(0.5, 0); // Parallax effect
    graphics.setDepth(-100);
  }

  private createUI(): void {
    // Player count display
    this.playerCountText = this.add.text(10, 10, 'Players: 1', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    });
    this.playerCountText.setScrollFactor(0);
    this.playerCountText.setDepth(100);

    // Lap timer display (top-right)
    const rightX = this.scale.width - 10;

    this.lapTimeText = this.add.text(rightX, 10, 'Lap: 00:00.0', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    });
    this.lapTimeText.setOrigin(1, 0);
    this.lapTimeText.setScrollFactor(0);
    this.lapTimeText.setDepth(100);

    this.bestTimeText = this.add.text(rightX, 45, 'Best: --:--.--', {
      fontSize: '18px',
      color: '#ffff00',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    });
    this.bestTimeText.setOrigin(1, 0);
    this.bestTimeText.setScrollFactor(0);
    this.bestTimeText.setDepth(100);

    // Reposition on resize
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const rx = gameSize.width - 10;
      this.lapTimeText.setX(rx);
      this.bestTimeText.setX(rx);
    });

    // Instructions (only show on non-touch devices)
    if (!this.sys.game.device.input.touch) {
      this.instructionsText = this.add.text(10, 50,
        'Controls:\nArrows / WASD - Accelerate & Tilt\nLeft/A, Right/D - Drive\nUp/W, Down/S - Tilt\nR - Reset vehicle', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 }
      });
      this.instructionsText.setScrollFactor(0);
      this.instructionsText.setDepth(100);
    }
  }

  private createTouchControls(): void {
    const buttonSize = 80;

    // Store buttons for repositioning
    this.touchButtonContainer = this.add.container(0, 0);

    // Create simple zone-based touch areas that work reliably on mobile
    // Left side - Tilt Up
    const tiltUpZone = this.add.zone(0, 0, buttonSize, buttonSize)
      .setScrollFactor(0)
      .setDepth(101)
      .setInteractive()
      .setName('tiltUp');

    const tiltUpBg = this.add.graphics().setScrollFactor(0).setDepth(100);
    tiltUpBg.setName('tiltUpBg');

    tiltUpZone.on('pointerdown', () => { this.touchControls.tiltUp = true; });
    tiltUpZone.on('pointerup', () => { this.touchControls.tiltUp = false; });
    tiltUpZone.on('pointerout', () => { this.touchControls.tiltUp = false; });

    // Left side - Tilt Down
    const tiltDownZone = this.add.zone(0, 0, buttonSize, buttonSize)
      .setScrollFactor(0)
      .setDepth(101)
      .setInteractive()
      .setName('tiltDown');

    const tiltDownBg = this.add.graphics().setScrollFactor(0).setDepth(100);
    tiltDownBg.setName('tiltDownBg');

    tiltDownZone.on('pointerdown', () => { this.touchControls.tiltDown = true; });
    tiltDownZone.on('pointerup', () => { this.touchControls.tiltDown = false; });
    tiltDownZone.on('pointerout', () => { this.touchControls.tiltDown = false; });

    // Right side - Brake
    const brakeZone = this.add.zone(0, 0, buttonSize, buttonSize)
      .setScrollFactor(0)
      .setDepth(101)
      .setInteractive()
      .setName('brake');

    const brakeBg = this.add.graphics().setScrollFactor(0).setDepth(100);
    brakeBg.setName('brakeBg');

    brakeZone.on('pointerdown', () => { this.touchControls.reverse = true; });
    brakeZone.on('pointerup', () => { this.touchControls.reverse = false; });
    brakeZone.on('pointerout', () => { this.touchControls.reverse = false; });

    // Right side - Gas
    const gasZone = this.add.zone(0, 0, buttonSize, buttonSize)
      .setScrollFactor(0)
      .setDepth(101)
      .setInteractive()
      .setName('gas');

    const gasBg = this.add.graphics().setScrollFactor(0).setDepth(100);
    gasBg.setName('gasBg');

    gasZone.on('pointerdown', () => { this.touchControls.accelerate = true; });
    gasZone.on('pointerup', () => { this.touchControls.accelerate = false; });
    gasZone.on('pointerout', () => { this.touchControls.accelerate = false; });

    // Top center - Reset
    const resetZone = this.add.zone(0, 0, buttonSize, buttonSize)
      .setScrollFactor(0)
      .setDepth(101)
      .setInteractive()
      .setName('reset');

    const resetBg = this.add.graphics().setScrollFactor(0).setDepth(100);
    resetBg.setName('resetBg');

    resetZone.on('pointerdown', () => { this.touchControls.reset = true; });

    // Store references
    this.touchButtonContainer.setData('zones', { tiltUpZone, tiltDownZone, brakeZone, gasZone, resetZone });
    this.touchButtonContainer.setData('bgs', { tiltUpBg, tiltDownBg, brakeBg, gasBg, resetBg });

    // Initial layout
    this.layoutTouchControls();

    // Handle resize
    this.scale.on('resize', this.layoutTouchControls, this);
  }

  private layoutTouchControls(): void {
    if (!this.touchButtonContainer) return;

    const width = this.scale.width;
    const height = this.scale.height;
    const buttonSize = 80;
    const margin = 30;
    const gap = 15;

    const zones = this.touchButtonContainer.getData('zones') as any;
    const bgs = this.touchButtonContainer.getData('bgs') as any;

    if (!zones || !bgs) return;

    // Position zones and redraw backgrounds
    const positions = {
      tiltUp: { x: margin + buttonSize / 2, y: height - margin - buttonSize * 1.5 - gap },
      tiltDown: { x: margin + buttonSize / 2, y: height - margin - buttonSize / 2 },
      brake: { x: width - margin - buttonSize * 1.5 - gap, y: height - margin - buttonSize / 2 },
      gas: { x: width - margin - buttonSize / 2, y: height - margin - buttonSize / 2 }
    };

    // Update tilt up
    zones.tiltUpZone.setPosition(positions.tiltUp.x, positions.tiltUp.y);
    this.drawButton(bgs.tiltUpBg, positions.tiltUp.x, positions.tiltUp.y, buttonSize, 0x3498db, '\u25B2');

    // Update tilt down
    zones.tiltDownZone.setPosition(positions.tiltDown.x, positions.tiltDown.y);
    this.drawButton(bgs.tiltDownBg, positions.tiltDown.x, positions.tiltDown.y, buttonSize, 0x3498db, '\u25BC');

    // Update brake
    zones.brakeZone.setPosition(positions.brake.x, positions.brake.y);
    this.drawButton(bgs.brakeBg, positions.brake.x, positions.brake.y, buttonSize, 0xe74c3c, '\u25C0');

    // Update gas
    zones.gasZone.setPosition(positions.gas.x, positions.gas.y);
    this.drawButton(bgs.gasBg, positions.gas.x, positions.gas.y, buttonSize, 0x2ecc71, '\u25B6');

    // Update reset - top center
    const resetSize = 60;
    const resetPos = { x: width / 2, y: margin + resetSize / 2 };
    zones.resetZone.setPosition(resetPos.x, resetPos.y).setSize(resetSize, resetSize);
    this.drawButton(bgs.resetBg, resetPos.x, resetPos.y, resetSize, 0xf39c12, 'reset');
  }

  private drawButton(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, label: string): void {
    graphics.clear();
    graphics.fillStyle(color, 0.7);
    graphics.fillRoundedRect(x - size / 2, y - size / 2, size, size, 12);
    graphics.lineStyle(3, 0xffffff, 0.8);
    graphics.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 12);

    // Draw label using graphics since text in graphics is tricky
    graphics.fillStyle(0xffffff, 1);
    // Simple arrow shapes instead of unicode
    const cx = x;
    const cy = y;
    const arrowSize = size * 0.3;

    if (label === '\u25B2') { // Up arrow
      graphics.fillTriangle(cx, cy - arrowSize, cx - arrowSize, cy + arrowSize/2, cx + arrowSize, cy + arrowSize/2);
    } else if (label === '\u25BC') { // Down arrow
      graphics.fillTriangle(cx, cy + arrowSize, cx - arrowSize, cy - arrowSize/2, cx + arrowSize, cy - arrowSize/2);
    } else if (label === '\u25C0') { // Left arrow
      graphics.fillTriangle(cx - arrowSize, cy, cx + arrowSize/2, cy - arrowSize, cx + arrowSize/2, cy + arrowSize);
    } else if (label === '\u25B6') { // Right arrow
      graphics.fillTriangle(cx + arrowSize, cy, cx - arrowSize/2, cy - arrowSize, cx - arrowSize/2, cy + arrowSize);
    } else if (label === 'reset') { // Circular reset arrow
      graphics.lineStyle(4, 0xffffff, 1);
      graphics.beginPath();
      graphics.arc(cx, cy, arrowSize * 0.8, -Math.PI * 0.8, Math.PI * 0.5, false);
      graphics.strokePath();
      // Arrowhead at end of arc
      const tipAngle = -Math.PI * 0.8;
      const tipX = cx + Math.cos(tipAngle) * arrowSize * 0.8;
      const tipY = cy + Math.sin(tipAngle) * arrowSize * 0.8;
      graphics.fillTriangle(
        tipX - 6, tipY - 6,
        tipX + 6, tipY - 2,
        tipX - 2, tipY + 6
      );
    }
  }

  private setupNetworkCallbacks(): void {
    this.socketClient.setOnWelcome((id, terrainSeed, color) => {
      console.log('Welcome! ID:', id, 'Seed:', terrainSeed, 'Color:', color.toString(16));
      this.vehicle.setColor(color);
    });

    this.socketClient.setOnPlayerJoined((id) => {
      console.log('Player joined:', id);
      this.updatePlayerCount();
    });

    this.socketClient.setOnPlayerLeft((id) => {
      console.log('Player left:', id);
      const ghost = this.ghostVehicles.get(id);
      if (ghost) {
        ghost.destroy();
        this.ghostVehicles.delete(id);
      }
      this.updatePlayerCount();
    });

    this.socketClient.setOnPlayersUpdate((players: PlayerState[]) => {
      // Update or create ghost vehicles for each player
      const localX = this.vehicle.getPosition().x;

      for (const player of players) {
        let ghost = this.ghostVehicles.get(player.id);

        if (!ghost) {
          // Create new ghost vehicle
          ghost = new GhostVehicle(this, player.id, player, player.color);
          this.ghostVehicles.set(player.id, ghost);
        }

        ghost.updateState(player);
      }

      // Update ghost positions
      for (const [, ghost] of this.ghostVehicles) {
        ghost.update(this.game.loop.delta, localX);
      }

      this.updatePlayerCount();
    });
  }

  private updatePlayerCount(): void {
    const count = this.ghostVehicles.size + 1;
    this.playerCountText.setText(`Players: ${count}`);
  }

  update(time: number, delta: number): void {
    if (!this.isReady) return;

    // Handle input
    this.handleInput();

    // Update vehicle
    this.vehicle.update();

    // Update camera target to follow vehicle
    const pos = this.vehicle.getPosition();

    // Detect if vehicle wrapped around the world
    const dx = pos.x - this.lastVehicleX;
    const wrapped = Math.abs(dx) > WORLD_WIDTH / 2;

    if (wrapped) {
      // Teleport camera instantly instead of smooth follow
      this.cameraTarget.setPosition(pos.x, pos.y);
      // Force camera to snap to target
      this.cameras.main.scrollX = pos.x - this.cameras.main.width / 2;
      this.cameras.main.scrollY = pos.y - this.cameras.main.height / 2;
    } else {
      this.cameraTarget.setPosition(pos.x, pos.y);
    }

    this.lastVehicleX = pos.x;

    // Lap crossing detection (left-to-right over finish line)
    this.checkFinishLineCrossing(pos.x, time);

    // Update lap timer HUD
    const elapsed = time - this.lapStartTime;
    this.lapTimeText.setText(`Lap: ${this.formatTime(elapsed)}`);

    // Update ghost vehicles
    for (const [, ghost] of this.ghostVehicles) {
      ghost.update(delta, pos.x);
    }

    // Send position updates
    if (time - this.lastPositionUpdate > this.positionUpdateInterval) {
      this.sendPositionUpdate();
      this.lastPositionUpdate = time;
    }
  }

  private checkFinishLineCrossing(currentX: number, time: number): void {
    // Player must travel at least 500px past the finish line before crossings count.
    // This prevents backing up over the line right after spawn/reset.
    if (!this.hasPassedCheckpoint && currentX > this.finishLineX + 500) {
      this.hasPassedCheckpoint = true;
    }

    if (!this.hasPassedCheckpoint) {
      this.lastCrossX = currentX;
      return;
    }

    const prevSide = this.lastCrossX - this.finishLineX;
    const currSide = currentX - this.finishLineX;

    // Detect left-to-right crossing (prevSide <= 0 and currSide > 0)
    // But ignore if it looks like a world wrap (large jump)
    const crossed = prevSide <= 0 && currSide > 0 && Math.abs(currentX - this.lastCrossX) < WORLD_WIDTH / 2;

    if (crossed) {
      const lapTime = time - this.lapStartTime;
      if (this.bestLapTime === null || lapTime < this.bestLapTime) {
        this.bestLapTime = lapTime;
        this.bestTimeText.setText(`Best: ${this.formatTime(this.bestLapTime)}`);
      }
      this.hasPassedCheckpoint = false;
      this.lapStartTime = time;
    }

    this.lastCrossX = currentX;
  }

  private formatTime(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const tenths = Math.floor((totalSeconds * 10) % 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  }

  private handleInput(): void {
    // Acceleration (keyboard or touch)
    const accelerate = this.cursors.right.isDown || this.wasd.D.isDown || this.touchControls.accelerate;
    const reverse = this.cursors.left.isDown || this.wasd.A.isDown || this.touchControls.reverse;

    if (accelerate) {
      this.vehicle.accelerate(1);
    } else if (reverse) {
      this.vehicle.accelerate(-1);
    }

    // Tilting (keyboard or touch)
    const tiltUp = this.cursors.up.isDown || this.wasd.W.isDown || this.touchControls.tiltUp;
    const tiltDown = this.cursors.down.isDown || this.wasd.S.isDown || this.touchControls.tiltDown;

    if (tiltUp) {
      this.vehicle.tilt(-1);
    } else if (tiltDown) {
      this.vehicle.tilt(1);
    }

    // Reset
    if (Phaser.Input.Keyboard.JustDown(this.resetKey) || this.touchControls.reset) {
      this.touchControls.reset = false;
      const spawn = this.terrain.getSpawnPosition();
      this.vehicle.reset(spawn.x, spawn.y);
      // Restart lap timer without recording a time
      this.lapStartTime = this.time.now;
      this.lastCrossX = spawn.x;
      this.hasPassedCheckpoint = false;
    }
  }

  private sendPositionUpdate(): void {
    if (!this.socketClient.isConnected()) return;

    const state = this.vehicle.getState();
    this.socketClient.sendPosition(state);
  }

  destroy(): void {
    this.socketClient.disconnect();
    this.vehicle.destroy();
    this.terrain.destroy();
    for (const [, ghost] of this.ghostVehicles) {
      ghost.destroy();
    }
  }
}
