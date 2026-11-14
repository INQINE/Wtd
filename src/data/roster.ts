/**
 * 캐릭터 표(docs/기획서.md 5장)의 나머지 멤버 — 임시 데이터.
 * 스탯은 클래스 기본값 × 레어도 배율로 자동 생성하고, 스킬은 클래스 공용 스킬을 쓴다.
 * 클래스·레어도·색은 전부 임시이니 자유롭게 고쳐도 된다.
 */
import type { ClassId, Group, OperatorDef } from './types';

interface ClassTemplate {
  position: 'ground' | 'high';
  hp: number;
  atk: number;
  def: number;
  res: number;
  atkInterval: number;
  block: number;
  cost: number;
  redeploy: number;
  damageType: OperatorDef['damageType'];
  range: string;
  skill: string;
  trait: string;
  extra?: Partial<OperatorDef>;
}

/** 클래스 기본값 (★6 기준) */
const TEMPLATE: Record<ClassId | 'executor', ClassTemplate> = {
  vanguard: {
    position: 'ground', hp: 2050, atk: 520, def: 360, res: 0, atkInterval: 1.0, block: 2, cost: 11, redeploy: 70,
    damageType: 'physical', range: 'melee', skill: 'vg_charge', trait: '적 2명 저지, 스킬로 코스트 획득',
  },
  guard: {
    position: 'ground', hp: 2500, atk: 630, def: 370, res: 0, atkInterval: 1.2, block: 2, cost: 16, redeploy: 70,
    damageType: 'physical', range: 'melee', skill: 'gd_power', trait: '적 2명 저지',
  },
  defender: {
    position: 'ground', hp: 3300, atk: 380, def: 700, res: 10, atkInterval: 1.2, block: 3, cost: 18, redeploy: 70,
    damageType: 'physical', range: 'melee', skill: 'df_wall', trait: '적 3명 저지',
  },
  sniper: {
    position: 'high', hp: 1450, atk: 540, def: 140, res: 0, atkInterval: 1.0, block: 0, cost: 12, redeploy: 70,
    damageType: 'physical', range: 'sniper', skill: 'sn_rapid', trait: '비행 유닛을 우선 공격', extra: { airPriority: true },
  },
  caster: {
    position: 'high', hp: 1500, atk: 700, def: 120, res: 20, atkInterval: 1.6, block: 0, cost: 19, redeploy: 70,
    damageType: 'arts', range: 'caster', skill: 'cs_burst', trait: '마법 피해',
  },
  medic: {
    position: 'high', hp: 1550, atk: 500, def: 120, res: 0, atkInterval: 2.85, block: 0, cost: 16, redeploy: 70,
    damageType: 'heal', range: 'medic', skill: 'md_wide', trait: '아군 1명을 회복',
  },
  supporter: {
    position: 'high', hp: 1500, atk: 480, def: 120, res: 20, atkInterval: 1.9, block: 0, cost: 13, redeploy: 70,
    damageType: 'arts', range: 'supporter', skill: 'sp_bind', trait: '마법 피해, 맞은 적을 잠시 감속',
    extra: { slow: { mul: 0.4, duration: 0.9 } },
  },
  specialist: {
    position: 'ground', hp: 2100, atk: 560, def: 330, res: 0, atkInterval: 1.4, block: 2, cost: 14, redeploy: 40,
    damageType: 'physical', range: 'melee', skill: 'sc_shove', trait: '공격 시 적을 경로 뒤로 밀어냄',
    extra: { knockback: 0.55 },
  },
  /** 스페셜리스트 쾌속형: 재배치가 매우 빠름 */
  executor: {
    position: 'ground', hp: 1600, atk: 500, def: 260, res: 0, atkInterval: 0.93, block: 1, cost: 9, redeploy: 18,
    damageType: 'physical', range: 'melee', skill: 'sc_rush', trait: '재배치 시간이 매우 짧음',
  },
};

const RARITY_MUL: Record<number, number> = { 6: 1, 5: 0.93, 4: 0.86, 3: 0.76 };

interface Entry {
  id: string;
  name: string;
  group: Group;
  rarity: number;
  cls: ClassId;
  /** 스페셜리스트 쾌속형 */
  executor?: boolean;
  color: number;
}

