import Phaser from 'phaser';
import { OPERATORS } from '../data/operators';
import { createSDView, type SDView } from '../sd/factory';
import { sdImageFor } from '../sd/registry';
import { Button } from '../ui/button';
import { COLORS, textStyle } from '../ui/theme';

/** SD 도감: 모든 멤버의 SD를 대기/공격 모션으로 미리보기 */
export class SDGalleryScene extends Phaser.Scene {
  private rigs: SDView[] = [];
  private autoAttack = true;

  constructor() {
    super('sd-gallery');
  }

  create(data: { only?: string }): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.rigs = [];
    this.cameras.main.setBackgroundColor(0x1b1e24);
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a2f38, 0x2a2f38, 0x14161a, 0x14161a, 1).fillRect(0, 0, W, H);
    this.add.text(40, 30, 'SD 도감', textStyle(48, '#ffffff', 900));
    this.add.text(42, 92, '🖼 = 가져온 SD 이미지 · 나머지는 코드로 그린 임시 디자인', textStyle(22, COLORS.textDim, 400));

    const ops = data.only ? OPERATORS.filter((o) => o.id === data.only) : OPERATORS;
    const cols = Math.min(5, ops.length);
    const rows = Math.ceil(ops.length / cols);
    const cellW = (W - 80) / cols;
    const cellH = (H - 220) / rows;
    const size = Math.min(cellW * 0.9, cellH * 0.82);
    ops.forEach((def, i) => {
      const cx = 40 + cellW * (i % cols) + cellW / 2;
      const cy = 150 + cellH * Math.floor(i / cols) + cellH * 0.86;
      this.add.ellipse(cx, cy, size * 0.45, size * 0.1, 0x000000, 0.35);
      const rig = createSDView(this, def).setPosition(cx, cy).setHeightPx(size);
      this.rigs.push(rig);
      this.add.text(cx, cy + 22, def.name + (sdImageFor(this, def.id) ? '  🖼' : ''), textStyle(24, '#ffffff', 700)).setOrigin(0.5, 0);
      const zone = this.add.zone(cx, cy - size / 2, size * 0.6, size).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => rig.playAttack(this.time.now));
    });

    new Button(this, W - 150, 60, 240, 70, '타이틀로', () => this.scene.start('title'), { fontSize: 28 });
    const auto = new Button(this, W - 420, 60, 260, 70, '자동 공격: 켜짐', () => {
      this.autoAttack = !this.autoAttack;
      auto.setText(`자동 공격: ${this.autoAttack ? '켜짐' : '꺼짐'}`);
    }, { fontSize: 26 });
    this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        if (!this.autoAttack) return;
        this.rigs.forEach((r, i) => this.time.delayedCall(i * 90, () => r.playAttack(this.time.now)));
      },
    });
  }

  update(time: number): void {
    for (const r of this.rigs) r.tick(time);
  }
}
