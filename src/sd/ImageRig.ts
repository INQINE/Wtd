/**
 * 이미지로 된 SD에 애니메이션을 붙인다 (이미지 생성 앱으로 만든 그림용).
 *
 * - 대기: 발 기준 숨쉬기(늘었다 줄었다)
 * - 공격: 클래스에 맞는 몸짓 (근접 내지르기 / 저격 반동 / 시전)
 *   · manifest에 무기 끝 위치(tip)가 있으면 공격 순간 그 자리에서 빛과 반짝이가 터진다
 *   · manifest에 attack 스프라이트 시트가 있으면 그 프레임을 재생한다 (ChatGPT 등으로 만든 동작 그림)
 * - 피격: 붉은 번쩍임
 */
import Phaser from 'phaser';
import type { ClassId } from '../data/types';
import { sdAttackKey, sdImageKey, type SDImageEntry } from './registry';

type Motion = 'lunge' | 'recoil' | 'cast';

const MOTION: Record<ClassId, Motion> = {
  vanguard: 'lunge',
  guard: 'lunge',
  defender: 'lunge',
  specialist: 'lunge',
  sniper: 'recoil',
  caster: 'cast',
  medic: 'cast',
  supporter: 'cast',
};

const DURATION: Record<Motion, number> = { lunge: 0.38, recoil: 0.25, cast: 0.55 };
/** 시전 모션에서 무기 끝이 빛나는 시점 (초) */
const CAST_PEAK = 0.2;

function ensureFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('sd-glow')) {
    const g = scene.make.graphics({}, false);
    for (let i = 16; i > 0; i--) {
      g.fillStyle(0xffffff, 0.06 + (16 - i) * 0.012);
      g.fillCircle(64, 64, i * 4);
    }
    g.generateTexture('sd-glow', 128, 128);
    g.destroy();
  }
  if (!scene.textures.exists('sd-star')) {
    const g = scene.make.graphics({}, false);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 === 0 ? 30 : 8;
      pts.push(new Phaser.Math.Vector2(32 + Math.cos(a) * r, 32 + Math.sin(a) * r));
    }
    g.fillStyle(0xffffff, 1);
    g.fillPoints(pts, true);
    g.generateTexture('sd-star', 64, 64);
    g.destroy();
  }
}

export class ImageRig extends Phaser.GameObjects.Container {
  readonly img: Phaser.GameObjects.Image;
  private baseScale = 1;
  private facingLeft = false;
  private attackStart = -1;
  private phase = Math.random() * 10;
  private motion: Motion;
  private fxFired = false;
  private readonly fxColor: number;
  private readonly idleKey: string;
  private readonly attackKey: string | null;
  private usingAttackSheet = false;

  constructor(scene: Phaser.Scene, readonly id: string, readonly entry: SDImageEntry, cls: ClassId, addToScene = true) {
    super(scene, 0, 0);
    ensureFxTextures(scene);
    this.idleKey = sdImageKey(id);
    this.attackKey = entry.attack && scene.textures.exists(sdAttackKey(id)) ? sdAttackKey(id) : null;
    this.img = scene.make.image({ x: 0, y: 0, key: this.idleKey }, false).setOrigin(entry.anchorX, 1);
    this.add(this.img);
    this.motion = MOTION[cls];
    this.fxColor = entry.fxColor ? Phaser.Display.Color.HexStringToColor(entry.fxColor).color : 0xffe9a8;
    if (addToScene) scene.add.existing(this);
  }

  /** 캐릭터 키(px). 이미지 높이 기준 × manifest scale */
  setHeightPx(px: number): this {
    const h = this.scene.textures.get(this.idleKey).getSourceImage().height;
    this.baseScale = (px * 1.08 * this.entry.scale) / h;
    this.applyScale(1, 1);
    return this;
  }

  setFacing(left: boolean): this {
    this.facingLeft = left;
    this.applyScale(1, 1);
    return this;
  }

  private get flip(): number {
    // 그림이 왼쪽을 보고 있으면 반대로 뒤집는다
    return this.facingLeft !== (this.entry.facing === 'left') ? -1 : 1;
  }

  private applyScale(sx: number, sy: number): void {
    let s = this.baseScale;
    if (this.usingAttackSheet && this.entry.attack) {
      // 동작 시트는 프레임 크기가 달라서, 첫 프레임의 몸 크기가 대기 그림과 같아지도록 맞춘다
      const idleH = this.scene.textures.get(this.idleKey).getSourceImage().height;
      s = (this.baseScale * idleH) / (this.entry.attack.frameHeight * this.entry.attack.bodyRatio);
    }
    this.img.setScale(s * sx * this.flip, s * sy);
  }

  playAttack(now: number): void {
    this.attackStart = now;
    this.fxFired = false;
  }

