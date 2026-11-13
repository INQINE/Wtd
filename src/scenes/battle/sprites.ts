import Phaser from 'phaser';
import type { Dir, EnemyDef, OperatorDef } from '../../data/types';
import { EN_TEX, ensureEnemyTexture } from './textures';
import { createSDView, type SDView } from '../../sd/factory';

/** 체력바/스킬바 기준 크기 (k = 1칸 픽셀일 때 k=REF_K 에서 1배) */
const REF_K = 120;

/** 땅 위 방향 표시 삼각형 각도 */
const DIR_ANGLE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

/**
 * 2.5D 멤버 스프라이트 (빌보드).
 * 컨테이너 위치 = 발 위치(투영된 바닥 좌표). k = 그 지점의 1칸 픽셀 수.
 */
export class OperatorSprite extends Phaser.GameObjects.Container {
  /** SD 리그 (명일방주식 치비, 부위별 애니메이션) */
  readonly rig: SDView;
  private shadow: Phaser.GameObjects.Ellipse;
  private dirMark: Phaser.GameObjects.Triangle;
  private aura: Phaser.GameObjects.Ellipse;
  private bars: Phaser.GameObjects.Container;
  private hpFill: Phaser.GameObjects.Rectangle;
  private spFill: Phaser.GameObjects.Rectangle;
  private readyIcon: Phaser.GameObjects.Container;
  private k = REF_K;
  private facing: 'left' | 'right' = 'right';

  constructor(scene: Phaser.Scene, readonly def: OperatorDef) {
    super(scene, 0, 0);
    this.shadow = scene.add.ellipse(0, 0, 100, 100, 0x000000, 0.4);
    this.aura = scene.add.ellipse(0, 0, 100, 100, 0xffd54a, 0).setStrokeStyle(3, 0xffd54a, 0.9).setVisible(false);
    this.dirMark = scene.add.triangle(0, 0, 0, -8, 0, 8, 14, 0, 0xffffff, 0.85);
    this.rig = createSDView(scene, def, false);

    // 발밑 체력/SP 바 (명일방주처럼 멤버 아래쪽)
    this.bars = scene.add.container(0, 0);
    const bw = 78;
    const bg = scene.add.rectangle(0, 0, bw + 4, 15, 0x000000, 0.75).setOrigin(0.5, 0);
    this.hpFill = scene.add.rectangle(-bw / 2, 2, bw, 6, 0x4fc3f7).setOrigin(0, 0);
    this.spFill = scene.add.rectangle(-bw / 2, 9, bw, 4, 0x9be15d).setOrigin(0, 0);
    this.bars.add([bg, this.hpFill, this.spFill]);

    // 스킬 준비 아이콘 (머리 위)
    this.readyIcon = scene.add.container(0, 0).setVisible(false);
    const pts = [new Phaser.Math.Vector2(0, -14), new Phaser.Math.Vector2(12, 0), new Phaser.Math.Vector2(0, 14), new Phaser.Math.Vector2(-12, 0)];
    const g = scene.add.graphics();
    g.fillStyle(0xffd54a, 1).fillPoints(pts, true);
    g.lineStyle(3, 0x2b2100, 1).strokePoints(pts, true);
    g.fillStyle(0x2b2100, 1).fillTriangle(-2, -8, 4, -1, -3, 1).fillTriangle(3, -1, -3, 8, 2, 1);
    this.readyIcon.add(g);

    this.add([this.shadow, this.aura, this.dirMark, this.rig, this.bars, this.readyIcon]);
    scene.add.existing(this);
  }

  /** 투영 배율에 맞춰 크기 조정 */
  setK(k: number, squash: number): void {
    this.k = k;
    this.rig.setHeightPx(k * 0.98);
    this.shadow.setDisplaySize(k * 0.62, k * 0.62 * squash);
    this.auraW = k * 0.95;
    this.auraH = k * 0.95 * squash;
    this.aura.setDisplaySize(this.auraW, this.auraH);
    const bs = Phaser.Math.Clamp(k / REF_K, 0.75, 1.25);
    this.bars.setScale(bs).setPosition(0, k * 0.16);
    this.readyIcon.setPosition(0, -k * 1.1);
    this.dirMark.setScale(bs);
    this.updateDirMark(squash);
  }

