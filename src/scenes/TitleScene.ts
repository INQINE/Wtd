import Phaser from 'phaser';
import { COLORS, textStyle } from '../ui/theme';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    const GAME_W = this.scale.width;
    const GAME_H = this.scale.height;
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const g = this.add.graphics();
    // 배경: 사선 줄무늬 + 그라데이션 느낌
    g.fillGradientStyle(0x1b1e24, 0x1b1e24, 0x0c0d10, 0x0c0d10, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.lineStyle(2, 0xffffff, 0.03);
    for (let x = -GAME_H; x < GAME_W; x += 48) g.lineBetween(x, GAME_H, x + GAME_H, 0);
    g.fillStyle(COLORS.accent, 1).fillRect(0, GAME_H - 10, GAME_W, 10);
    g.fillStyle(COLORS.accent, 0.9).fillRect(160, 300, 12, 230);

    this.add.text(200, 300, 'WAKTA KNIGHTS', textStyle(40, COLORS.accentText, 900)).setOrigin(0, 0);
    this.add.text(196, 350, '왁방주', textStyle(150, '#ffffff', 900)).setOrigin(0, 0);

    // 화면 아무 곳이나 누르면 메인 화면으로
    const start = this.add
      .text(GAME_W / 2, GAME_H * 0.82, '화면을 터치하여 시작', textStyle(34, '#ffffff', 700))
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
    this.add.text(GAME_W - 40, GAME_H - 40, 'M0.6 · 2.5D · SD', textStyle(20, COLORS.textDim, 400)).setOrigin(1, 1);
    this.input.once('pointerup', () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('lobby'));
    });
  }
}
