/**
 * 편성용 세로 카드 (명일방주 편성 카드 참고).
 *  ┌[클래스]★★★★★★┐
 *  │   일러스트    │
 *  │▰▰▰▰ 노랑 띠   │
 *  │ (COST)  [스킬]│
 *  │        이름   │
 *  └──────────────┘
 * 크기 기준: 176 × 400 (scale로 조절)
 */
import Phaser from 'phaser';
import { CLASS_INFO } from '../../data/operators';
import type { OperatorDef } from '../../data/types';
import { cardPortrait } from '../../sd/factory';
import { textStyle } from '../../ui/theme';
import { RARITY_COLOR } from '../battle/DeckCard';

export const PC_W = 176;
export const PC_H = 400;
const YELLOW = 0xf6c12c;
const INK = 0x15161a;

const CLASS_GLYPH: Record<string, string> = {
  vanguard: '뱅',
  guard: '가',
  defender: '디',
  sniper: '스',
  caster: '캐',
  medic: '메',
  supporter: '서',
  specialist: '특',
};

const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 노랑·검정 사선 줄무늬 띠 + 갈매기(V) 표식 */
function hazardBand(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(YELLOW, 1);
  g.fillPoints([v(x, y), v(x + w, y), v(x + w - h * 0.6, y + h), v(x, y + h)], true);
  g.fillStyle(INK, 0.85);
  for (let sx = x + 6; sx < x + w - h; sx += 14) g.fillPoints([v(sx, y + h), v(sx + 6, y + h), v(sx + 6 + h * 0.6, y), v(sx + h * 0.6, y)], true);
  // 갈매기 표식 (계급장 느낌)
  g.lineStyle(4, 0xffffff, 0.95);
  for (let i = 0; i < 2; i++) {
    const cy = y - 18 - i * 12;
    g.beginPath();
    g.moveTo(x + 10, cy - 8);
    g.lineTo(x + 28, cy + 2);
    g.lineTo(x + 46, cy - 8);
    g.strokePath();
  }
}