  flash(color: number, ms = 70): void {
    this.img.setTint(color);
    this.scene.time.delayedCall(ms, () => this.img.clearTint());
  }

  /** 무기 끝 위치 (월드 좌표). manifest에 tip이 없으면 null */
  tipWorld(): Phaser.Math.Vector2 | null {
    const tip = this.entry.tip;
    if (!tip || this.usingAttackSheet) return null;
    const src = this.scene.textures.get(this.idleKey).getSourceImage();
    const lx = (tip[0] - this.entry.anchorX) * src.width * this.img.scaleX;
    const ly = (tip[1] - 1) * src.height * this.img.scaleY;
    const r = this.img.rotation;
    const x = this.img.x + lx * Math.cos(r) - ly * Math.sin(r);
    const y = this.img.y + lx * Math.sin(r) + ly * Math.cos(r);
    return this.getWorldTransformMatrix().transformPoint(x, y, new Phaser.Math.Vector2()) as Phaser.Math.Vector2;
  }

  private castFx(): void {
    const p = this.tipWorld();
    if (!p) return;
    const k = Math.abs(this.img.displayHeight) / 300;
    const depth = (this.parentContainer?.depth ?? this.depth) + 5;
    const glow = this.scene.add.image(p.x, p.y, 'sd-glow').setTint(this.fxColor).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    glow.setScale(0.3 * k).setAlpha(1);
    this.scene.tweens.add({ targets: glow, scale: 1.5 * k, alpha: 0, duration: 420, ease: 'Quad.out', onComplete: () => glow.destroy() });
    const flare = this.scene.add.image(p.x, p.y, 'sd-star').setTint(0xffffff).setDepth(depth + 1).setScale(0.2 * k);
    this.scene.tweens.add({ targets: flare, scale: 1.1 * k, angle: 90, alpha: 0, duration: 360, onComplete: () => flare.destroy() });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const d = (40 + Math.random() * 40) * k;
      const s = this.scene.add.image(p.x, p.y, 'sd-star').setTint(i % 2 ? 0xffffff : this.fxColor).setDepth(depth + 1);
      s.setScale((0.12 + Math.random() * 0.1) * k).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: s,
        x: p.x + Math.cos(a) * d,
        y: p.y + Math.sin(a) * d - 10 * k,
        angle: 180,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Cubic.out',
        onComplete: () => s.destroy(),
      });
    }
  }

  tick(now: number): void {
    const t = now / 1000 + this.phase;
    const b = Math.sin(t * 2.6);
    let sx = 1 - b * 0.006;
    let sy = 1 + b * 0.014;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    const dir = this.facingLeft ? -1 : 1;
    const h = Math.abs(this.img.displayHeight);

    if (this.attackStart >= 0) {
      const s = (now - this.attackStart) / 1000;
      const sheet = this.attackKey ? this.entry.attack! : null;
      const dur = sheet ? sheet.frames / sheet.fps : DURATION[this.motion];
      if (s >= dur) {
        this.attackStart = -1;
        if (this.usingAttackSheet) {
          this.usingAttackSheet = false;
          this.img.setTexture(this.idleKey).setOrigin(this.entry.anchorX, 1);
        }
      } else if (sheet && this.attackKey) {
        // 프레임 애니메이션 재생
        if (!this.usingAttackSheet) {
          this.usingAttackSheet = true;
          this.img.setTexture(this.attackKey, 0).setOrigin(sheet.anchorX, 1);
        }
        this.img.setFrame(Math.min(sheet.frames - 1, Math.floor(s * sheet.fps)));
        sx = sy = 1;
      } else {
        const p = s / dur;
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
          // 시전: 뒤로 젖히며 들어올림(예비) → 앞으로 내밀며 빛 방출 → 천천히 복귀
          const peak = CAST_PEAK;
          let lean: number;
          let lift: number;
          if (s < peak) {
            const q = Phaser.Math.Easing.Quadratic.Out(s / peak);
            lean = -q;
            lift = q;
          } else if (s < peak + 0.08) {
            const q = (s - peak) / 0.08;
            lean = -1 + q * 2.2;
            lift = 1 - q * 0.6;
          } else {
            const q = Phaser.Math.Easing.Sine.InOut((s - peak - 0.08) / (dur - peak - 0.08));
            lean = 1.2 * (1 - q);
            lift = 0.4 * (1 - q);
          }
          rot = dir * lean * 0.07;
          dx = dir * lean * h * 0.025;
          dy = -lift * h * 0.05;
          sy *= 1 + lift * 0.035;
          sx *= 1 - lift * 0.015;
          if (!this.fxFired && s >= peak) {
            this.fxFired = true;
            this.castFx();
          }
        }
      }
    }
    this.applyScale(sx, sy);
    this.img.setPosition(dx, dy);
    this.img.setRotation(rot);
  }
}
