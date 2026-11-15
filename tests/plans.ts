import type { Dir } from '../src/data/types';

export type Plan = [string, number, number, Dir][];

/** 스테이지별 "정석 배치" (스킬은 쓰지 않음). 밸런스 테스트용 */
export const PLANS: Record<string, Plan> = {
  '1-1': [
    ['kimchimandu', 3, 5, 'up'],
    ['roentgenium', 3, 7, 'left'],
    ['viichan', 4, 6, 'up'],
    ['ine', 4, 8, 'up'],
    ['jingburger', 3, 6, 'left'],
    ['lilpa', 2, 7, 'down'],
    ['haeruseok', 2, 9, 'down'],
  ],
  '1-2': [
    ['kimchimandu', 2, 7, 'left'],
    ['viichan', 1, 9, 'left'],
    ['sirianrain', 3, 9, 'left'],
    ['roentgenium', 2, 8, 'left'],
    ['ine', 2, 5, 'right'],
    ['dandapbeolle', 0, 7, 'down'],
    ['kriz', 4, 7, 'up'],
    ['jingburger', 2, 6, 'left'],
  ],
  '1-3': [
    ['kimchimandu', 3, 6, 'right'],
    ['lilpa', 2, 5, 'down'],
    ['roentgenium', 3, 4, 'right'],
    ['kwonmin', 4, 5, 'up'],
    ['ine', 4, 4, 'up'],
    ['jururu', 2, 6, 'down'],
    ['susemi', 4, 6, 'up'],
    ['deoksu', 3, 3, 'right'],
  ],
  '1-4': [
    ['kimchimandu', 1, 8, 'left'],
    ['kwakchunsik', 5, 8, 'left'],
    ['viichan', 0, 7, 'down'],
    ['sirianrain', 6, 7, 'up'],
    ['ine', 2, 9, 'left'],
    ['dopamine', 4, 9, 'left'],
    ['roentgenium', 1, 7, 'left'],
    ['deoksu', 5, 7, 'left'],
    ['lilpa', 3, 5, 'right'],
  ],
  '1-5': [
    ['kimchimandu', 1, 11, 'left'],
    ['roentgenium', 3, 11, 'up'],
    ['viichan', 2, 9, 'right'],
    ['ine', 4, 9, 'right'],
    ['lilpa', 2, 8, 'right'],
    ['kwonmin', 4, 8, 'right'],
    ['deoksu', 5, 11, 'left'],
    ['jururu', 6, 10, 'up'],
    ['dopamine', 0, 10, 'down'],
  ],
};
