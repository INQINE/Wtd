/**
 * 편성 화면.
 * 분대 4개 × 최대 12명. 사용 중인 분대가 전투 덱이 된다. 멤버를 골라 비서로 지정할 수도 있다.
 *
 *  ┌ ◀ 편성 ─────────────────── [분대1][분대2][분대3][분대4] ┐
 *  │ [분대 슬롯 6×2]                  │ [선택한 멤버 정보]      │
 *  │ 멤버 목록 (가로 스크롤, 탭 = 넣기/빼기)                     │
 *  └──────────────────────────────── [비우기] [작전 개시] ┘
 */
import Phaser from 'phaser';
import { CLASS_INFO, OPERATOR_MAP, OPERATORS } from '../data/operators';
import { activeSquad, loadSave, SQUAD_COUNT, SQUAD_SIZE, writeSave } from '../data/save';
import { SKILL_MAP } from '../data/skills';
import type { OperatorDef } from '../data/types';
import { sdPortrait } from '../sd/factory';
import { Button } from '../ui/button';
import { textStyle } from '../ui/theme';
import { CARD_H, CARD_W, DeckCard, RARITY_COLOR } from './battle/DeckCard';

const ACCENT = 0xf2c94c;
const ACCENT_S = '#f2c94c';
const SLANT = 18;

export class SquadScene extends Phaser.Scene {
  private u = 1;
  private W = 1920;
  private H = 1080;
  private selected: string | null = null;
  private layer!: Phaser.GameObjects.Container;
  private infoLayer!: Phaser.GameObjects.Container;
  private rosterLayer!: Phaser.GameObjects.Container;
  private rosterScroll = 0;
  private rosterMaxScroll = 0;
  private rosterView = { x: 0, y: 0, w: 0, h: 0 };
  private drag = { active: false, startX: 0, startScroll: 0, moved: 0 };
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('squad');
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.u = this.H / 1080;
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    this.selected = activeSquad()[0] ?? OPERATORS[0].id;

    this.drawBackground();
    this.layer = this.add.container(0, 0);
    this.infoLayer = this.add.container(0, 0);
    this.rosterLayer = this.add.container(0, 0);
    this.createHeader();
    this.createRosterArea();
    this.createButtons();
    this.toast = this.add
      .text(this.W / 2, this.H - 150 * this.u, '', { ...textStyle(Math.round(26 * this.u), '#ffffff', 700), backgroundColor: '#000000cc', padding: { x: 18, y: 8 } })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
    this.render();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  // ───────────────────────── 배경 / 머리말 ─────────────────────────

  private drawBackground(): void {
    const { W, H } = this;
    const g = this.add.graphics();
    g.fillGradientStyle(0x2b3038, 0x1f232a, 0x14161b, 0x0e1014, 1).fillRect(0, 0, W, H);
    g.lineStyle(1, 0xffffff, 0.04);
    for (let x = -H; x < W; x += 56) g.lineBetween(x, H, x + H * 0.6, 0);
    g.fillStyle(ACCENT, 0.9).fillRect(0, H - 6 * this.u, W * 0.3, 6 * this.u);
  }

  private createHeader(): void {
    const u = this.u;
    const back = new Button(this, 60 * u, 50 * u, 84 * u, 60 * u, '◀', () => this.go('lobby'), {
      fill: 0x000000,
      alpha: 0.55,
      stroke: 0x555555,
      fontSize: Math.round(28 * u),
    });
    void back;
    this.add.text(120 * u, 22 * u, '편성', textStyle(Math.round(46 * u), '#ffffff', 900));
    this.add.text(124 * u, 80 * u, 'SQUAD', textStyle(Math.round(16 * u), '#9aa0a6', 700)).setLetterSpacing(3);
  }

  /** 분대 탭 (오른쪽 위) */
  private drawTabs(): void {
    const u = this.u;
    const save = loadSave();
    const tw = 170 * u;
    const th = 58 * u;
    let x = this.W - 40 * u - SQUAD_COUNT * (tw + 8 * u);
    for (let i = 0; i < SQUAD_COUNT; i++) {
      const on = i === save.active;
      const c = this.add.container(x, 22 * u);
      const pts = [new Phaser.Math.Vector2(SLANT * u, 0), new Phaser.Math.Vector2(tw, 0), new Phaser.Math.Vector2(tw - SLANT * u, th), new Phaser.Math.Vector2(0, th)];
      const g = this.add.graphics();
      g.fillStyle(on ? ACCENT : 0x000000, on ? 1 : 0.5).fillPoints(pts, true);
      if (!on) g.lineStyle(1.5, 0xffffff, 0.2).strokePoints(pts, true);
      const ink = on ? '#16181d' : '#ffffff';
      const t = this.add.text(30 * u, th / 2, `분대 ${i + 1}`, textStyle(Math.round(22 * u), ink, 900)).setOrigin(0, 0.5);
      const n = this.add
        .text(tw - 30 * u, th / 2, `${save.squads[i].length}/${SQUAD_SIZE}`, textStyle(Math.round(16 * u), on ? '#16181d' : '#9aa0a6', 700))
        .setOrigin(1, 0.5);
      c.add([g, t, n]);
      c.setSize(tw, th).setInteractive(new Phaser.Geom.Polygon(pts), Phaser.Geom.Polygon.Contains);
      c.on('pointerup', () => {
        save.active = i;
        writeSave();
        this.render();
      });
      this.layer.add(c);
      x += tw + 8 * u;
    }
  }

