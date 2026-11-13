import Phaser from 'phaser';
import type { OperatorDef } from '../../data/types';
import { CLASS_INFO } from '../../data/operators';
import type { DeployError } from '../../battle/sim';
import { COLORS, textStyle } from '../../ui/theme';

export const CARD_W = 150;
export const CARD_H = 168;

/** 아래쪽 배치 덱의 멤버 카드 */
export class DeckCard extends Phaser.GameObjects.Container {
  private dim: Phaser.GameObjects.Rectangle;
  private costText: Phaser.GameObjects.Text;
  private cdText: Phaser.GameObjects.Text;
  private frame: Phaser.GameObjects.Rectangle;
  targetX = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly def: OperatorDef) {
    super(scene, x, y);
    const w = CARD_W;
    const h = CARD_H;
    const cls = CLASS_INFO[def.cls];
    const bg = scene.add.rectangle(0, 0, w, h, COLORS.panel).setStrokeStyle(2, COLORS.line);
    const art = scene.add.rectangle(0, -14, w - 8, h - 50, def.color, 0.85);
    const shine = scene.add.rectangle(0, -h / 2 + 30, w - 8, 40, 0xffffff, 0.08);
    const letter = scene.add
      .text(0, -16, def.short, { ...textStyle(64, '#ffffff', 900), stroke: '#000000', strokeThickness: 6 })
      .setOrigin(0.5);
    const stars = scene.add.text(w / 2 - 8, -h / 2 + 6, '★'.repeat(def.rarity), textStyle(12, '#ffe27a')).setOrigin(1, 0);
    const clsBar = scene.add.rectangle(0, h / 2 - 18, w, 36, 0x0d0f12, 0.95);
    const clsDot = scene.add.circle(-w / 2 + 16, h / 2 - 18, 8, cls.color);
    const name = scene.add
      .text(-w / 2 + 30, h / 2 - 18, def.name.length > 5 ? def.name.slice(0, 5) + '…' : def.name, textStyle(19))
      .setOrigin(0, 0.5);
    const costBg = scene.add.rectangle(-w / 2 + 4, -h / 2 + 4, 44, 36, 0x0d0f12, 0.9).setOrigin(0, 0);
    this.costText = scene.add.text(-w / 2 + 26, -h / 2 + 22, String(def.cost), textStyle(26)).setOrigin(0.5);
    this.dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0.6);
    this.cdText = scene.add.text(0, -14, '', { ...textStyle(40, '#ff6b6b', 900), stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5);
    this.frame = scene.add.rectangle(0, 0, w, h).setStrokeStyle(4, COLORS.accent).setVisible(false);
    this.add([bg, art, shine, letter, stars, clsBar, clsDot, name, costBg, this.costText, this.dim, this.cdText, this.frame]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    scene.add.existing(this);
  }

  refresh(err: DeployError | null, cooldown: number): void {
    const usable = err === null;
    this.dim.setVisible(!usable);
    this.costText.setColor(err === 'cost' ? '#ff6b6b' : COLORS.text);
    this.cdText.setText(err === 'cooldown' ? Math.ceil(cooldown).toString() : '');
  }

  setSelected(sel: boolean): void {
    this.frame.setVisible(sel);
    this.y = sel ? this.baseY - 14 : this.baseY;
  }

  baseY = 0;
}
