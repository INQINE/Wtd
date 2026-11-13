/**
 * 전투 시뮬레이션 (순수 로직, Phaser 의존 없음).
 * 화면(BattleScene)은 이 상태를 읽어서 그리기만 한다.
 * 좌표 단위는 "타일". 타일 (r, c)의 중심은 (x = c + 0.5, y = r + 0.5).
 */
import type { Dir, EnemyDef, OperatorDef, StageDef } from '../data/types';
import { rangeTiles } from '../data/ranges';
import { calcDamage, retreatRefund } from './combat';
import { buildRoute, isDeployable, parseMap, tileAt, type Grid, type Point } from './grid';

export interface OpUnit {
  uid: number;
  def: OperatorDef;
  row: number;
  col: number;
  dir: Dir;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atkCd: number;
  /** 저지 중인 적 uid */
  blocking: number[];
  /** "r,c" 문자열 집합 */
  rangeSet: Set<string>;
  alive: boolean;
}

export interface EnemyUnit {
  uid: number;
  def: EnemyDef;
  x: number;
  y: number;
  path: Point[];
  /** 남은 경로 길이 계산용: suffix[i] = path[i]부터 끝까지 길이 */
  suffix: number[];
  next: number;
  hp: number;
  maxHp: number;
  atkCd: number;
  blockedBy: number | null;
  alive: boolean;
  /** 방어점까지 남은 거리 */
  distLeft: number;
}

export type BattleEvent =
  | {
      type: 'hit';
      side: 'op' | 'enemy';
      srcUid: number;
      tgtUid: number;
      damageType: 'physical' | 'arts' | 'true';
      amount: number;
      from: Point;
      to: Point;
      ranged: boolean;
      splash?: number;
    }
  | { type: 'heal'; srcUid: number; tgtUid: number; amount: number; from: Point; to: Point }
  | { type: 'enemyDie'; uid: number; at: Point }
  | { type: 'opDie'; uid: number; at: Point }
  | { type: 'leak'; uid: number; at: Point; life: number }
  | { type: 'spawn'; uid: number }
  | { type: 'end'; result: 'won' | 'lost' };

export type DeployError = 'running' | 'deployed' | 'cooldown' | 'cost' | 'limit' | 'tile' | 'occupied';

interface SpawnItem {
  time: number;
  enemy: string;
  route: string;
}

const STEP = 1 / 30;
const key = (r: number, c: number) => `${r},${c}`;

export class Battle {
  readonly grid: Grid;
  readonly routes: Record<string, Point[]>;
  time = 0;
  cost: number;
  /** 다음 코스트까지 진행도 (0~1) */
  costProgress = 0;
  life: number;
  readonly maxLife: number;
  ops: OpUnit[] = [];
  enemies: EnemyUnit[] = [];
  /** 멤버 id → 남은 재배치 대기시간 */
  cooldowns: Record<string, number> = {};
  state: 'running' | 'won' | 'lost' = 'running';
  readonly totalEnemies: number;
  killed = 0;
  leaked = 0;

  private uidSeq = 1;
  private spawnQueue: SpawnItem[];
  private events: BattleEvent[] = [];
  private acc = 0;

  constructor(
    readonly stage: StageDef,
    private readonly opDefs: Record<string, OperatorDef>,
    private readonly enemyDefs: Record<string, EnemyDef>,
  ) {
    this.grid = parseMap(stage.map);
    this.routes = Object.fromEntries(Object.entries(stage.routes).map(([k, r]) => [k, buildRoute(this.grid, r)]));
    this.cost = stage.initialCost;
    this.life = stage.life;
    this.maxLife = stage.life;
    this.spawnQueue = [];
    for (const w of stage.waves) {
      if (!enemyDefs[w.enemy]) throw new Error(`알 수 없는 적: ${w.enemy}`);
      if (!this.routes[w.route]) throw new Error(`알 수 없는 경로: ${w.route}`);
      for (let i = 0; i < w.count; i++) this.spawnQueue.push({ time: w.time + i * w.interval, enemy: w.enemy, route: w.route });
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);
    this.totalEnemies = this.spawnQueue.length;
  }

