/**
 * 외부에서 가져온 SD 이미지 목록 (public/assets/sd/manifest.json).
 * 이미지가 있는 멤버는 이미지를, 없는 멤버는 코드로 그린 SD 리그를 쓴다.
 */
import Phaser from 'phaser';

export interface SDImageEntry {
  file: string;
  /** 발 위치 (0~1, 이미지 가로 기준) */
  anchorX: number;
  facing: 'left' | 'right';
  /** 게임 안 크기 배율 */
  scale: number;
  /** 카드용 얼굴 자르기 영역 (0~1 비율) [x, y, w, h] — 없으면 자동 추정 */
  face?: [number, number, number, number];
  /** 무기 끝(지팡이 보석, 총구 등) 위치 (0~1 비율) — 공격 이펙트가 여기서 나감 */
  tip?: [number, number];
  /** 공격 이펙트 색 ("#rrggbb") */
  fxColor?: string;
  /** 공격 동작 스프라이트 시트 (가로 한 줄) */
  attack?: {
    file: string;
    frames: number;
    fps: number;
    frameWidth: number;
    frameHeight: number;
    anchorX: number;
    /** 첫 프레임에서 몸이 차지하는 세로 비율 (대기 그림과 크기 맞추기용) */
    bodyRatio: number;
  };
}

let manifest: Record<string, SDImageEntry> = {};

export const sdImageKey = (id: string) => `sdimg-${id}`;
export const sdAttackKey = (id: string) => `sdimg-${id}-attack`;

/** BootScene preload에서 호출 */
export function queueSDManifest(scene: Phaser.Scene): void {
  scene.load.json('sd-manifest', 'assets/sd/manifest.json');
}

/** manifest를 읽은 뒤 이미지들을 불러온다 */
export function queueSDImages(scene: Phaser.Scene): void {
  manifest = (scene.cache.json.get('sd-manifest') as Record<string, SDImageEntry>) ?? {};
  for (const [id, e] of Object.entries(manifest)) {
    scene.load.image(sdImageKey(id), `assets/sd/${e.file}`);
    if (e.attack) {
      scene.load.spritesheet(sdAttackKey(id), `assets/sd/${e.attack.file}`, {
        frameWidth: e.attack.frameWidth,
        frameHeight: e.attack.frameHeight,
      });
    }
  }
}

export function sdImageFor(scene: Phaser.Scene, id: string): SDImageEntry | null {
  const e = manifest[id];
  return e && scene.textures.exists(sdImageKey(id)) ? e : null;
}
