import { describe, expect, it } from 'vitest';
import { buildRoute, parseMap } from '../src/battle/grid';
import { Battle } from '../src/battle/sim';
import { ENEMY_MAP } from '../src/data/enemies';
import { OPERATOR_MAP } from '../src/data/operators';
import { STAGE_MAP, STAGES } from '../src/data/stages';
import { PLANS, type Plan } from './plans';

function run(stageId: string, plan: Plan): Battle {
  const b = new Battle(STAGE_MAP[stageId], OPERATOR_MAP, ENEMY_MAP);
  let i = 0;
  for (let t = 0; t < 600 * 30 && b.state === 'running'; t++) {
    while (i < plan.length && b.deployError(plan[i][0], plan[i][1], plan[i][2]) === null) {
      b.deploy(...plan[i]);
      i++;
    }
    b.update(1 / 30);
  }
  return b;
}

describe('스테이지 데이터', () => {
  for (const st of STAGES) {
    it(`${st.id}: 맵·경로·웨이브가 올바르다`, () => {
      const grid = parseMap(st.map);
      for (const r of Object.values(st.routes)) expect(buildRoute(grid, r).length).toBeGreaterThan(1);
      for (const w of st.waves) {
        expect(ENEMY_MAP[w.enemy], w.enemy).toBeTruthy();
        expect(st.routes[w.route], w.route).toBeTruthy();
      }
    });
  }
});

describe('스테이지 밸런스 (스킬 없이)', () => {
  for (const [id, plan] of Object.entries(PLANS)) {
    it(`${id}: 아무것도 안 하면 지고, 정석 배치면 이긴다`, () => {
      expect(run(id, []).state).toBe('lost');
      const b = run(id, plan);
      expect(b.state).toBe('won');
      expect(b.deployedCount).toBeGreaterThan(0);
    });
  }
});

describe('보스', () => {
  it('흑화 뢴트게늄은 주기적으로 주변 멤버에게 피해를 준다', () => {
    const stage = { ...STAGE_MAP['1-5'], waves: [{ time: 0, enemy: 'shadow_roentgenium', count: 1, interval: 1, route: 'top' }] };
    const b = new Battle(stage, OPERATOR_MAP, ENEMY_MAP);
    b.cost = 99;
    const op = b.deploy('roentgenium', 1, 2, 'left')!;
    op.hp = op.maxHp = 1e6;
    let pulses = 0;
    for (let t = 0; t < 30 * 30; t++) {
      b.update(1 / 30);
      for (const e of b.drainEvents()) if (e.type === 'pulse') pulses++;
    }
    expect(pulses).toBeGreaterThan(0);
    expect(op.hp).toBeLessThan(op.maxHp);
    // 저지 3짜리 디펜더는 보스(무게 3)를 붙잡는다
    expect(op.blocking.length).toBe(1);
  });
});
