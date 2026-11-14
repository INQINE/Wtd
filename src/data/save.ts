/**
 * 저장 데이터 (브라우저 localStorage).
 * 분대 편성, 사용 중인 분대, 비서. 저장소를 못 쓰는 환경(시크릿 창 등)에서도 기본값으로 동작한다.
 */
import { OPERATOR_MAP } from './operators';

export const SQUAD_COUNT = 4;
export const SQUAD_SIZE = 12;

export interface SaveData {
  version: 1;
  squads: string[][];
  active: number;
  secretary: string | null;
}

const KEY = 'wtd.save.v1';
/** 처음 시작할 때 분대 1에 들어가는 멤버 */
const DEFAULT_SQUAD = ['jingburger', 'haeruseok', 'roentgenium', 'deoksu', 'viichan', 'kalikali', 'lilpa', 'ine', 'dopamine'];

function defaults(): SaveData {
  return {
    version: 1,
    squads: [DEFAULT_SQUAD.slice(), [], [], []],
    active: 0,
    secretary: null,
  };
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      data = { ...data, ...parsed, version: 1 };
    } else {
      // 예전 버전에서 쓰던 비서 설정 이어받기
      const sec = localStorage.getItem('wtd.secretary');
      if (sec) data.secretary = sec;
    }
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  // 정리: 없는 멤버 제거, 분대 수/크기 맞추기
  data.squads = Array.from({ length: SQUAD_COUNT }, (_, i) =>
    [...new Set((data.squads[i] ?? []).filter((id) => OPERATOR_MAP[id]))].slice(0, SQUAD_SIZE),
  );
  data.active = Math.min(Math.max(0, data.active | 0), SQUAD_COUNT - 1);
  if (data.secretary && !OPERATOR_MAP[data.secretary]) data.secretary = null;
  cache = data;
  return data;
}

export function writeSave(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // 저장 실패해도 이번 실행 동안은 메모리 값 사용
  }
}

/** 전투에 쓸 덱 (사용 중인 분대) */
export function activeSquad(): string[] {
  const s = loadSave();
  return s.squads[s.active];
}