  private auraW = 100;
  private auraH = 50;
  private dir: Dir = 'right';
  private squash = 0.5;

  setDir(dir: Dir): void {
    this.dir = dir;
    if (dir === 'left' || dir === 'right') this.facing = dir;
    this.rig.setFacing(this.facing === 'left');
    this.updateDirMark(this.squash);
  }

  private updateDirMark(squash: number): void {
    this.squash = squash;
    const a = Phaser.Math.DegToRad(DIR_ANGLE[this.dir]);
    const r = this.k * 0.42;
    this.dirMark.setPosition(Math.cos(a) * r, Math.sin(a) * r * squash);
    this.dirMark.setRotation(Math.atan2(Math.sin(a) * squash, Math.cos(a)));
  }

  /** 매 프레임 애니메이션 갱신 (ms) */
  tick(now: number): void {
    this.rig.tick(now);
  }

  setStatus(hpRatio: number, spRatio: number, skillActive: boolean, skillRemainRatio: number, ready: boolean, time: number): void {
    this.hpFill.scaleX = Phaser.Math.Clamp(hpRatio, 0, 1);
    if (skillActive) {
      this.spFill.scaleX = Phaser.Math.Clamp(skillRemainRatio, 0, 1);
      this.spFill.fillColor = 0xffa726;
    } else {
      this.spFill.scaleX = Phaser.Math.Clamp(spRatio, 0, 1);
      this.spFill.fillColor = spRatio >= 1 ? 0xffd54a : 0x9be15d;
    }
    this.readyIcon.setVisible(ready);
    if (ready) this.readyIcon.y = -this.k * 1.1 - Math.abs(Math.sin(time * 4)) * 6;
    this.aura.setVisible(skillActive);
    if (skillActive) {
      const p = (time * 1.5) % 1;
      this.aura.setAlpha(1 - p);
      this.aura.setDisplaySize(this.auraW * (1 + p * 0.25), this.auraH * (1 + p * 0.25));
    }
  }
}

/** 2.5D 적 스프라이트 (빌보드) */
export class EnemySprite extends Phaser.GameObjects.Container {
  readonly img: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private bar: Phaser.GameObjects.Container;
  private hpFill: Phaser.GameObjects.Rectangle;
  private k = REF_K;

  constructor(scene: Phaser.Scene, readonly def: EnemyDef) {
    super(scene, 0, 0);
    const key = ensureEnemyTexture(scene, def);
    this.shadow = scene.add.ellipse(0, 0, 100, 100, 0x000000, def.air ? 0.25 : 0.4);
    this.img = scene.add.image(0, 0, key).setOrigin(0.5, 0.97);
    this.bar = scene.add.container(0, 0);
    const bw = 62;
    const bg = scene.add.rectangle(0, 0, bw + 4, 9, 0x000000, 0.75).setOrigin(0.5, 0);
    this.hpFill = scene.add.rectangle(-bw / 2, 2, bw, 5, 0xff6e40).setOrigin(0, 0);
    this.bar.add([bg, this.hpFill]).setVisible(false);
    this.add([this.shadow, this.img, this.bar]);
    scene.add.existing(this);
  }

  setK(k: number, squash: number, bob: number, facingLeft: boolean): void {
    this.k = k;
    const lift = this.def.air ? k * 0.55 : 0;
    this.img.setScale((k / EN_TEX) * 0.85).setPosition(0, -lift - bob);
    this.img.setFlipX(facingLeft);
    this.shadow.setDisplaySize(k * 0.55, k * 0.55 * squash);
    const bs = Phaser.Math.Clamp(k / REF_K, 0.75, 1.25);
    this.bar.setScale(bs).setPosition(0, k * 0.12);
  }

  setHp(ratio: number): void {
    this.hpFill.scaleX = Phaser.Math.Clamp(ratio, 0, 1);
    this.bar.setVisible(ratio < 1);
  }

  get headY(): number {
    return -(this.def.air ? this.k * 0.55 : 0) - this.k * 0.7;
  }
}
