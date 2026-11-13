/**
 * SD 리그: 부위별 텍스처를 관절 구조로 묶고, 코드로 애니메이션한다.
 * (명일방주는 Spine 뼈대 애니메이션을 쓰는데, 같은 원리를 Phaser 컨테이너로 흉내 냄)
 *
 *   root (발 = 0,0)
 *    ├ backHair      (목에 붙음, 상체를 따라 움직임)
 *    ├ legs          (엉덩이 피벗)
 *    └ upper         (엉덩이 피벗, 숨쉬기/기울기)
 *        ├ armB      (뒤쪽 팔)
 *        ├ body
 *        ├ head      (목 피벗)
 *        └ armF      (앞쪽 팔 + 무기)
 */
import Phaser from 'phaser';
import { drawArm, drawBackHair, drawBody, drawHead, drawLegs, drawWeapon, WEAPON_POSE, type WeaponPose } from './parts';
import type { SDSpec } from './spec';

/** 텍스처 해상도 배율 (디자인 1px = 2 텍스처 px) */
export const SD_RES = 2;
/** 캐릭터 전체 키 (디자인 px) */
export const SD_HEIGHT = 226;

const HIP: [number, number] = [0, -62];
const NECK_FROM_HIP = -58;
const SHOULDER_F: [number, number] = [12, -52];
const SHOULDER_B: [number, number] = [-12, -52];
const HAND = 42;

type Box = [x0: number, y0: number, x1: number, y1: number];
const BOX = {
  head: [-125, -165, 125, 60] as Box,
  backHair: [-115, -150, 115, 130] as Box,
  body: [-55, -80, 55, 60] as Box,
  legs: [-75, -80, 50, 80] as Box,
  arm: [-15, -10, 15, 52] as Box,
  weapon: [-48, -160, 48, 52] as Box,
};

type PartName = keyof typeof BOX | 'armB';

function bakePart(scene: Phaser.Scene, key: string, box: Box, draw: (g: Phaser.GameObjects.Graphics) => void): [number, number] {
  const [x0, y0, x1, y1] = box;
  const ox = -x0 / (x1 - x0);
  const oy = -y0 / (y1 - y0);
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    g.translateCanvas(-x0 * SD_RES, -y0 * SD_RES);
    g.scaleCanvas(SD_RES, SD_RES);
    draw(g);
    g.generateTexture(key, (x1 - x0) * SD_RES, (y1 - y0) * SD_RES);
    g.destroy();
  }
  return [ox, oy];
}

interface Baked {
  keys: Record<PartName, string>;
  origins: Record<PartName, [number, number]>;
}

/** 사양 → 부위 텍스처 (prefix별로 한 번만 굽는다) */
export function bakeSD(scene: Phaser.Scene, prefix: string, spec: SDSpec): Baked {
  const keys = {} as Record<PartName, string>;
  const origins = {} as Record<PartName, [number, number]>;
  const add = (name: PartName, box: Box, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    keys[name] = `${prefix}-${name}`;
    origins[name] = bakePart(scene, keys[name], box, draw);
  };
  add('backHair', BOX.backHair, (g) => drawBackHair(g, spec));
  add('legs', BOX.legs, (g) => drawLegs(g, spec));
  add('body', BOX.body, (g) => drawBody(g, spec));
  add('head', BOX.head, (g) => drawHead(g, spec));
  add('arm', BOX.arm, (g) => drawArm(g, spec, false));
  add('armB', BOX.arm, (g) => drawArm(g, spec, true));
  add('weapon', BOX.weapon, (g) => drawWeapon(g, spec));
  return { keys, origins };
}

export class SDRig extends Phaser.GameObjects.Container {
  private backHair: Phaser.GameObjects.Image;
  private legs: Phaser.GameObjects.Image;
  private upper: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Image;
  private torso: Phaser.GameObjects.Image;
  private armF: Phaser.GameObjects.Container;
  private armB: Phaser.GameObjects.Container;
  private weapon: Phaser.GameObjects.Image;
  private images: Phaser.GameObjects.Image[];
  readonly pose: WeaponPose;
  private attackStart = -1;
  private phase = Math.random() * 10;
  private facingLeft = false;
  private baseScale = 1;

  constructor(scene: Phaser.Scene, prefix: string, readonly spec: SDSpec, addToScene = true) {
    super(scene, 0, 0);
    const b = bakeSD(scene, prefix, spec);
    const img = (name: PartName, x: number, y: number) =>
      scene.make
        .image({ x, y, key: b.keys[name] }, false)
        .setOrigin(...b.origins[name])
        .setScale(1 / SD_RES);
    this.pose = WEAPON_POSE[spec.weapon.type];

    this.backHair = img('backHair', HIP[0], HIP[1] + NECK_FROM_HIP);
    this.legs = img('legs', HIP[0], HIP[1]);
    this.upper = scene.make.container({ x: HIP[0], y: HIP[1] }, false);
    this.torso = img('body', 0, 0);
    this.head = img('head', 0, NECK_FROM_HIP);
    const armBImg = img('armB', 0, 0);
    this.armB = scene.make.container({ x: SHOULDER_B[0], y: SHOULDER_B[1] }, false);
    this.armB.add(armBImg);
    this.armB.setAngle(14);
    const armFImg = img('arm', 0, 0);
    this.weapon = img('weapon', 0, HAND);
    this.weapon.setAngle(this.pose.angle - this.pose.arm);
    this.armF = scene.make.container({ x: SHOULDER_F[0], y: SHOULDER_F[1] }, false);
    this.armF.add([this.weapon, armFImg]);
    this.armF.setAngle(this.pose.arm);
    this.upper.add([this.armB, this.torso, this.head, this.armF]);
    this.add([this.backHair, this.legs, this.upper]);
    this.images = [this.backHair, this.legs, this.torso, this.head, armBImg, armFImg, this.weapon];
    if (addToScene) scene.add.existing(this);
  }