  // ───────────────────────── 조회 ─────────────────────────

  get deployedCount(): number {
    return this.ops.length;
  }

  get spawnedCount(): number {
    return this.totalEnemies - this.spawnQueue.length;
  }

  isDeployed(opId: string): boolean {
    return this.ops.some((o) => o.def.id === opId);
  }

  opAt(r: number, c: number): OpUnit | undefined {
    return this.ops.find((o) => o.row === r && o.col === c);
  }

  opByUid(uid: number): OpUnit | undefined {
    return this.ops.find((o) => o.uid === uid);
  }

  enemyByUid(uid: number): EnemyUnit | undefined {
    return this.enemies.find((e) => e.uid === uid);
  }

  /** 지금 이 멤버를 덱에서 꺼낼 수 있는지 (타일 무관) */
  cardError(opId: string): DeployError | null {
    const def = this.opDefs[opId];
    if (this.state !== 'running') return 'running';
    if (this.isDeployed(opId)) return 'deployed';
    if ((this.cooldowns[opId] ?? 0) > 0) return 'cooldown';
    if (this.cost < def.cost) return 'cost';
    if (this.ops.length >= this.stage.maxDeploy) return 'limit';
    return null;
  }

  canPlaceOn(opId: string, r: number, c: number): boolean {
    const def = this.opDefs[opId];
    return isDeployable(tileAt(this.grid, r, c), def.position) && !this.opAt(r, c);
  }

  deployError(opId: string, r: number, c: number): DeployError | null {
    const e = this.cardError(opId);
    if (e) return e;
    if (!isDeployable(tileAt(this.grid, r, c), this.opDefs[opId].position)) return 'tile';
    if (this.opAt(r, c)) return 'occupied';
    return null;
  }

  // ───────────────────────── 조작 ─────────────────────────

  deploy(opId: string, r: number, c: number, dir: Dir): OpUnit | null {
    if (this.deployError(opId, r, c)) return null;
    const def = this.opDefs[opId];
    this.cost -= def.cost;
    const op: OpUnit = {
      uid: this.uidSeq++,
      def,
      row: r,
      col: c,
      dir,
      x: c + 0.5,
      y: r + 0.5,
      hp: def.hp,
      maxHp: def.hp,
      atkCd: 0,
      blocking: [],
      rangeSet: new Set(rangeTiles(def.range, r, c, dir).map(([rr, cc]) => key(rr, cc))),
      alive: true,
    };
    this.ops.push(op);
    return op;
  }

  retreat(uid: number): boolean {
    const op = this.opByUid(uid);
    if (!op || this.state !== 'running') return false;
    this.cost = Math.min(this.stage.maxCost, this.cost + retreatRefund(op.def.cost));
    this.removeOp(op);
    return true;
  }