const ENTRIES: Entry[] = [
  // 이세계아이돌
  { id: 'jururu', name: '주르르', group: 'isegye', rarity: 6, cls: 'supporter', color: 0xf48fb1 },
  { id: 'gosegu', name: '고세구', group: 'isegye', rarity: 6, cls: 'specialist', color: 0x4fc3f7 },
  // 고정멤버
  { id: 'bimilsonyeo', name: '비밀소녀', group: 'gomem', rarity: 5, cls: 'specialist', executor: true, color: 0x5c5470 },
  { id: 'pungsin', name: '풍신', group: 'gomem', rarity: 5, cls: 'guard', color: 0x26a69a },
  { id: 'dokgohyeji', name: '독고혜지', group: 'gomem', rarity: 4, cls: 'guard', color: 0xb71c1c },
  { id: 'hikiking', name: '히키킹', group: 'gomem', rarity: 4, cls: 'supporter', color: 0x7e57c2 },
  { id: 'kimchimandu', name: '김치만두번영택사스가', group: 'gomem', rarity: 4, cls: 'vanguard', color: 0xe64a19 },
  { id: 'kwakchunsik', name: '곽춘식', group: 'gomem', rarity: 4, cls: 'vanguard', color: 0x8d6e63 },
  { id: 'kwonmin', name: '권민', group: 'gomem', rarity: 4, cls: 'caster', color: 0x3949ab },
  { id: 'dandapbeolle', name: '단답벌레', group: 'gomem', rarity: 4, cls: 'sniper', color: 0x9ccc65 },
  { id: 'saeutwigim', name: '새우튀김', group: 'gomem', rarity: 3, cls: 'vanguard', color: 0xffa726 },
  // 고멤 아카데미
  { id: 'amadeuschoi', name: '아마데우스최', group: 'academy', rarity: 4, cls: 'supporter', color: 0xd4af37 },
  { id: 'sirianrain', name: '시리안 레인', group: 'academy', rarity: 4, cls: 'sniper', color: 0x4dd0e1 },
  { id: 'ninnin', name: '닌닌', group: 'academy', rarity: 4, cls: 'specialist', executor: true, color: 0x37474f },
  { id: 'bulgom', name: '불곰', group: 'academy', rarity: 4, cls: 'defender', color: 0x6d4c41 },
  { id: 'jinhee', name: '진희', group: 'academy', rarity: 4, cls: 'medic', color: 0xf8bbd0 },
  { id: 'captainsullivan', name: '캡틴 설리반', group: 'academy', rarity: 4, cls: 'guard', color: 0x1565c0 },
  { id: 'gentoo', name: '사랑전도사 젠투', group: 'academy', rarity: 3, cls: 'medic', color: 0xff80ab },
  { id: 'gilbert', name: '철도왕 길버트', group: 'academy', rarity: 4, cls: 'vanguard', color: 0x546e7a },
  { id: 'chorokki', name: '데스해머쵸로키', group: 'academy', rarity: 4, cls: 'guard', color: 0x2e7d32 },
  { id: 'charlotte', name: '성기사 샬롯', group: 'academy', rarity: 4, cls: 'defender', color: 0xfff176 },
  { id: 'menggisan', name: '메카 맹기산', group: 'academy', rarity: 3, cls: 'defender', color: 0x90a4ae },
  { id: 'susemi', name: '수셈이', group: 'academy', rarity: 3, cls: 'caster', color: 0xba68c8 },
  { id: 'mimizzang', name: '미미짱짱세용', group: 'academy', rarity: 3, cls: 'supporter', color: 0xff8a65 },
  { id: 'victory', name: '빅토리', group: 'academy', rarity: 3, cls: 'vanguard', color: 0xffca28 },
  { id: 'kriz', name: '크리즈', group: 'academy', rarity: 3, cls: 'sniper', color: 0x80deea },
  { id: 'butterus', name: '버터우스 3세', group: 'academy', rarity: 3, cls: 'specialist', color: 0xffe082 },
  // 우왁굳 (임시: ★6 가드. 기획서 추천안은 최종 보스 + 클리어 후 합류)
  { id: 'woowakgood', name: '우왁굳', group: 'etc', rarity: 6, cls: 'guard', color: 0x1b5e20 },
];

function build(e: Entry): OperatorDef {
  const t = TEMPLATE[e.executor ? 'executor' : e.cls];
  const m = RARITY_MUL[e.rarity] ?? 0.8;
  const r = (v: number) => Math.round(v * m);
  return {
    id: e.id,
    name: e.name,
    short: e.name[0],
    group: e.group,
    rarity: e.rarity,
    cls: e.cls,
    position: t.position,
    color: e.color,
    cost: Math.max(6, t.cost + (e.rarity - 6)),
    redeploy: t.redeploy,
    block: t.block,
    hp: r(t.hp),
    atk: r(t.atk),
    def: r(t.def),
    res: t.res,
    atkInterval: t.atkInterval,
    damageType: t.damageType,
    range: t.range,
    trait: t.trait,
    skill: t.skill,
    ...t.extra,
  };
}

export const EXTRA_OPERATORS: OperatorDef[] = ENTRIES.map(build);
