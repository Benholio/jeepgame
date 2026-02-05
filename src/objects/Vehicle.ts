import Phaser from 'phaser';
import { WORLD_WIDTH } from '@shared/types';

// Get Matter from Phaser
const Matter = (Phaser.Physics.Matter as any).Matter as typeof MatterJS;

export class Vehicle {
  scene: Phaser.Scene;
  chassis: MatterJS.BodyType;
  frontWheel: MatterJS.BodyType;
  rearWheel: MatterJS.BodyType;

  private chassisWidth = 100;
  private chassisHeight = 20;
  private wheelRadius = 25;
  private wheelOffset = 40;

  private accelerationForce = 0.08;
  private tiltTorque = 0.08;
  private maxWheelAngularVelocity = 0.5;

  // Graphics objects
  private chassisGraphics: Phaser.GameObjects.Graphics;
  private frontWheelGraphics: Phaser.GameObjects.Graphics;
  private rearWheelGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Collision category for vehicle parts (they won't collide with each other)
    const vehicleCategory = 0x0002;
    const defaultCategory = 0x0001;

    // Create chassis - lower center of mass for stability
    this.chassis = Matter.Bodies.rectangle(x, y, this.chassisWidth, this.chassisHeight, {
      label: 'chassis',
      friction: 0.5,
      frictionAir: 0.02,
      restitution: 0.1,
      density: 0.002,
      collisionFilter: {
        group: -1, // Negative group means bodies in same group don't collide
        category: vehicleCategory,
        mask: defaultCategory // Only collide with terrain, not other vehicle parts
      }
    });

    // Create wheels with good grip
    this.frontWheel = Matter.Bodies.circle(
      x + this.wheelOffset,
      y + this.chassisHeight / 2 + this.wheelRadius + 5,
      this.wheelRadius,
      {
        label: 'frontWheel',
        friction: 0.9,
        frictionAir: 0.01,
        restitution: 0.1,
        density: 0.001,
        collisionFilter: {
          group: -1,
          category: vehicleCategory,
          mask: defaultCategory
        }
      }
    );

    this.rearWheel = Matter.Bodies.circle(
      x - this.wheelOffset,
      y + this.chassisHeight / 2 + this.wheelRadius + 5,
      this.wheelRadius,
      {
        label: 'rearWheel',
        friction: 0.9,
        frictionAir: 0.01,
        restitution: 0.1,
        density: 0.001,
        collisionFilter: {
          group: -1,
          category: vehicleCategory,
          mask: defaultCategory
        }
      }
    );

    // Front wheel suspension - combination of constraints for stability
    const frontAxle = Matter.Constraint.create({
      bodyA: this.chassis,
      pointA: { x: this.wheelOffset, y: this.chassisHeight / 2 + 5 },
      bodyB: this.frontWheel,
      pointB: { x: 0, y: 0 },
      stiffness: 0.9,
      damping: 0.2,
      length: this.wheelRadius
    });

    // Rear wheel suspension
    const rearAxle = Matter.Constraint.create({
      bodyA: this.chassis,
      pointA: { x: -this.wheelOffset, y: this.chassisHeight / 2 + 5 },
      bodyB: this.rearWheel,
      pointB: { x: 0, y: 0 },
      stiffness: 0.9,
      damping: 0.2,
      length: this.wheelRadius
    });

    // Add secondary stabilizer constraints (prevents wheels from swinging too much)
    const frontStabilizer = Matter.Constraint.create({
      bodyA: this.chassis,
      pointA: { x: this.wheelOffset - 15, y: 0 },
      bodyB: this.frontWheel,
      pointB: { x: 0, y: 0 },
      stiffness: 0.5,
      damping: 0.3,
      length: this.wheelRadius + 20
    });

    const rearStabilizer = Matter.Constraint.create({
      bodyA: this.chassis,
      pointA: { x: -this.wheelOffset + 15, y: 0 },
      bodyB: this.rearWheel,
      pointB: { x: 0, y: 0 },
      stiffness: 0.5,
      damping: 0.3,
      length: this.wheelRadius + 20
    });

    // Create compound body
    const vehicleBody = Matter.Composite.create();
    Matter.Composite.add(vehicleBody, this.chassis);
    Matter.Composite.add(vehicleBody, this.frontWheel);
    Matter.Composite.add(vehicleBody, this.rearWheel);
    Matter.Composite.add(vehicleBody, frontAxle);
    Matter.Composite.add(vehicleBody, rearAxle);
    Matter.Composite.add(vehicleBody, frontStabilizer);
    Matter.Composite.add(vehicleBody, rearStabilizer);

    // Add to world
    scene.matter.world.add(vehicleBody as any);

    // Create graphics for rendering
    this.chassisGraphics = scene.add.graphics();
    this.frontWheelGraphics = scene.add.graphics();
    this.rearWheelGraphics = scene.add.graphics();
  }

