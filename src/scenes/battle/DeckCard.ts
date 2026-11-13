import Phaser from 'phaser';
import type { OperatorDef } from '../../data/types';
import { CLASS_INFO } from '../../data/operators';
import type { DeployError } from '../../battle/sim';
import { textStyle } from '../../ui/theme';
import { ensureOpTexture } from './textures';

export const CARD_W = 128;
export const CARD_H = 156;

export const RARITY_COLOR: Record<number, number> = {
  6: 0xff9d2e,
  5: 0xffd84a,
  4: 0xc6a2ff,
  3: 0x6fc3ff,
  2: 0xd8ff72,
  1: 0xcccccc,
};

const CLASS_GLYPH: Record<string, string> = {
  vanguard: '뱅',
  guard: '가',
  defender: '디',
  sniper: '스',
  caster: '캐',
  medic: '메',
  supporter: '서',
  specialist: '특',
};

/** 오른쪽 아래 배치 덱의 멤버 카드 (명일방주식 세로 카드) */
export class DeckCard extends Phaser.GameObjects.Container {
  private dim: Phaser.GameObjects.Rectangle;
  private costText: Phaser.GameObjects.Text;
  private cdText: Phaser.GameObjects.Text;
  private cdShade: Phaser.GameObjects.Rectangle;
  private frame: Phaser.GameObjects.Rectangle;
  targetX = 0;
  baseY = 0;

  constructor(scene: Phaser.Scene, readonly def: OperatorDef) {
    super(scene, 0, 0);
    const w = CARD_W;
    const h = CARD_H;
    const cls = CLASS_INFO[def.cls];
    const bg = scene.add.rectangle(0, 0, w, h, 0x101215).setStrokeStyle(2, 0x000000);
    // 초상화 영역: 퍼스널 컬러 그라데이션 + SD 얼굴 확대
    const art = scene.add.graphics();
    const dark = Phaser.Display.Color.ValueToColor(def.color).darken(35).color;
    art.fillGradientStyle(def.color, def.color, dark, dark, 1);
    art.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    const face = scene.add.image(0, -h / 2 + 8, ensureOpTexture(scene, def)).setOrigin(0.5, 0).setScale(1.25);
    face.setCrop(14, 0, 100, 112);
    const fade = scene.add.graphics();
    fade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.85, 0.85);
    fade.fillRect(-w / 2 + 3, h / 2 - 64, w - 6, 61);
    // 등급 띠
    const stripe = scene.add.rectangle(0, h / 2 - 3, w - 6, 5, RARITY_COLOR[def.rarity] ?? 0xffffff);
    // 클래스 아이콘 (왼쪽 아래)
    const clsBg = scene.add.circle(-w / 2 + 20, h / 2 - 22, 15, 0x000000, 0.75).setStrokeStyle(2, cls.color);
    const clsTx = scene.add.text(-w / 2 + 20, h / 2 - 22, CLASS_GLYPH[def.cls], textStyle(16, '#ffffff', 900)).setOrigin(0.5);
    // 코스트 (왼쪽 위)
    const costBg = scene.add.rectangle(-w / 2 + 3, -h / 2 + 3, 42, 34, 0x000000, 0.8).setOrigin(0, 0);
    this.costText = scene.add.text(-w / 2 + 24, -h / 2 + 20, String(def.cost), textStyle(26, '#ffffff', 900)).setOrigin(0.5);
    // 상태 표시
    this.dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0.55);
    this.cdShade = scene.add.rectangle(0, h / 2, w - 6, h - 6, 0x8b0000, 0.6).setOrigin(0.5, 1);
    this.cdText = scene.add
      .text(0, 4, '', { ...textStyle(46, '#ffffff', 900), stroke: '#5a0000', strokeThickness: 6 })
      .setOrigin(0.5);
    this.frame = scene.add.rectangle(0, 0, w + 4, h + 4).setStrokeStyle(4, 0xffffff).setVisible(false);
    this.add([bg, art, face, fade, stripe, clsBg, clsTx, costBg, this.costText, this.dim, this.cdShade, this.cdText, this.frame]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    scene.add.existing(this);
  }

  refresh(err: DeployError | null, cooldown: number): void {
    this.dim.setVisible(err !== null && err !== 'cooldown');
    this.costText.setColor(err === 'cost' ? '#ff5a5a' : '#ffffff');
    const cd = err === 'cooldown';
    this.cdShade.setVisible(cd);
    this.cdText.setText(cd ? Math.ceil(cooldown).toString() : '');
    if (cd) this.cdShade.scaleY = Phaser.Math.Clamp(cooldown / this.def.redeploy, 0, 1);
  }

  setSelected(sel: boolean): void {
    this.frame.setVisible(sel);
    this.y = sel ? this.baseY - 18 : this.baseY;
  }
}
