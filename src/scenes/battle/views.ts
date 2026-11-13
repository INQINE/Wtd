import Phaser from 'phaser';
import type { Dir, EnemyDef, OperatorDef } from '../../data/types';
import { CLASS_INFO } from '../../data/operators';
import { COLORS, textStyle } from '../../ui/theme';

const DIR_ANGLE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

/**
 * 멤버 임시 그래픽: 퍼스널 컬러 원 + 이름 첫 글자 + 방향 표시 + 체력바.
 * 나중에 SD 이미지가 생기면 이 클래스만 바꾸면 된다.
 */
export class OperatorView extends Phaser.GameObjects.Container {
  private hpFill: Phaser.GameObjects.Rectangle;
  private dirMark: Phaser.GameObjects.Triangle;
  private hpBg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly def: OperatorDef, size = 38) {
    super(scene, x, y);
    const shadow = scene.add.ellipse(0, size * 0.75, size * 1.8, size * 0.6, 0x000000, 0.35);
    const body = scene.add.circle(0, 0, size, def.color).setStrokeStyle(4, 0xffffff);
    const letter = scene.add
      .text(0, 1, def.short, { ...textStyle(Math.round(size * 1.05), '#ffffff', 900), stroke: '#000000', strokeThickness: 6 })
      .setOrigin(0.5);
    const badge = scene.add.circle(size * 0.72, -size * 0.72, size * 0.28, CLASS_INFO[def.cls].color).setStrokeStyle(2, 0xffffff);
    this.dirMark = scene.add.triangle(0, 0, 0, -9, 0, 9, 14, 0, 0xffffff).setOrigin(0, 0.5);
    this.dirMark.setPosition(size + 4, 0);
    this.hpBg = scene.add.rectangle(0, size + 14, size * 1.9, 9, 0x000000, 0.7).setStrokeStyle(1, 0x000000);
    this.hpFill = scene.add.rectangle(-size * 0.95, size + 14, size * 1.9, 7, COLORS.ok).setOrigin(0, 0.5);
    this.add([shadow, body, letter, badge, this.dirMark, this.hpBg, this.hpFill]);
    this.setDir('right');
    this.showHp(false);
    scene.add.existing(this);
  }

  setDir(dir: Dir): void {
    const a = Phaser.Math.DegToRad(DIR_ANGLE[dir]);
    const r = (this.list[1] as Phaser.GameObjects.Arc).radius + 6;
    this.dirMark.setPosition(Math.cos(a) * r, Math.sin(a) * r).setRotation(a);
  }

  showHp(show: boolean): void {
    this.hpBg.setVisible(show);
    this.hpFill.setVisible(show);
  }

  setHp(ratio: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    this.hpFill.scaleX = r;
    this.hpFill.fillColor = r > 0.5 ? COLORS.ok : r > 0.25 ? 0xf2c94c : COLORS.danger;
  }
}

/** 적 임시 그래픽: 모양 + 흑화 오라 + 눈 + 체력바 */
export class EnemyView extends Phaser.GameObjects.Container {
  private hpFill: Phaser.GameObjects.Rectangle;
  readonly radius: number;
  readonly sprite: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly def: EnemyDef, scale = 1) {
    super(scene, x, y);
    const r = (def.shape === 'small' ? 22 : def.shape === 'square' ? 32 : 28) * scale;
    this.radius = r;
    const lift = def.air ? 30 * scale : 0;
    const shadow = scene.add.ellipse(0, r * 0.7, r * 1.8, r * 0.55, 0x000000, def.air ? 0.25 : 0.4);
    this.sprite = scene.add.container(0, -lift);
    const aura = scene.add.circle(0, 0, r * 1.35, 0x9b30ff, 0.22);
    const texKey = `enemy-${def.id}-${r.toFixed(1)}`;
    if (!scene.textures.exists(texKey)) {
      const g = scene.make.graphics({}, false);
      g.translateCanvas(r * 2, r * 2);
      g.fillStyle(def.color, 1);
      g.lineStyle(4, COLORS.shadow, 1);
      switch (def.shape) {
        case 'square':
          g.fillRoundedRect(-r, -r, r * 2, r * 2, 8);
          g.strokeRoundedRect(-r, -r, r * 2, r * 2, 8);
          break;
        case 'diamond':
          g.fillPoints([new Phaser.Math.Vector2(0, -r), new Phaser.Math.Vector2(r, 0), new Phaser.Math.Vector2(0, r), new Phaser.Math.Vector2(-r, 0)], true);
          g.strokePoints([new Phaser.Math.Vector2(0, -r), new Phaser.Math.Vector2(r, 0), new Phaser.Math.Vector2(0, r), new Phaser.Math.Vector2(-r, 0)], true);
          // 날개
          g.fillStyle(0xdfe9ee, 0.9);
          g.fillTriangle(-r, 0, -r * 1.9, -r * 0.7, -r * 1.5, r * 0.3);
          g.fillTriangle(r, 0, r * 1.9, -r * 0.7, r * 1.5, r * 0.3);
          break;
        case 'triangle':
          g.fillTriangle(0, -r * 1.1, r * 1.05, r * 0.8, -r * 1.05, r * 0.8);
          g.strokeTriangle(0, -r * 1.1, r * 1.05, r * 0.8, -r * 1.05, r * 0.8);
          break;
        default:
          g.fillCircle(0, 0, r);
          g.strokeCircle(0, 0, r);
      }
      // 눈 (흑화 = 빨간 눈)
      const eyeY = def.shape === 'triangle' ? r * 0.15 : -r * 0.15;
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-r * 0.35, eyeY, r * 0.22);
      g.fillCircle(r * 0.35, eyeY, r * 0.22);
      g.fillStyle(0xff2a2a, 1);
      g.fillCircle(-r * 0.32, eyeY, r * 0.11);
      g.fillCircle(r * 0.38, eyeY, r * 0.11);
      g.generateTexture(texKey, r * 4, r * 4);
      g.destroy();
    }
    const img = scene.add.image(0, 0, texKey);
    this.sprite.add([aura, img]);
    const hpBg = scene.add.rectangle(0, -r - 14 - lift, r * 2, 7, 0x000000, 0.7);
    this.hpFill = scene.add.rectangle(-r, -r - 14 - lift, r * 2, 5, COLORS.danger).setOrigin(0, 0.5);
    this.add([shadow, this.sprite, hpBg, this.hpFill]);
    scene.add.existing(this);
  }

  setHp(ratio: number): void {
    this.hpFill.scaleX = Phaser.Math.Clamp(ratio, 0, 1);
  }
}
