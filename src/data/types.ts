// 게임 데이터 타입 정의. 기획서 9.2 참고.

export type ClassId =
  | 'vanguard'
  | 'guard'
  | 'defender'
  | 'sniper'
  | 'caster'
  | 'medic'
  | 'supporter'
  | 'specialist';

export type Position = 'ground' | 'high';
export type DamageType = 'physical' | 'arts' | 'true' | 'heal';
export type Dir = 'right' | 'down' | 'left' | 'up';
export type Group = 'isegye' | 'gomem' | 'academy' | 'etc';

export interface OperatorDef {
  id: string;
  name: string;
  /** 임시 그래픽에 표시할 한 글자 */
  short: string;
  group: Group;
  rarity: number;
  cls: ClassId;
  position: Position;
  /** 퍼스널 컬러 (임시 그래픽용) */
  color: number;
  cost: number;
  /** 재배치 대기시간(초) */
  redeploy: number;
  block: number;
  hp: number;
  atk: number;
  def: number;
  /** 마법 저항 (0~100) */
  res: number;
  atkInterval: number;
  damageType: DamageType;
  /** RANGES 키 */
  range: string;
  /** 동시 공격/회복 대상 수 (기본 1) */
  targets?: number;
  /** 범위 피해 반경(타일) */
  splash?: number;
  /** 비행 유닛 우선 공격 */
  airPriority?: boolean;
  trait: string;
}

export type EnemyShape = 'small' | 'circle' | 'square' | 'diamond' | 'triangle';

export interface EnemyDef {
  id: string;
  name: string;
  short: string;
  color: number;
  shape: EnemyShape;
  hp: number;
  atk: number;
  def: number;
  res: number;
  /** 타일/초 */
  speed: number;
  atkInterval: number;
  /** 0 = 근접(저지한 멤버만 공격), >0 = 원거리 사거리(타일) */
  range: number;
  damageType: DamageType;
  air?: boolean;
  /** 방어점 도달 시 깎이는 방송 체력 */
  lifeDamage: number;
  /** 저지 수 소모량 (기본 1) */
  weight?: number;
  desc: string;
}

export type Cell = [row: number, col: number];

export interface RouteDef {
  start: Cell;
  end: Cell;
  /** 거쳐갈 체크포인트 */
  via?: Cell[];
  /** 비행 경로: 벽 무시하고 직선 이동 */
  air?: boolean;
}

export interface WaveDef {
  time: number;
  enemy: string;
  count: number;
  interval: number;
  route: string;
}

export interface StageDef {
  id: string;
  name: string;
  /**
   * 맵 문자 범례
   *  # 벽   . 지상(근접 배치)   _ 길(배치 불가)
   *  h 고지대(원거리 배치)   H 고지대(배치 불가)
   *  R 진입점   B 방어점
   */
  map: string[];
  initialCost: number;
  maxCost: number;
  /** 초당 코스트 회복량 */
  costRate: number;
  maxDeploy: number;
  life: number;
  routes: Record<string, RouteDef>;
  waves: WaveDef[];
  deck: string[];
}
