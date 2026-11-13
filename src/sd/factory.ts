/** 멤버 하나의 SD 표시 객체를 만든다: 가져온 이미지가 있으면 ImageRig, 없으면 코드로 그린 SDRig */
import Phaser from 'phaser';
import type { OperatorDef } from '../data/types';
import { sdSpecFor } from '../data/sdSpecs';
import { ImageRig } from './ImageRig';
import { sdImageFor, sdImageKey } from './registry';
import { bakePortrait, PORTRAIT_FOOT, PORTRAIT_SIZE, SD_RES, SDRig } from './SDRig';

export type SDView = SDRig | ImageRig;

export function createSDView(scene: Phaser.Scene, def: OperatorDef, addToScene = true): SDView {
  const img = sdImageFor(scene, def.id);
  return img ? new ImageRig(scene, def.id, img, def.cls, addToScene) : new SDRig(scene, `sd-${def.id}`, sdSpecFor(def), addToScene);
}

export interface Portrait {
  key: string;
  /** 텍스처 픽셀 기준 */
  width: number;
  height: number;
  /** 발 위치 (텍스처 픽셀) */
  footX: number;
  footY: number;
  /** 카드용 얼굴 영역 (텍스처 픽셀) */
  face: { x: number; y: number; w: number; h: number };
  /** 그림이 왼쪽을 보는지 */
  flip: boolean;
}

export function sdPortrait(scene: Phaser.Scene, def: OperatorDef): Portrait {
  const img = sdImageFor(scene, def.id);
  if (img) {
    const tex = scene.textures.get(sdImageKey(def.id)).getSourceImage() as HTMLImageElement;
    const W = tex.width;
    const H = tex.height;
    const f = img.face ?? [Math.max(0, img.anchorX - 0.3), 0.02, 0.6, 0.48];
    // 카드 비율(128:156)에 맞춰 얼굴 영역 보정
    let fw = f[2] * W;
    let fh = f[3] * H;
    const ratio = 128 / 156;
    if (fw / fh > ratio) fw = fh * ratio;
    else fh = fw / ratio;
    const cx = (f[0] + f[2] / 2) * W;
    return {
      key: sdImageKey(def.id),
      width: W,
      height: H,
      footX: img.anchorX * W,
      footY: H,
      face: { x: Phaser.Math.Clamp(cx - fw / 2, 0, W - fw), y: f[1] * H, w: fw, h: fh },
      flip: img.facing === 'left',
    };
  }
  const key = bakePortrait(scene, `sd-${def.id}`, sdSpecFor(def));
  return {
    key,
    width: PORTRAIT_SIZE * SD_RES,
    height: PORTRAIT_SIZE * SD_RES,
    footX: PORTRAIT_FOOT[0] * SD_RES,
    footY: PORTRAIT_FOOT[1] * SD_RES,
    face: { x: 70 * SD_RES, y: 14 * SD_RES, w: 124 * SD_RES, h: 152 * SD_RES },
    flip: false,
  };
}
