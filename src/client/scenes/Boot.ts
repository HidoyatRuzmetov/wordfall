import { Scene } from 'phaser';
import { generateTextures } from '../textures';
import { ensureDict } from '../dict';

/** Generates all procedural art once, kicks off the word list, then shows the hub. */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateTextures(this);
    // Download the dictionary in the background so the hub isn't blocked by it.
    void ensureDict();
    this.scene.start('Home');
  }
}