  drainEvents(): BattleEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /** dt초만큼 진행 (내부는 고정 스텝) */
  update(dt: number): void {
    this.acc += Math.min(dt, 0.5);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (this.state !== 'running') return;
      this.step(STEP);
    }
  }

  // ───────────────────────── 내부 ─────────────────────────

  private step(dt: number): void {
    this.time += dt;

    // 코스트 회복
    if (this.cost < this.stage.maxCost) {
      this.costProgress += dt * this.stage.costRate;
      while (this.costProgress >= 1) {
        this.costProgress -= 1;
        this.cost = Math.min(this.stage.maxCost, this.cost + 1);
      }
    } else {
      this.costProgress = 0;
    }

    // 재배치 대기
    for (const id of Object.keys(this.cooldowns)) {
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }

    // 적 등장
    while (this.spawnQueue.length && this.spawnQueue[0].time <= this.time) {
      this.spawn(this.spawnQueue.shift()!);
    }

    this.moveEnemies(dt);
    this.enemiesAttack(dt);
    this.opsAct(dt);
    this.cleanup();

    if (this.life <= 0) {
      this.state = 'lost';
      this.events.push({ type: 'end', result: 'lost' });
    } else if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.state = 'won';
      this.events.push({ type: 'end', result: 'won' });
    }
  }

  private spawn(item: SpawnItem): void {
    const def = this.enemyDefs[item.enemy];
    const path = this.routes[item.route];
    const suffix = new Array(path.length).fill(0);
    for (let i = path.length - 2; i >= 0; i--) {
      suffix[i] = suffix[i + 1] + Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    }
    const e: EnemyUnit = {
      uid: this.uidSeq++,
      def,
      x: path[0].x,
      y: path[0].y,
      path,
      suffix,
      next: 1,
      hp: def.hp,
      maxHp: def.hp,
      atkCd: def.atkInterval * 0.5,
      blockedBy: null,
      alive: true,
      distLeft: suffix[0],
    };
    this.enemies.push(e);
    this.events.push({ type: 'spawn', uid: e.uid });
  }

  private blockLoad(op: OpUnit): number {
    let load = 0;
    for (const uid of op.blocking) load += this.enemyByUid(uid)?.def.weight ?? 1;
    return load;
  }

  private moveEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;

      // 저지 판정: 적 중심이 근접 멤버 칸 안에 들어오면 저지
      if (e.blockedBy === null && !e.def.air) {
        for (const op of this.ops) {
          if (op.def.block <= 0) continue;
          if (Math.abs(e.x - op.x) < 0.5 && Math.abs(e.y - op.y) < 0.5) {
            if (this.blockLoad(op) + (e.def.weight ?? 1) <= op.def.block) {
              e.blockedBy = op.uid;
              op.blocking.push(e.uid);
              break;
            }
          }
        }
      }
      if (e.blockedBy !== null) continue;

      let move = e.def.speed * dt;
      while (move > 0 && e.next < e.path.length) {
        const t = e.path[e.next];
        const dx = t.x - e.x;
        const dy = t.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= move) {
          e.x = t.x;
          e.y = t.y;
          e.next++;
          move -= d;
        } else {
          e.x += (dx / d) * move;
          e.y += (dy / d) * move;
          move = 0;
        }
      }
      if (e.next >= e.path.length) {
        // 방어점 도달
        e.alive = false;
        this.life = Math.max(0, this.life - e.def.lifeDamage);
        this.leaked++;
        this.events.push({ type: 'leak', uid: e.uid, at: { x: e.x, y: e.y }, life: this.life });
        continue;
      }
      const t = e.path[e.next];
      e.distLeft = Math.hypot(t.x - e.x, t.y - e.y) + e.suffix[e.next];
    }
  }

  private enemiesAttack(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive || e.def.atk <= 0) continue;
      e.atkCd -= dt;
      if (e.atkCd > 0) continue;

      let target: OpUnit | undefined;
      if (e.blockedBy !== null) {
        target = this.opByUid(e.blockedBy);
      } else if (e.def.range > 0) {
        let best = Infinity;
        for (const op of this.ops) {
          const d = Math.hypot(op.x - e.x, op.y - e.y);
          if (d <= e.def.range && d < best) {
            best = d;
            target = op;
          }
        }
      }
      if (!target) {
        e.atkCd = 0;
        continue;
      }
      e.atkCd = e.def.atkInterval;
      const dmgType = e.def.damageType === 'heal' ? 'physical' : e.def.damageType;
      const amount = Math.round(calcDamage(e.def.atk, dmgType, target.def.def, target.def.res));
      target.hp -= amount;
      this.events.push({
        type: 'hit',
        side: 'enemy',
        srcUid: e.uid,
        tgtUid: target.uid,
        damageType: dmgType,
        amount,
        from: { x: e.x, y: e.y },
        to: { x: target.x, y: target.y },
        ranged: e.blockedBy === null,
      });
    }
  }

  private inRange(op: OpUnit, x: number, y: number): boolean {
    return op.rangeSet.has(key(Math.floor(y), Math.floor(x)));
  }

  private opsAct(dt: number): void {
    for (const op of this.ops) {
      if (!op.alive) continue;
      op.atkCd -= dt;
      if (op.atkCd > 0) continue;
      const n = op.def.targets ?? 1;
      const from = { x: op.x, y: op.y };

      if (op.def.damageType === 'heal') {
        const hurt = this.ops
          .filter((o) => o.alive && o.hp < o.maxHp && this.inRange(op, o.x, o.y))
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
          .slice(0, n);
        if (!hurt.length) {
          op.atkCd = 0;
          continue;
        }
        op.atkCd = op.def.atkInterval;
        for (const t of hurt) {
          const amount = Math.min(op.def.atk, t.maxHp - t.hp);
          t.hp += amount;
          this.events.push({ type: 'heal', srcUid: op.uid, tgtUid: t.uid, amount: Math.round(amount), from, to: { x: t.x, y: t.y } });
        }
        continue;
      }

      const melee = op.def.position === 'ground';
      const candidates = this.enemies.filter((e) => e.alive && !(melee && e.def.air) && this.inRange(op, e.x, e.y));
      if (!candidates.length) {
        op.atkCd = 0;
        continue;
      }
      candidates.sort((a, b) => {
        if (op.def.airPriority) {
          const air = Number(!!b.def.air) - Number(!!a.def.air);
          if (air) return air;
        }
        const blk = Number(b.blockedBy === op.uid) - Number(a.blockedBy === op.uid);
        if (blk) return blk;
        return a.distLeft - b.distLeft;
      });
      op.atkCd = op.def.atkInterval;
      const dmgType = op.def.damageType as 'physical' | 'arts' | 'true';
      for (const t of candidates.slice(0, n)) {
        const victims = op.def.splash
          ? this.enemies.filter((e) => e.alive && !e.def.air && Math.hypot(e.x - t.x, e.y - t.y) <= op.def.splash!)
          : [t];
        if (!victims.includes(t)) victims.push(t);
        for (const v of victims) {
          const amount = Math.round(calcDamage(op.def.atk, dmgType, v.def.def, v.def.res));
          v.hp -= amount;
          this.events.push({
            type: 'hit',
            side: 'op',
            srcUid: op.uid,
            tgtUid: v.uid,
            damageType: dmgType,
            amount,
            from,
            to: { x: v.x, y: v.y },
            ranged: !melee,
            splash: v === t ? op.def.splash : undefined,
          });
        }
      }
    }
  }

  private cleanup(): void {
    for (const e of this.enemies) {
      if (e.alive && e.hp <= 0) {
        e.alive = false;
        this.killed++;
        this.events.push({ type: 'enemyDie', uid: e.uid, at: { x: e.x, y: e.y } });
      }
    }
    for (const e of this.enemies) {
      if (!e.alive && e.blockedBy !== null) {
        const op = this.opByUid(e.blockedBy);
        if (op) op.blocking = op.blocking.filter((u) => u !== e.uid);
        e.blockedBy = null;
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    for (const op of [...this.ops]) {
      if (op.hp <= 0) {
        this.events.push({ type: 'opDie', uid: op.uid, at: { x: op.x, y: op.y } });
        this.removeOp(op);
      }
    }
  }

  private removeOp(op: OpUnit): void {
    op.alive = false;
    for (const uid of op.blocking) {
      const e = this.enemyByUid(uid);
      if (e) e.blockedBy = null;
    }
    op.blocking = [];
    this.ops = this.ops.filter((o) => o !== op);
    this.cooldowns[op.def.id] = op.def.redeploy;
  }
}
