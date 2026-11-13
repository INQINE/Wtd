import { describe, expect, it } from 'vitest';
import { calcDamage, retreatRefund } from '../src/battle/combat';
import { buildRoute, parseMap } from '../src/battle/grid';
import { Battle } from '../src/battle/sim';
import { ENEMY_MAP } from '../src/data/enemies';
import { OPERATOR_MAP } from '../src/data/operators';
import { rangeTiles } from '../src/data/ranges';
import { STAGE_MAP } from '../src/data/stages';
import type { Dir, StageDef } from '../src/data/types';

describe('데미지 공식', () => {
  it('물리: 공격력 - 방어력, 최소 5%', () => {
    expect(calcDamage(600, 'physical', 100, 0)).toBe(500);
    expect(calcDamage(600, 'physical', 1000, 0)).toBe(30);
  });
  it('마법: 저항 비율 감소, 최소 5%', () => {
    expect(calcDamage(500, 'arts', 999, 20)).toBe(400);
    expect(calcDamage(500, 'arts', 0, 100)).toBe(25);
  });
  it('트루 피해는 방어 무시', () => {
    expect(calcDamage(300, 'true', 999, 99)).toBe(300);
  });
  it('퇴각 시 코스트 절반 반환 (내림)', () => {
    expect(retreatRefund(17)).toBe(8);
  });
});

describe('공격 범위 회전', () => {
  it('근접 범위는 바라보는 방향 1칸', () => {
    expect(rangeTiles('melee', 3, 3, 'right')).toEqual([[3, 3], [3, 4]]);
    expect(rangeTiles('melee', 3, 3, 'left')).toEqual([[3, 3], [3, 2]]);
    expect(rangeTiles('melee', 3, 3, 'up')).toEqual([[3, 3], [2, 3]]);
    expect(rangeTiles('melee', 3, 3, 'down')).toEqual([[3, 3], [4, 3]]);
  });
  it('회전해도 칸 수는 같다', () => {
    for (const d of ['right', 'down', 'left', 'up'] as Dir[]) {
      expect(new Set(rangeTiles('caster', 5, 5, d).map(String)).size).toBe(10);
    }
  });
});

describe('맵 & 경로', () => {
  const stage = STAGE_MAP['0-1'];
  const grid = parseMap(stage.map);
  it('모든 경로가 진입점에서 방어점까지 이어진다', () => {
    for (const r of Object.values(stage.routes)) {
      const pts = buildRoute(grid, r);
      expect(pts[0]).toEqual({ x: r.start[1] + 0.5, y: r.start[0] + 0.5 });
      expect(pts[pts.length - 1]).toEqual({ x: r.end[1] + 0.5, y: r.end[0] + 0.5 });
    }
  });
});

/** 짧은 테스트용 스테이지: 직선 복도 */
function corridorStage(waves: StageDef['waves']): StageDef {
  return {
    id: 't',
    name: 'test',
    map: ['hhhhhhh', 'R.....B', 'hhhhhhh'],
    initialCost: 99,
    maxCost: 99,
    costRate: 1,
    maxDeploy: 8,
    life: 3,
    routes: { main: { start: [1, 0], end: [1, 6] } },
    waves,
    deck: Object.keys(OPERATOR_MAP),
  };
}

describe('전투 규칙', () => {
  it('배치하면 코스트가 빠지고, 같은 멤버는 중복 배치 불가', () => {
    const b = new Battle(corridorStage([]), OPERATOR_MAP, ENEMY_MAP);
    expect(b.deploy('roentgenium', 1, 3, 'left')).not.toBeNull();
    expect(b.cost).toBe(99 - 19);
    expect(b.deployError('roentgenium', 1, 2)).toBe('deployed');
    expect(b.deployError('viichan', 1, 2)).toBe('tile'); // 스나이퍼는 지상 불가
    expect(b.deployError('jingburger', 1, 3)).toBe('occupied');
  });

  it('디펜더는 적 3명까지만 저지한다', () => {
    const stage = corridorStage([{ time: 0, enemy: 'wakdu_armored', count: 4, interval: 0.4, route: 'main' }]);
    const b = new Battle(stage, OPERATOR_MAP, ENEMY_MAP);
    const op = b.deploy('roentgenium', 1, 3, 'left')!;
    op.maxHp = op.hp = 1e9; // 죽지 않게
    b.update(0.5);
    for (let i = 0; i < 20 * 30; i++) b.update(1 / 30);
    expect(op.blocking.length).toBe(3);
    expect(b.leaked).toBe(1);
  });

  it('비행 적은 저지되지 않는다', () => {
    const stage = corridorStage([{ time: 0, enemy: 'wakdu_wing', count: 1, interval: 1, route: 'main' }]);
    const b = new Battle(stage, OPERATOR_MAP, ENEMY_MAP);
    b.deploy('roentgenium', 1, 3, 'left');
    for (let i = 0; i < 15 * 30; i++) b.update(1 / 30);
    expect(b.leaked).toBe(1);
  });

  it('퇴각하면 코스트 절반 반환 + 재배치 대기', () => {
    const b = new Battle(corridorStage([]), OPERATOR_MAP, ENEMY_MAP);
    const op = b.deploy('jingburger', 1, 3, 'left')!;
    const before = b.cost;
    b.retreat(op.uid);
    expect(b.cost).toBe(before + 8);
    expect(b.cardError('jingburger')).toBe('cooldown');
  });

  it('메딕은 다친 아군을 회복한다', () => {
    const b = new Battle(corridorStage([]), OPERATOR_MAP, ENEMY_MAP);
    const guard = b.deploy('jingburger', 1, 2, 'right')!;
    b.deploy('dopamine', 0, 1, 'right');
    guard.hp = 100;
    b.update(0.2);
    expect(guard.hp).toBeGreaterThan(100);
  });
});