  // ───────────────────────── 분대 슬롯 ─────────────────────────

  private slotGeom() {
    const u = this.u;
    const s = 1.1 * u;
    const w = CARD_W * s;
    const h = CARD_H * s;
    const gap = 14 * u;
    return { s, w, h, gap, x0: 60 * u, y0: 150 * u };
  }

  private drawSlots(): void {
    const save = loadSave();
    const squad = save.squads[save.active];
    const { s, w, h, gap, x0, y0 } = this.slotGeom();
    const u = this.u;
    this.layer.add(
      this.add
        .text(x0, y0 - 6 * u, `분대 ${save.active + 1}  ·  전투 덱으로 사용 중`, textStyle(Math.round(18 * u), '#c9ccd2', 700))
        .setOrigin(0, 1),
    );
    for (let i = 0; i < SQUAD_SIZE; i++) {
      const cx = x0 + (i % 6) * (w + gap) + w / 2;
      const cy = y0 + 10 * u + Math.floor(i / 6) * (h + gap) + h / 2;
      const id = squad[i];
      if (!id) {
        // 빈 슬롯
        const g = this.add.graphics();
        g.lineStyle(2 * u, 0xffffff, 0.22).strokeRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle(0x000000, 0.25).fillRect(cx - w / 2, cy - h / 2, w, h);
        const plus = this.add.text(cx, cy, '+', textStyle(Math.round(48 * u), '#ffffff', 400)).setOrigin(0.5).setAlpha(0.35);
        this.layer.add([g, plus]);
        continue;
      }
      const def = OPERATOR_MAP[id];
      const card = new DeckCard(this, def).setPosition(cx, cy).setScale(s);
      card.refresh(null, 0);
      card.on('pointerup', () => {
        this.selected = id;
        this.render();
      });
      this.layer.add(card);
      if (id === this.selected) this.layer.add(this.selectFrame(cx, cy, w, h));
      if (id === save.secretary) this.layer.add(this.badge(cx + w / 2 - 8 * u, cy + h / 2 - 48 * u, '비서'));
    }
  }

  private selectFrame(cx: number, cy: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.lineStyle(4 * this.u, 0xffffff, 1).strokeRect(cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6);
    return g;
  }

