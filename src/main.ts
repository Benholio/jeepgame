import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

// Get actual visible dimensions
function getGameSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

const size = getGameSize();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.NONE, // We handle sizing manually
    width: size.width,
    height: size.height
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0.8 },
      debug: false
    }
  },
  scene: [GameScene],
  input: {
    activePointers: 4
  }
};

const game = new Phaser.Game(config);

// Handle resize/orientation change
function handleResize() {
  const newSize = getGameSize();
  game.scale.resize(newSize.width, newSize.height);

  // Also resize the canvas element directly
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.width = newSize.width + 'px';
    canvas.style.height = newSize.height + 'px';
  }
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
  // Delay to let iOS finish orientation animation
  setTimeout(handleResize, 150);
});

// iOS visual viewport API
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleResize);
}
