/**
 * 멤버별 SD 사양.
 *
 * ⚠️ 지금 값은 퍼스널 컬러와 클래스만 보고 정한 "임시 디자인"이다.
 *    캐릭터 사진을 올려주면 그걸 분석해서 이 표를 실제 디자인에 맞게 바꾼다.
 *    (docs/SD_디자인_가이드.md 참고)
 */
import type { OperatorDef } from './types';
import { defaultSpec, type SDSpec } from '../sd/spec';

export const SD_SPECS: Record<string, SDSpec> = {
  // 2026-11-14 사진 기반: 금발 긴 머리(옆으로 넘긴 앞머리, 삐친 머리), 노란 삼각 머리핀, 붉은 눈, 무표정,
  // 검은 정장 재킷 + 흰 셔츠
  jingburger: {
    hair: { color: 0xf3d27a, style: 'long', bangs: 'swept', ahoge: true },
    eyes: { color: 0xe0403a, shape: 'round' },
    mouth: 'neutral',
    outfit: { style: 'suit', main: 0x1d1f26, inner: 0xf4f6fb, accent: 0xf2c94c, bottom: 0x1d1f26 },
    legs: { style: 'tights', color: 0x1a1b20, shoes: 0x15161a },
    weapon: { type: 'sword', color: 0xd8dde3, accent: 0xf2c94c },
    accessories: [{ type: 'hairpin', color: 0xf2c94c }],
  },
  haeruseok: {
    hair: { color: 0x2f3b52, style: 'messy', bangs: 'swept' },
    eyes: { color: 0x4a7bd1, shape: 'sharp' },
    mouth: 'neutral',
    outfit: { style: 'jacket', main: 0x2d3e63, inner: 0xe9eef5, accent: 0x4a7bd1, bottom: 0x1e2433 },
    legs: { style: 'pants', color: 0, shoes: 0x14161a },
    weapon: { type: 'sword', color: 0xcfd8e3, accent: 0x4a7bd1 },
  },
  roentgenium: {
    hair: { color: 0xb8c0c8, style: 'short', bangs: 'split' },
    eyes: { color: 0x58d1c9, shape: 'sharp' },
    mouth: 'neutral',
    outfit: { style: 'armor', main: 0x6f7c88, inner: 0xd8dee4, accent: 0x58d1c9, bottom: 0x3a424b },
    legs: { style: 'pants', color: 0, shoes: 0x2a2f35 },
    weapon: { type: 'shield', color: 0x8d99a5, accent: 0x58d1c9 },
    accessories: [{ type: 'glasses', color: 0x2a2f35 }],
  },
  deoksu: {
    hair: { color: 0xe6e6e6, style: 'short', bangs: 'split' },
    eyes: { color: 0x6b5440, shape: 'sleepy' },
    mouth: 'smile',
    outfit: { style: 'suit', main: 0x8a6a48, inner: 0xf3efe6, accent: 0x7a2e2e, bottom: 0x5b4632 },
    legs: { style: 'pants', color: 0, shoes: 0x2d221a },
    weapon: { type: 'shield', color: 0xa07850, accent: 0xe6c86e },
    accessories: [
      { type: 'glasses', color: 0x3a2a1a },
      { type: 'beret', color: 0x5b4632 },
    ],
  },
  viichan: {
    hair: { color: 0x8bc34a, style: 'sidetail', bangs: 'swept', ahoge: true },
    eyes: { color: 0x5f9e2f, shape: 'round' },
    mouth: 'cat',
    outfit: { style: 'hoodie', main: 0x3b4a2a, inner: 0xffffff, accent: 0x8bc34a, bottom: 0x22281b },
    legs: { style: 'socks', color: 0x22281b, shoes: 0x1a1d16 },
    weapon: { type: 'crossbow', color: 0x9aa5ae, accent: 0x8bc34a },
    accessories: [{ type: 'hairpin', color: 0xfff176 }],
  },
  kalikali: {
    hair: { color: 0xc0504d, style: 'long', bangs: 'swept' },
    eyes: { color: 0xffb74d, shape: 'sharp' },
    mouth: 'smile',
    outfit: { style: 'coat', main: 0x5a2b2a, inner: 0xe8d9c6, accent: 0xd4a24c, bottom: 0x2e1a19 },
    legs: { style: 'tights', color: 0x1e1616, shoes: 0x3a2418 },
    weapon: { type: 'gun', color: 0x8a8f96, accent: 0xd4a24c },
    accessories: [{ type: 'beret', color: 0x3a1c1b }],
  },
  lilpa: {
    hair: { color: 0x2e3a87, style: 'long', bangs: 'straight' },
    eyes: { color: 0x7aa7ff, shape: 'round' },
    mouth: 'open',
    outfit: { style: 'dress', main: 0x24306e, inner: 0xe8ecff, accent: 0x7aa7ff, bottom: 0x24306e },
    legs: { style: 'tights', color: 0x161a33, shoes: 0x12142a },
    weapon: { type: 'mic', color: 0xd9dee8, accent: 0x7aa7ff },
    accessories: [{ type: 'ribbon', color: 0x7aa7ff }],
  },
  // 2026-11-13 사진 2장 기반: 은발(라벤더 광택), 한쪽 눈을 덮는 옆으로 넘긴 앞머리, 삐친 머리,
  // 반쯤 감은 보라색 눈, 흰 터틀넥 + 검은 재킷, 보라 주름치마, 갈색 타이츠, 별 펜던트 목걸이
  ine: {
    hair: { color: 0xe4e1ee, style: 'long', bangs: 'swept', ahoge: true },
    eyes: { color: 0xc04ae0, shape: 'round' },
    mouth: 'smile',
    outfit: { style: 'jacket', main: 0x1f2026, inner: 0xf3f1ec, accent: 0x9b6fd6, bottom: 0x4a3c8f, turtleneck: true },
    legs: { style: 'tights', color: 0x3a2826, shoes: 0x1c1a1f },
    weapon: { type: 'staff', color: 0xe8e4f4, accent: 0xb07cff },
    accessories: [{ type: 'necklace', color: 0x4f6bff }],
  },
  dopamine: {
    hair: { color: 0x3dbe9f, style: 'bob', bangs: 'straight' },
    eyes: { color: 0x2a8f78, shape: 'round' },
    mouth: 'smile',
    outfit: { style: 'coat', main: 0xf2f5f7, inner: 0x3dbe9f, accent: 0xe05b78, bottom: 0x2b3a3f },
    legs: { style: 'tights', color: 0x2b3a3f, shoes: 0x1f2a2e },
    weapon: { type: 'syringe', color: 0xb8c4cc, accent: 0xe05b78 },
    accessories: [{ type: 'glasses', color: 0x2b3a3f }],
  },
};

export function sdSpecFor(def: OperatorDef): SDSpec {
  return SD_SPECS[def.id] ?? defaultSpec(def.color, def.cls, def.id);
}