export class PortraitCard extends Phaser.GameObjects.Container {
  private frame: Phaser.GameObjects.Graphics;
  private markLayer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, readonly def: OperatorDef | null) {
    super(scene, 0, 0);
    const w = PC_W;
    const h = PC_H;
    const L = -w / 2;
    const T = -h / 2;
    this.frame = scene.add.graphics();
    this.markLayer = scene.add.container(0, 0);
    if (def) this.buildFilled(def, L, T, w, h);
    else this.buildEmpty(L, T, w, h);
    this.add([this.frame, this.markLayer]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    scene.add.existing(this);
  }

  private buildFilled(def: OperatorDef, L: number, T: number, w: number, h: number): void {
    const s = this.scene;
    const bg = s.add.graphics();
    const dark = Phaser.Display.Color.ValueToColor(def.color).darken(45).color;
    bg.fillStyle(0x0d0e11, 1).fillRect(L, T, w, h);
    bg.fillGradientStyle(dark, dark, 0x15161a, 0x15161a, 1).fillRect(L + 3, T + 3, w - 6, h - 6);
    this.add(bg);

    // 일러스트
    const iw = w - 6;
    const ih = h - 6;
    const cp = cardPortrait(s, def, iw / ih);
    const img = s.add.image(0, 0, cp.key).setOrigin(0, 0);
    const k = iw / cp.crop.w;
    img.setScale(k).setCrop(cp.crop.x, cp.crop.y, cp.crop.w, cp.crop.h);
    if (cp.flip) {
      img.setFlipX(true);
      const srcW = img.width;
      img.setPosition(L + 3 - (srcW - cp.crop.x - cp.crop.w) * k, T + 3 - cp.crop.y * k);
    } else {
      img.setPosition(L + 3 - cp.crop.x * k, T + 3 - cp.crop.y * k);
    }
    this.add(img);

    const g = s.add.graphics();
    // 아래쪽 어둡게 (이름 가독성)
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.92, 0.92);
    g.fillRect(L + 3, T + h * 0.55, w - 6, h * 0.45 - 3);
    // 위쪽 띠 (클래스 + 별)
    g.fillStyle(0x000000, 0.55).fillRect(L + 3, T + 3, w - 6, 30);
    g.fillStyle(INK, 1).fillRect(L + 3, T + 3, 34, 34);
    g.lineStyle(2, CLASS_INFO[def.cls].color, 1).strokeRect(L + 5, T + 5, 30, 30);
    // 노란 띠
    hazardBand(g, L + 3, T + h * 0.7, w * 0.62, 16);
    // 코스트 원
    const cx = L + 36;
    const cy = T + h * 0.84;
    g.fillStyle(0x000000, 0.85).fillCircle(cx, cy, 25);
    g.lineStyle(3, 0xffffff, 0.9).strokeCircle(cx, cy, 25);
    // 스킬 아이콘
    const sx = L + 72;
    g.fillStyle(0x23252c, 1).fillRect(sx, cy - 16, 32, 32);
    g.lineStyle(2, RARITY_COLOR[def.rarity] ?? 0xffffff, 1).strokeRect(sx, cy - 16, 32, 32);
    g.fillStyle(RARITY_COLOR[def.rarity] ?? 0xffffff, 1).fillPoints([v(sx + 16, cy - 10), v(sx + 26, cy), v(sx + 16, cy + 10), v(sx + 6, cy)], true);
    this.add(g);

    this.add([
      s.add.text(L + 20, T + 20, CLASS_GLYPH[def.cls], textStyle(18, '#ffffff', 900)).setOrigin(0.5),
      s.add.text(L + w - 8, T + 18, '★'.repeat(def.rarity), textStyle(14, hex(RARITY_COLOR[def.rarity] ?? 0xffffff), 900)).setOrigin(1, 0.5),
      s.add.text(cx, cy - 8, 'COST', textStyle(9, '#c9ccd2', 700)).setOrigin(0.5),
      s.add.text(cx, cy + 7, String(def.cost), textStyle(20, '#ffffff', 900)).setOrigin(0.5),
    ]);
    const name = s.add.text(L + w - 10, T + h - 22, def.name, { ...textStyle(22, '#ffffff', 900), stroke: '#000', strokeThickness: 3 }).setOrigin(1, 0.5);
    if (name.width > w - 20) name.setScale((w - 20) / name.width);
    this.add(name);
    if (!cp.isArt) {
      this.add(s.add.text(L + w - 8, T + 44, 'SD', textStyle(11, '#ffffff', 700)).setOrigin(1, 0.5).setAlpha(0.5));
    }
  }

  private buildEmpty(L: number, T: number, w: number, h: number): void {
    const s = this.scene;
    const g = s.add.graphics();
    g.fillGradientStyle(0xe4e6ea, 0xe4e6ea, 0xc5c9d0, 0xc5c9d0, 1).fillRect(L, T, w, h);
    g.lineStyle(1, 0xffffff, 0.6);
    for (let x = L - h; x < L + w; x += 18) g.lineBetween(Math.max(L, x), x < L ? T + (L - x) : T, Math.min(L + w, x + h), x + h > L + w ? T + (L + w - x) : T + h);
    // 왼쪽 위 탭
    g.fillStyle(0x3a3d44, 1).fillRect(L + 6, T + 6, 26, 26);
    g.fillStyle(0x15161a, 1).fillPoints([v(L + 40, T + 6), v(L + w, T + 6), v(L + w, T + 22), v(L + 56, T + 22)], true);
    // 파란 곡선 장식
    g.lineStyle(3, 0x4fb3e8, 0.8);
    g.beginPath();
    g.arc(L + w + 20, T + h * 0.42, w * 0.55, Math.PI * 0.62, Math.PI * 1.32, false);
    g.strokePath();
    // 아래쪽 검은 사선 띠
    g.fillStyle(0x15161a, 1).fillPoints([v(L, T + h * 0.8), v(L + w, T + h * 0.68), v(L + w, T + h * 0.8), v(L, T + h * 0.92)], true);
    this.add(g);
    this.add([
      s.add.text(0, T + h * 0.42, '+', textStyle(92, '#ffffff', 400)).setOrigin(0.5).setShadow(0, 2, '#00000055', 4),
      s.add.text(0, T + h * 0.8, 'WAK ENTERTAINMENT', textStyle(10, '#ffffff', 700)).setOrigin(0.5).setAngle(-12).setAlpha(0.5).setLetterSpacing(2),
    ]);
  }

  /** 선택 테두리 / 분대 순번 / 비서 표시 */
  setMarks(o: { selected?: boolean; order?: number; secretary?: boolean }): this {
    const w = PC_W;
    const h = PC_H;
    this.frame.clear();
    this.markLayer.removeAll(true);
    if (o.selected) this.frame.lineStyle(5, 0xffffff, 1).strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    if (o.order !== undefined) {
      const dim = this.scene.add.rectangle(0, 0, w, h, 0x000000, 0.35);
      const badge = this.scene.add.rectangle(w / 2 - 22, -h / 2 + 52, 40, 40, YELLOW);
      const n = this.scene.add.text(w / 2 - 22, -h / 2 + 52, String(o.order), textStyle(24, '#15161a', 900)).setOrigin(0.5);
      this.markLayer.add([dim, badge, n]);
    }
    if (o.secretary) {
      const t = this.scene.add.text(-w / 2 + 8, -h / 2 + 44, '비서', textStyle(13, '#15161a', 900)).setBackgroundColor('#f6c12c').setPadding(6, 2);
      this.markLayer.add(t);
    }
    return this;
  }
}