  /** 화면에서의 키(px)를 지정 */
  setHeightPx(px: number): this {
    this.baseScale = px / SD_HEIGHT;
    this.setScale(this.facingLeft ? -this.baseScale : this.baseScale, this.baseScale);
    return this;
  }

  setFacing(left: boolean): this {
    this.facingLeft = left;
    this.setScale(left ? -this.baseScale : this.baseScale, this.baseScale);
    return this;
  }

  playAttack(now: number): void {
    this.attackStart = now;
  }

  flash(color: number, ms = 70): void {
    this.images.forEach((i) => i.setTint(color));
    this.scene.time.delayedCall(ms, () => this.images.forEach((i) => i.clearTint()));
  }

  /** 매 프레임 호출. now = ms */
  tick(now: number): void {
    const t = now / 1000 + this.phase;
    // 대기: 숨쉬기 + 머리카락 흔들림
    const breath = Math.sin(t * 2.6);
    let upperY = HIP[1] + breath * 1.2;
    let upperX = HIP[0];
    let lean = 0;
    let arm = this.pose.arm + Math.sin(t * 2.6 + 0.6) * 2.5;
    let armX = SHOULDER_F[0];
    let headTilt = Math.sin(t * 1.3) * 1.5;

    if (this.attackStart >= 0) {
      const s = (now - this.attackStart) / 1000;
      const k = keyframe(this.pose.attack, s);
      if (k === null) {
        this.attackStart = -1;
      } else {
        arm += k.arm;
        lean += k.lean;
        upperX += k.dx;
        armX += k.armDx;
        headTilt += k.lean * 0.5;
      }
    }

    this.upper.setPosition(upperX, upperY);
    this.upper.setAngle(lean);
    this.upper.scaleY = 1 + breath * 0.008;
    this.head.setAngle(headTilt);
    this.armF.setAngle(arm);
    this.armF.x = armX;
    this.armB.setAngle(14 + Math.sin(t * 2.6) * 2 - lean * 0.5);
    // 뒷머리는 상체 위치를 따라가며 살짝 늦게 흔들림
    this.backHair.setPosition(upperX + Math.sin((lean * Math.PI) / 180) * NECK_FROM_HIP * -1, upperY + NECK_FROM_HIP);
    this.backHair.setAngle(headTilt * 0.6 + Math.sin(t * 2.2 - 0.8) * 2 - lean * 0.4);
  }
}

interface Key {
  arm: number;
  lean: number;
  dx: number;
  armDx: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - (1 - t) * (1 - t);

/** 공격 모션 키프레임: [시간(초), 팔 각도 변화, 상체 기울기, 상체 x, 팔 x] */
const TRACKS: Record<WeaponPose['attack'], [number, number, number, number, number][]> = {
  // 휘두르기: 들어올림 → 내려침 → 복귀
  slash: [
    [0, 0, 0, 0, 0],
    [0.09, -130, -5, -2, 0],
    [0.17, 35, 9, 5, 2],
    [0.42, 0, 0, 0, 0],
  ],
  thrust: [
    [0, 0, 0, 0, 0],
    [0.08, 18, -4, -3, -4],
    [0.15, -12, 7, 6, 12],
    [0.4, 0, 0, 0, 0],
  ],
  shoot: [
    [0, 0, 0, 0, 0],
    [0.04, -8, -4, -3, -3],
    [0.3, 0, 0, 0, 0],
  ],
  cast: [
    [0, 0, 0, 0, 0],
    [0.14, -55, -3, 0, 0],
    [0.26, -60, -4, 0, 0],
    [0.5, 0, 0, 0, 0],
  ],
  bash: [
    [0, 0, 0, 0, 0],
    [0.07, 6, -3, -3, -3],
    [0.14, -6, 6, 6, 10],
    [0.38, 0, 0, 0, 0],
  ],
};

function keyframe(kind: WeaponPose['attack'], s: number): Key | null {
  const tr = TRACKS[kind];
  if (s >= tr[tr.length - 1][0]) return null;
  let i = 1;
  while (i < tr.length - 1 && tr[i][0] < s) i++;
  const a = tr[i - 1];
  const b = tr[i];
  const t = ease(Phaser.Math.Clamp((s - a[0]) / (b[0] - a[0]), 0, 1));
  return { arm: lerp(a[1], b[1], t), lean: lerp(a[2], b[2], t), dx: lerp(a[3], b[3], t), armDx: lerp(a[4], b[4], t) };
}

/** 정지 자세 전신 초상 텍스처 (덱 카드·정보창용). 크기 260×260 디자인 px, 발 = (130, 250) */
export const PORTRAIT_SIZE = 260;
export const PORTRAIT_FOOT: [number, number] = [130, 250];

export function bakePortrait(scene: Phaser.Scene, prefix: string, spec: SDSpec): string {
  const key = `${prefix}-portrait`;
  if (scene.textures.exists(key)) return key;
  const rig = new SDRig(scene, prefix, spec, false);
  rig.setScale(SD_RES);
  const dt = scene.textures.addDynamicTexture(key, PORTRAIT_SIZE * SD_RES, PORTRAIT_SIZE * SD_RES);
  if (dt) dt.draw(rig, PORTRAIT_FOOT[0] * SD_RES, PORTRAIT_FOOT[1] * SD_RES);
  rig.destroy();
  return key;
}
