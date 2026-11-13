/**
 * 이미지 한 장짜리 SD에 애니메이션을 붙인다 (이미지 생성 앱으로 만든 그림용).
 * 대기: 발 기준 숨쉬기(늘었다 줄었다) / 공격: 클래스에 맞는 몸짓 / 피격: 붉은 번쩍임
 */
import Phaser from 'phaser';
import type { ClassId } from '../data/types';
import { sdImageKey, type SDImageEntry } from './registry';

type Motion = 'lunge' | 'recoil' | 'hop';

const MOTION: Record<ClassId, Motion> = {
  vanguard: 'lunge',
  guard: 'lunge',
  defender: 'lunge',
  specialist: 'lunge',
  sniper: 'recoil',
  caster: 'hop',
  medic: 'hop',
  supporter: 'hop',
};

export class ImageRig extends Phaser.GameObjects.Container {
  readonly img: Phaser.GameObjects.Image;
  private baseScale = 1;
  private facingLeft = false;
  private attackStart = -1;
  private phase = Math.random() * 10;
  private motion: Motion;

  constructor(scene: Phaser.Scene, id: string, readonly entry: SDImageEntry, cls: ClassId, addToScene = true) {
    super(scene, 0, 0);
    this.img = scene.make.image({ x: 0, y: 0, key: sdImageKey(id) }, false).setOrigin(entry.anchorX, 1);
    this.add(this.img);
    this.motion = MOTION[cls];
    if (addToScene) scene.add.existing(this);
  }

  /** 캐릭터 키(px). 이미지 높이 기준 × manifest scale */
  setHeightPx(px: number): this {
    this.baseScale = (px * 1.08 * this.entry.scale) / this.img.height;
    this.applyScale(1, 1);
    return this;
  }

  setFacing(left: boolean): this {
    this.facingLeft = left;
    this.applyScale(1, 1);
    return this;
  }

  private applyScale(sx: number, sy: number): void {
    // 그림이 왼쪽을 보고 있으면 반대로 뒤집는다
    const flip = this.facingLeft !== (this.entry.facing === 'left') ? -1 : 1;
    this.img.setScale(this.baseScale * sx * flip, this.baseScale * sy);
  }

  playAttack(now: number): void {
    this.attackStart = now;
  }

  flash(color: number, ms = 70): void {
    this.img.setTint(color);
    this.scene.time.delayedCall(ms, () => this.img.clearTint());
  }

  tick(now: number): void {
    const t = now / 1000 + this.phase;
    const b = Math.sin(t * 2.6);
    let sx = 1 - b * 0.006;
    let sy = 1 + b * 0.014;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    if (this.attackStart >= 0) {
      const s = (now - this.attackStart) / 1000;
      const dur = this.motion === 'recoil' ? 0.25 : 0.38;
      if (s >= dur) this.attackStart = -1;
      else {
        const p = s / dur;
        const dir = this.facingLeft ? -1 : 1;
        const h = this.img.displayHeight;
        if (this.motion === 'lunge') {
          // 예비 동작(뒤로 움츠림) → 앞으로 내지름 → 복귀
          const k = p < 0.25 ? -p / 0.25 : p < 0.45 ? -1 + ((p - 0.25) / 0.2) * 2.4 : 1.4 * (1 - (p - 0.45) / 0.55);
          dx = dir * k * h * 0.06;
          rot = dir * k * 0.06;
          sx *= 1 + Math.max(0, k) * 0.05;
          sy *= 1 - Math.max(0, k) * 0.04;
        } else if (this.motion === 'recoil') {
          const k = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
          dx = -dir * k * h * 0.035;
          rot = -dir * k * 0.03;
        } else {
          const k = Math.sin(p * Math.PI);
          dy = -k * h * 0.06;
          sy *= 1 + k * 0.04;
        }
      }
    }
    this.applyScale(sx, sy);
    this.img.setPosition(dx, dy);
    this.img.setRotation(rot);
  }
}