describe('스테이지 0-1 밸런스 확인', () => {
  const stage = STAGE_MAP['0-1'];

  function run(plan: [string, number, number, Dir][]): Battle {
    const b = new Battle(stage, OPERATOR_MAP, ENEMY_MAP);
    let i = 0;
    for (let t = 0; t < 400 * 30 && b.state === 'running'; t++) {
      while (i < plan.length && b.deployError(plan[i][0], plan[i][1], plan[i][2]) === null) {
        b.deploy(...plan[i]);
        i++;
      }
      b.update(1 / 30);
    }
    return b;
  }

  it('아무것도 안 하면 진다', () => {
    expect(run([]).state).toBe('lost');
  });

  it('정석 배치로 이길 수 있다', () => {
    const b = run([
      ['roentgenium', 3, 5, 'left'],
      ['viichan', 2, 5, 'left'],
      ['ine', 4, 5, 'left'],
      ['jingburger', 1, 4, 'left'],
      ['deoksu', 5, 4, 'left'],
      ['lilpa', 0, 4, 'down'],
      ['kalikali', 6, 4, 'up'],
      ['dopamine', 0, 3, 'down'],
    ]);
    expect(b.state).toBe('won');
    console.log(`0-1 정석 배치 결과: 방송 체력 ${b.life}/${b.maxLife}, 처치 ${b.killed}/${b.totalEnemies}`);
  });
});

describe('스킬', () => {
  function stageWith(waves: StageDef['waves'] = [{ time: 999, enemy: 'wakdu_small', count: 1, interval: 1, route: 'main' }]): StageDef {
    return {
      id: 't',
      name: 'test',
      map: ['hhhhhhh', 'R.....B', 'hhhhhhh'],
      initialCost: 99,
      maxCost: 99,
      costRate: 1,
      maxDeploy: 8,
      life: 3,
      routes: { main: { start: [1, 0], end: [1, 6] } },
      waves,
      deck: [],
    };
  }

  it('자동 회복 SP가 차면 수동 스킬을 쓸 수 있고, 지속 중 공격력이 오른다', () => {
    const b = new Battle(stageWith(), OPERATOR_MAP, ENEMY_MAP);
    const op = b.deploy('jingburger', 1, 3, 'left')!;
    expect(b.skillReady(op)).toBe(false);
    for (let i = 0; i < 21 * 30; i++) b.update(1 / 30);
    expect(b.skillReady(op)).toBe(true);
    expect(b.activateSkill(op.uid)).toBe(true);
    expect(b.opAtk(op)).toBeCloseTo(640 * 1.6);
    expect(b.opTargets(op)).toBe(3);
    for (let i = 0; i < 16 * 30; i++) b.update(1 / 30);
    expect(op.skillTime).toBe(0);
    expect(b.opAtk(op)).toBe(640);
  });

  it('공격 회복형 즉발 스킬은 다음 공격을 강화한다', () => {
    const b = new Battle(stageWith([{ time: 0, enemy: 'wakdu_armored', count: 1, interval: 1, route: 'main' }]), OPERATOR_MAP, ENEMY_MAP);
    const op = b.deploy('haeruseok', 1, 2, 'left')!;
    op.hp = op.maxHp = 1e9;
    const hits: number[] = [];
    for (let i = 0; i < 20 * 30; i++) {
      b.update(1 / 30);
      for (const e of b.drainEvents()) if (e.type === 'hit' && e.side === 'op') hits.push(e.amount);
    }
    // 철갑 왁두(방어 750) 상대로 평타는 최소 피해, 강화타는 큰 피해
    expect(Math.min(...hits)).toBe(Math.round(470 * 0.05));
    expect(Math.max(...hits)).toBe(Math.round(470 * 2.3 - 750));
  });
});
