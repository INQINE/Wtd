import type { Dir } from './types';

/**
 * 공격 범위. [앞쪽 거리, 옆쪽 거리] 오프셋 목록이고, 오른쪽을 바라보는 상태가 기준.
 * 앞쪽 거리 0, 옆쪽 거리 0 = 자기 칸.
 */
export type RangeOffset = [forward: number, lateral: number];

function rect(f0: number, f1: number, l0: number, l1: number): RangeOffset[] {
  const out: RangeOffset[] = [];
  for (let f = f0; f <= f1; f++) for (let l = l0; l <= l1; l++) out.push([f, l]);
  return out;
}

export const RANGES: Record<string, RangeOffset[]> = {
  /** 근접: 자기 칸 + 앞 1칸 */
  melee: [
    [0, 0],
    [1, 0],
  ],
  /** 스나이퍼 기본: 앞 4열 × 3행 */
  sniper: rect(0, 3, -1, 1),
  /** 포격형 스나이퍼: 앞 5열 × 3행 */
  artillery: rect(0, 4, -1, 1),
  /** 캐스터 기본: 앞 3열 × 3행 + 정면 1칸 */
  caster: [...rect(0, 2, -1, 1), [3, 0]],
  /** 메딕 기본: 앞 4열 × 3행 */
  medic: rect(0, 3, -1, 1),
};

const AXES: Record<Dir, { f: [number, number]; l: [number, number] }> = {
  // [dc, dr]
  right: { f: [1, 0], l: [0, 1] },
  down: { f: [0, 1], l: [-1, 0] },
  left: { f: [-1, 0], l: [0, -1] },
  up: { f: [0, -1], l: [1, 0] },
};

/** 범위를 방향에 맞게 돌려서 실제 타일 좌표 목록으로 바꾼다. */
export function rangeTiles(rangeKey: string, row: number, col: number, dir: Dir): [number, number][] {
  const offsets = RANGES[rangeKey];
  if (!offsets) throw new Error(`알 수 없는 범위: ${rangeKey}`);
  const { f, l } = AXES[dir];
  return offsets.map(([fw, lt]) => [row + fw * f[1] + lt * l[1], col + fw * f[0] + lt * l[0]]);
}

export function dirFromVector(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}