  private badge(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, textStyle(Math.round(14 * this.u), '#16181d', 900))
      .setOrigin(1, 0)
      .setBackgroundColor(ACCENT_S)
      .setPadding(6 * this.u, 2 * this.u);
  }

  // ───────────────────────── 멤버 정보 (오른쪽) ─────────────────────────

  private drawInfo(): void {
    this.infoLayer.removeAll(true);
    const def = this.selected ? OPERATOR_MAP[this.selected] : null;
    if (!def) return;
    const u = this.u;
    const save = loadSave();
    const squad = save.squads[save.active];
    const { w, gap, x0, y0, h } = this.slotGeom();
    const left = x0 + 6 * (w + gap) + 20 * u;
    const right = this.W - 40 * u;
    const top = y0 + 10 * u;
    const bottom = top + 2 * h + gap;
    const pw = right - left;
    const ph = bottom - top;
    if (pw < 320 * u) return;

    const bg = this.add.graphics();
    const pts = [
      new Phaser.Math.Vector2(left + SLANT * u, top),
      new Phaser.Math.Vector2(right, top),
      new Phaser.Math.Vector2(right - SLANT * u, bottom),
      new Phaser.Math.Vector2(left, bottom),
    ];
    bg.fillStyle(0x000000, 0.55).fillPoints(pts, true);
    bg.lineStyle(1.5, 0xffffff, 0.15).strokePoints(pts, true);
    bg.fillStyle(RARITY_COLOR[def.rarity] ?? 0xffffff, 1).fillRect(left + SLANT * u, top, 90 * u, 4 * u);
    this.infoLayer.add(bg);

    // SD 초상
    const pt = sdPortrait(this, def);
    const portraitH = ph * 0.86;
    const img = this.add.image(left + pw * 0.2, bottom - 14 * u, pt.key).setOrigin(pt.footX / pt.width, pt.footY / pt.height);
    img.setScale(Math.min(portraitH / pt.height, (pw * 0.38) / pt.width)).setFlipX(pt.flip);
    this.infoLayer.add(img);

    const tx = left + pw * 0.4;
    const skill = SKILL_MAP[def.skill];
    const lines = [
      `${CLASS_INFO[def.cls].name}   코스트 ${def.cost}   저지 ${def.block}`,
      `체력 ${def.hp}   ${def.damageType === 'heal' ? '회복' : '공격'} ${def.atk}`,
      `방어 ${def.def}   마법저항 ${def.res}   재배치 ${def.redeploy}초`,
    ];
    const name = this.add.text(tx, top + 20 * u, def.name, textStyle(Math.round(38 * u), '#ffffff', 900));
    const stars = this.add
      .text(tx + name.width + 14 * u, top + 38 * u, '★'.repeat(def.rarity), textStyle(Math.round(18 * u), '#' + (RARITY_COLOR[def.rarity] ?? 0xffffff).toString(16).padStart(6, '0'), 900));
    const textW = right - tx - 40 * u;
    const stats = this.add.text(tx, top + 74 * u, lines.join('\n'), { ...textStyle(Math.round(17 * u), '#e6e8eb', 700), lineSpacing: 6 * u });
    const trait = this.add.text(tx, stats.y + stats.height + 10 * u, `특성  ${def.trait}`, {
      ...textStyle(Math.round(15 * u), '#c9ccd2', 400),
      wordWrap: { width: textW },
    });
    const sk = this.add.text(tx, trait.y + trait.height + 8 * u, skill ? `◆ ${skill.name}  ${skill.desc}` : '', {
      ...textStyle(Math.round(15 * u), '#ffffff', 400),
      wordWrap: { width: textW },
      lineSpacing: 3 * u,
    });
    this.infoLayer.add([name, stars, stats, trait, sk]);

    // 버튼: 분대 넣기/빼기, 비서 지정
    const inSquad = squad.includes(def.id);
    const by = bottom - 36 * u;
    const bw2 = Math.min(200 * u, (right - tx - 40 * u) / 2);
    const toggle = new Button(this, tx + bw2 / 2, by, bw2, 50 * u, inSquad ? '분대에서 빼기' : '분대에 넣기', () => this.toggle(def.id), {
      fontSize: Math.round(20 * u),
      fill: inSquad ? 0x3a2a2a : 0x2a3a2a,
    });
    const isSec = save.secretary === def.id;
    const sec = new Button(this, tx + bw2 * 1.5 + 14 * u, by, bw2, 50 * u, isSec ? '현재 비서' : '비서로 지정', () => this.setSecretary(def), {
      fontSize: Math.round(20 * u),
      fill: isSec ? 0x7a5c12 : 0x2a2e36,
      stroke: isSec ? ACCENT : 0x3a3f48,
    });
    this.infoLayer.add([toggle, sec]);
  }

  // ───────────────────────── 멤버 목록 (아래, 가로 스크롤) ─────────────────────────

  private createRosterArea(): void {
    const u = this.u;
    const { y0, h, gap } = this.slotGeom();
    const top = y0 + 10 * u + 2 * h + gap + 46 * u;
    this.add.text(60 * u, top - 10 * u, '멤버 목록', textStyle(Math.round(22 * u), '#ffffff', 900)).setOrigin(0, 1);
    this.add.text(176 * u, top - 12 * u, '탭해서 분대에 넣기 / 빼기', textStyle(Math.round(16 * u), '#9aa0a6', 400)).setOrigin(0, 1);
    // 2줄짜리 멤버 목록 (카드 0.9배)
    this.rosterView = { x: 40 * u, y: top, w: this.W - 80 * u, h: 2 * CARD_H * 0.9 * u + 36 * u };
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRect(this.rosterView.x, this.rosterView.y, this.rosterView.w, this.rosterView.h);
    this.rosterLayer.setMask(maskG.createGeometryMask());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.inRoster(p)) return;
      this.drag = { active: true, startX: p.x, startScroll: this.rosterScroll, moved: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag.active || !p.isDown) return;
      const dx = p.x - this.drag.startX;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(dx));
      this.rosterScroll = Phaser.Math.Clamp(this.drag.startScroll - dx, 0, this.rosterMaxScroll);
      this.rosterLayer.x = -this.rosterScroll;
    });
    this.input.on('pointerup', () => this.time.delayedCall(0, () => (this.drag.active = false)));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      this.rosterScroll = Phaser.Math.Clamp(this.rosterScroll + dx + dy, 0, this.rosterMaxScroll);
      this.rosterLayer.x = -this.rosterScroll;
    });
  }

  private inRoster(p: Phaser.Input.Pointer): boolean {
    const v = this.rosterView;
    return p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h;
  }

  private drawRoster(): void {
    this.rosterLayer.removeAll(true);
    const u = this.u;
    const save = loadSave();
    const squad = save.squads[save.active];
    const cs = 0.9 * u;
    const w = CARD_W * cs;
    const h = CARD_H * cs;
    const gap = 12 * u;
    // 정렬: 레어도 높은 순 → 이름
    const list = [...OPERATORS].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, 'ko'));
    list.forEach((def, i) => {
      // 위아래 2줄, 왼쪽부터 세로로 채움 (정렬 순서가 좌→우로 유지됨)
      const col = Math.floor(i / 2);
      const row = i % 2;
      const cx = this.rosterView.x + 20 * u + col * (w + gap) + w / 2;
      const cy = this.rosterView.y + 12 * u + row * (h + gap) + h / 2;
      const card = new DeckCard(this, def).setPosition(cx, cy).setScale(cs);
      card.refresh(null, 0);
      const idx = squad.indexOf(def.id);
      card.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.drag.moved > 10 || !this.inRoster(p)) return;
        this.selected = def.id;
        this.toggle(def.id);
      });
      this.rosterLayer.add(card);
      if (idx >= 0) {
        // 분대에 들어간 멤버: 어둡게 + 순번
        const dim = this.add.rectangle(cx, cy, w, h, 0x000000, 0.45);
        const num = this.add
          .text(cx, cy - 6 * u, String(idx + 1), { ...textStyle(Math.round(44 * u), '#ffffff', 900), stroke: '#000', strokeThickness: 6 })
          .setOrigin(0.5);
        const chk = this.add.text(cx + w / 2 - 6 * u, cy - h / 2 + 6 * u, '✓', textStyle(Math.round(20 * u), '#16181d', 900)).setOrigin(1, 0);
        chk.setBackgroundColor(ACCENT_S).setPadding(5 * u, 0);
        this.rosterLayer.add([dim, num, chk]);
      }
      if (def.id === this.selected) this.rosterLayer.add(this.selectFrame(cx, cy, w, h));
    });
    const contentW = 40 * u + Math.ceil(list.length / 2) * (w + gap);
    this.rosterMaxScroll = Math.max(0, contentW - this.rosterView.w);
    this.rosterScroll = Math.min(this.rosterScroll, this.rosterMaxScroll);
    this.rosterLayer.x = -this.rosterScroll;
  }

  // ───────────────────────── 버튼 / 동작 ─────────────────────────

  private createButtons(): void {
    const u = this.u;
    const y = this.H - 56 * u;
    new Button(this, this.W - 480 * u, y, 220 * u, 70 * u, '비우기', () => this.clearSquad(), { fontSize: Math.round(24 * u) });
    new Button(this, this.W - 190 * u, y, 320 * u, 70 * u, '작전 개시 ▶', () => this.startBattle(), {
      fontSize: Math.round(28 * u),
      fill: 0x7a5c12,
      stroke: ACCENT,
    });
  }

  private toggle(id: string): void {
    const save = loadSave();
    const squad = save.squads[save.active];
    const i = squad.indexOf(id);
    if (i >= 0) squad.splice(i, 1);
    else if (squad.length >= SQUAD_SIZE) {
      this.showToast(`분대는 최대 ${SQUAD_SIZE}명입니다`);
      return;
    } else squad.push(id);
    writeSave();
    this.render();
  }

  private setSecretary(def: OperatorDef): void {
    const save = loadSave();
    save.secretary = def.id;
    writeSave();
    this.showToast(`${def.name}을(를) 비서로 지정했습니다`);
    this.render();
  }

  private clearSquad(): void {
    const save = loadSave();
    save.squads[save.active] = [];
    writeSave();
    this.render();
  }

  private startBattle(): void {
    if (!activeSquad().length) {
      this.showToast('분대가 비어 있습니다');
      return;
    }
    this.go('battle', { stageId: '0-1' });
  }

  private render(): void {
    this.layer.removeAll(true);
    this.drawTabs();
    this.drawSlots();
    this.drawInfo();
    this.drawRoster();
  }

  private go(scene: string, data?: object): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1000, duration: 300 });
  }
}
