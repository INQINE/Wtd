import Phaser from 'phaser';
import { queueSDImages, queueSDManifest } from '../sd/registry';

/** 시작 시 외부 SD 이미지(manifest)를 불러온다 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    queueSDManifest(this);
  }

  create(): void {
    queueSDImages(this);
    this.load.once('complete', () => this.scene.start('title'));
    this.load.start();
  }
}
