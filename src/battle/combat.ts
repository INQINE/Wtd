import type { DamageType } from '../data/types';

/** 최소 피해 비율 (명일방주와 같은 5%) */
export const MIN_DAMAGE_RATIO = 0.05;

/** 기획서 3.4 데미지 공식 */
export function calcDamage(atk: number, type: DamageType, def: number, res: number): number {
  switch (type) {
    case 'physical':
      return Math.max(atk - def, atk * MIN_DAMAGE_RATIO);
    case 'arts':
      return Math.max(atk * (1 - res / 100), atk * MIN_DAMAGE_RATIO);
    case 'true':
      return atk;
    case 'heal':
      return 0;
  }
}

/** 퇴각 시 돌려받는 코스트 */
export function retreatRefund(cost: number): number {
  return Math.floor(cost * 0.5);
}
