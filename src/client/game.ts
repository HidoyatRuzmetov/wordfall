import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';
import { Boot } from './scenes/Boot';
import { Home } from './scenes/Home';
import { Game as PlayScene } from './scenes/Game';
import { Results } from './scenes/Results';
import { HowTo } from './scenes/HowTo';
import { Leaderboard } from './scenes/Leaderboard';
import { COLORS } from './theme';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: COLORS.bgBottomCss,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    roundPixels: true,
  },
  scene: [Boot, Home, PlayScene, Results, HowTo, Leaderboard],
};

const StartGame = (parent: string): Phaser.Game => new Game({ ...config, parent });

document.addEventListener('DOMContentLoaded', () => {
  StartGame('game-container');
});
