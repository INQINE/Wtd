/** 멤버 하나의 SD 표시 객체를 만든다: 가져온 이미지가 있으면 ImageRig, 없으면 코드로 그린 SDRig */
import Phaser from 'phaser';
import type { OperatorDef } from '../data/types';
import { sdSpecFor } from '../data/sdSpecs';
import { ImageRig } from './ImageRig';
import { artFor, sdImageFor, sdImageKey } from './registry';
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

export interface CardPortrait {
  key: string;
  /** 텍스처 픽셀 기준 자르기 영역 (카드 비율과 같음) */
  crop: { x: number; y: number; w: number; h: number };
  flip: boolean;
  /** 일반 캐릭터 그림인지 (아니면 SD로 대신) */
  isArt: boolean;
}

/**
 * 편성 카드용 세로 초상: 일반 캐릭터 그림을 얼굴 중심으로 자른다. 없으면 SD 초상으로 대신.
 * aspect = 너비 / 높이
 */
export function cardPortrait(scene: Phaser.Scene, def: OperatorDef, aspect: number): CardPortrait {
  const art = artFor(scene, def.id);
  if (art) {
    const src = scene.textures.get(art.key).getSourceImage() as HTMLImageElement;
    const W = src.width;
    const H = src.height;
    const [fx, fy, showH] = art.card ?? [art.focusX ?? 0.5, 0.2, 0.62];
    let h = H * showH;
    let w = h * aspect;
    if (w > W) {
      w = W;
      h = w / aspect;
    }
    const cx = (art.facing === 'left' ? 1 - fx : fx) * W;
    const x = Phaser.Math.Clamp(cx - w / 2, 0, W - w);
    // 얼굴이 위쪽 1/4 지점에 오도록
    const y = Phaser.Math.Clamp(fy * H - h * 0.25, 0, H - h);
    return { key: art.key, crop: { x, y, w, h }, flip: art.facing === 'left', isArt: true };
  }
  const p = sdPortrait(scene, def);
  // SD: 전신이 카드 안에 들어오게
  const h = p.footY * 0.98;
  const w = Math.min(p.width, h * aspect);
  const x = Phaser.Math.Clamp(p.footX - w / 2 + (p.flip ? -1 : 1) * w * 0.04, 0, p.width - w);
  const y = Math.max(0, p.footY - h);
  return { key: p.key, crop: { x, y, w, h: Math.min(h, p.height - y) }, flip: p.flip, isArt: false };
}
