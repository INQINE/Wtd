import type { StageDef } from './types';

export const STAGES: StageDef[] = [
  {
    id: '0-1',
    name: '고멤 사무실 습격',
    map: [
      '#hhhh#hhhh#',
      'R....h....#',
      '#h##.h.##h#',
      '#h##......B',
      '#h##.h.##h#',
      'R....h....#',
      '#hhhh#hhhh#',
    ],
    initialCost: 10,
    maxCost: 99,
    costRate: 1,
    maxDeploy: 8,
    life: 3,
    routes: {
      top: { start: [1, 0], end: [3, 10] },
      bottom: { start: [5, 0], end: [3, 10] },
      airTop: { start: [1, 0], end: [3, 10], air: true },
      airBottom: { start: [5, 0], end: [3, 10], air: true },
    },
    waves: [
      { time: 4, enemy: 'wakdu_small', count: 4, interval: 1.6, route: 'top' },
      { time: 12, enemy: 'wakdu_small', count: 4, interval: 1.6, route: 'bottom' },
      { time: 22, enemy: 'wakdu_soldier', count: 3, interval: 3, route: 'top' },
      { time: 28, enemy: 'wakdu_soldier', count: 3, interval: 3, route: 'bottom' },
      { time: 40, enemy: 'wakdu_archer', count: 2, interval: 3, route: 'top' },
      { time: 43, enemy: 'wakdu_archer', count: 2, interval: 3, route: 'bottom' },
      { time: 52, enemy: 'wakdu_wing', count: 3, interval: 2.5, route: 'airTop' },
      { time: 62, enemy: 'wakdu_small', count: 6, interval: 0.9, route: 'top' },
      { time: 64, enemy: 'wakdu_soldier', count: 2, interval: 3, route: 'bottom' },
      { time: 78, enemy: 'wakdu_armored', count: 1, interval: 1, route: 'top' },
      { time: 84, enemy: 'wakdu_armored', count: 1, interval: 1, route: 'bottom' },
      { time: 95, enemy: 'wakdu_wing', count: 2, interval: 2.5, route: 'airTop' },
      { time: 97, enemy: 'wakdu_archer', count: 2, interval: 3, route: 'top' },
      { time: 99, enemy: 'wakdu_soldier', count: 3, interval: 2.5, route: 'bottom' },
      { time: 112, enemy: 'wakdu_armored', count: 2, interval: 6, route: 'top' },
      { time: 114, enemy: 'wakdu_small', count: 6, interval: 1, route: 'bottom' },
    ],
    deck: ['jingburger', 'haeruseok', 'roentgenium', 'deoksu', 'viichan', 'kalikali', 'lilpa', 'ine', 'dopamine'],
  },
];

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
