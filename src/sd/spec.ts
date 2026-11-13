/**
 * SD(치비) 캐릭터 사양.
 * 사진/일러스트를 보고 이 값을 채우면, 명일방주식 비율의 SD가 자동으로 그려진다.
 * 자세한 규칙은 docs/SD_디자인_가이드.md 참고.
 */
import type { ClassId } from '../data/types';

export type HairStyle = 'short' | 'messy' | 'bob' | 'long' | 'twintail' | 'ponytail' | 'sidetail';
export type BangStyle = 'straight' | 'swept' | 'split';
export type EyeShape = 'round' | 'sharp' | 'sleepy' | 'smile';
export type MouthShape = 'smile' | 'neutral' | 'open' | 'cat';
export type OutfitStyle = 'hoodie' | 'jacket' | 'uniform' | 'dress' | 'coat' | 'suit' | 'armor';
export type LegStyle = 'tights' | 'bare' | 'pants' | 'socks';
export type WeaponType =
  | 'sword'
  | 'greatsword'
  | 'hammer'
  | 'spear'
  | 'shield'
  | 'crossbow'
  | 'gun'
  | 'bow'
  | 'staff'
  | 'book'
  | 'mic'
  | 'syringe'
  | 'none';
export type AccessoryType =
  | 'cat_ears'
  | 'fox_ears'
  | 'bunny_ears'
  | 'horns'
  | 'halo'
  | 'ribbon'
  | 'hairpin'
  | 'flower'
  | 'headphones'
  | 'glasses'
  | 'beret'
  | 'crown'
  | 'antenna'
  | 'tail'
  | 'wings';

export interface Accessory {
  type: AccessoryType;
  color: number;
}

export interface SDSpec {
  hair: {
    color: number;
    style: HairStyle;
    bangs: BangStyle;
    /** 머리 위 삐친 머리 */
    ahoge?: boolean;
    /** 브릿지/투톤 (앞머리 일부 색) */
    streak?: number;
  };
  eyes: { color: number; shape: EyeShape };
  mouth?: MouthShape;
  skin?: number;
  outfit: {
    style: OutfitStyle;
    /** 상의 메인 색 */
    main: number;
    /** 이너/셔츠 색 */
    inner: number;
    /** 포인트 색 (리본, 줄, 장식) */
    accent: number;
    /** 하의(치마/바지/반바지) 색 */
    bottom: number;
  };
  legs: { style: LegStyle; color: number; shoes: number };
  weapon: { type: WeaponType; color: number; accent?: number };
  accessories?: Accessory[];
}

/** 클래스별 기본 무기 */
export const CLASS_WEAPON: Record<ClassId, WeaponType> = {
  vanguard: 'spear',
  guard: 'sword',
  defender: 'shield',
  sniper: 'crossbow',
  caster: 'staff',
  medic: 'staff',
  supporter: 'book',
  specialist: 'sword',
};

/** 사양이 없는 멤버용 기본값 (퍼스널 컬러 기반) */
export function defaultSpec(color: number, cls: ClassId): SDSpec {
  return {
    hair: { color, style: 'short', bangs: 'swept', ahoge: true },
    eyes: { color, shape: 'round' },
    mouth: 'smile',
    outfit: { style: 'jacket', main: 0x2b2f38, inner: 0xf2f2f2, accent: color, bottom: 0x23262d },
    legs: { style: 'tights', color: 0x22252b, shoes: 0x1a1c20 },
    weapon: { type: CLASS_WEAPON[cls], color: 0xc9d1d9, accent: color },
  };
}