  accelerate(direction: number): void {
    // Apply angular velocity directly to wheels for better control
    const targetAngularVel = direction * this.maxWheelAngularVelocity;

    // Apply torque to reach target angular velocity
    const frontDiff = targetAngularVel - this.frontWheel.angularVelocity;
    const rearDiff = targetAngularVel - this.rearWheel.angularVelocity;

    Matter.Body.setAngularVelocity(
      this.frontWheel,
      this.frontWheel.angularVelocity + frontDiff * 0.1
    );
    Matter.Body.setAngularVelocity(
      this.rearWheel,
      this.rearWheel.angularVelocity + rearDiff * 0.1
    );

    // Also apply force in direction of movement for better traction
    const force = direction * this.accelerationForce * 0.001;
    Matter.Body.applyForce(this.chassis, this.chassis.position, { x: force, y: 0 });
  }

  tilt(direction: number): void {
    // Apply torque to chassis for tilting (air control)
    Matter.Body.setAngularVelocity(
      this.chassis,
      this.chassis.angularVelocity + direction * this.tiltTorque * 0.05
    );
  }

  wrapPosition(): void {
    // Check if vehicle needs wrapping
    if (this.chassis.position.x > WORLD_WIDTH) {
      const offset = -WORLD_WIDTH;
      Matter.Body.setPosition(this.chassis, {
        x: this.chassis.position.x + offset,
        y: this.chassis.position.y
      });
      Matter.Body.setPosition(this.frontWheel, {
        x: this.frontWheel.position.x + offset,
        y: this.frontWheel.position.y
      });
      Matter.Body.setPosition(this.rearWheel, {
        x: this.rearWheel.position.x + offset,
        y: this.rearWheel.position.y
      });
    } else if (this.chassis.position.x < 0) {
      const offset = WORLD_WIDTH;
      Matter.Body.setPosition(this.chassis, {
        x: this.chassis.position.x + offset,
        y: this.chassis.position.y
      });
      Matter.Body.setPosition(this.frontWheel, {
        x: this.frontWheel.position.x + offset,
        y: this.frontWheel.position.y
      });
      Matter.Body.setPosition(this.rearWheel, {
        x: this.rearWheel.position.x + offset,
        y: this.rearWheel.position.y
      });
    }
  }

  update(): void {
    this.wrapPosition();
    this.render();
  }

  private render(): void {
    // Draw chassis
    this.chassisGraphics.clear();
    this.chassisGraphics.fillStyle(0x3498db, 1);
    this.chassisGraphics.lineStyle(3, 0x2980b9, 1);

    // Calculate chassis corners based on position and rotation
    const cx = this.chassis.position.x;
    const cy = this.chassis.position.y;
    const angle = this.chassis.angle;

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
    this.chassisGraphics.fillStyle(0x2980b9, 1);
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

    // Draw wheels
    this.drawWheel(this.frontWheelGraphics, this.frontWheel);
    this.drawWheel(this.rearWheelGraphics, this.rearWheel);
  }

  private drawWheel(graphics: Phaser.GameObjects.Graphics, wheel: MatterJS.BodyType): void {
    graphics.clear();

    const x = wheel.position.x;
    const y = wheel.position.y;

    // Tire (outer)
    graphics.fillStyle(0x2c3e50, 1);
    graphics.fillCircle(x, y, this.wheelRadius);

    // Rim (inner)
    graphics.fillStyle(0x7f8c8d, 1);
    graphics.fillCircle(x, y, this.wheelRadius * 0.6);

    // Hub
    graphics.fillStyle(0x34495e, 1);
    graphics.fillCircle(x, y, this.wheelRadius * 0.25);

    // Spokes to show rotation
    graphics.lineStyle(3, 0x95a5a6, 1);
    for (let i = 0; i < 5; i++) {
      const spokeAngle = wheel.angle + (i * Math.PI * 2 / 5);
      const innerR = this.wheelRadius * 0.25;
      const outerR = this.wheelRadius * 0.55;
      graphics.beginPath();
      graphics.moveTo(x + Math.cos(spokeAngle) * innerR, y + Math.sin(spokeAngle) * innerR);
      graphics.lineTo(x + Math.cos(spokeAngle) * outerR, y + Math.sin(spokeAngle) * outerR);
      graphics.strokePath();
    }
  }

  getState() {
    return {
      x: this.chassis.position.x,
      y: this.chassis.position.y,
      angle: this.chassis.angle,
      frontWheelAngle: this.frontWheel.angle,
      rearWheelAngle: this.rearWheel.angle,
      velocityX: this.chassis.velocity.x,
      velocityY: this.chassis.velocity.y
    };
  }

  getPosition() {
    return {
      x: this.chassis.position.x,
      y: this.chassis.position.y
    };
  }

  destroy(): void {
    this.chassisGraphics.destroy();
    this.frontWheelGraphics.destroy();
    this.rearWheelGraphics.destroy();
  }
}
