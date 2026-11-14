/**
 * 편성 화면 (명일방주 편성 참고).
 *
 * [분대 보기]  밝은 배경 위 세로 카드 6 × 2. 카드(빈 칸 포함)를 누르면 멤버 선택으로.
 *   ┌ ◀ 편성 ──────────────── [분대1][분대2][분대3][분대4] ┐
 *   │ ‹  [카드][카드][카드][카드][  +  ][  +  ]  ›         │
 *   │    [카드][카드][카드][카드][  +  ][  +  ]            │
 *   └───────────────────────────── [비우기] [작전 개시] ┘
 *
 * [멤버 선택]  어두운 배경, 전체 멤버 카드 2줄(가로 스크롤) + 오른쪽 상세 정보.
 *   카드를 누르면 분대에 넣기/빼기, 상세 패널에서 비서 지정.
 */
import Phaser from 'phaser';
import { CLASS_INFO, OPERATOR_MAP, OPERATORS } from '../data/operators';
import { activeSquad, loadSave, SQUAD_COUNT, SQUAD_SIZE, writeSave } from '../data/save';
import { SKILL_MAP } from '../data/skills';
import type { OperatorDef } from '../data/types';
import { Button } from '../ui/button';
import { textStyle } from '../ui/theme';
import { RARITY_COLOR } from './battle/DeckCard';
import { PC_H, PC_W, PortraitCard } from './squad/PortraitCard';

const YELLOW = 0xf6c12c;
const YELLOW_S = '#f6c12c';
const SLANT = 18;
const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

export class SquadScene extends Phaser.Scene {
  private u = 1;
  private W = 1920;
  private H = 1080;
  private mode: 'squad' | 'select' = 'squad';
  private selected: string | null = null;
  private root!: Phaser.GameObjects.Container;
  private listLayer!: Phaser.GameObjects.Container;
  private scroll = 0;
  private maxScroll = 0;
  private view = { x: 0, y: 0, w: 0, h: 0 };
  private drag = { active: false, startX: 0, startScroll: 0, moved: 0 };
  private toast!: Phaser.GameObjects.Text;
  private maskG!: Phaser.GameObjects.Graphics;

  constructor() {
    super('squad');
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.u = this.H / 1080;
    this.mode = 'squad';
    this.scroll = 0;
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.root = this.add.container(0, 0);
    this.listLayer = this.add.container(0, 0);
    this.maskG = this.make.graphics({}, false);
    this.listLayer.setMask(this.maskG.createGeometryMask());
    this.toast = this.add
      .text(this.W / 2, this.H - 150 * this.u, '', { ...textStyle(Math.round(26 * this.u), '#ffffff', 700), backgroundColor: '#000000cc', padding: { x: 18, y: 8 } })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
    this.bindScroll();
    this.render();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  private render(): void {
    this.root.removeAll(true);
    this.listLayer.removeAll(true);
    if (this.mode === 'squad') this.renderSquad();
    else this.renderSelect();
  }

  // ───────────────────────── 공통 ─────────────────────────

  private header(title: string, sub: string, dark: boolean, onBack: () => void): void {
    const u = this.u;
    const back = new Button(this, 60 * u, 50 * u, 84 * u, 60 * u, '◀', onBack, {
      fill: dark ? 0x000000 : 0x2a2d34,
      alpha: dark ? 0.55 : 0.92,
      stroke: 0x555555,
      fontSize: Math.round(28 * u),
    });
    const ink = dark ? '#ffffff' : '#1d2026';
    this.root.add([
      back,
      this.add.text(120 * u, 22 * u, title, textStyle(Math.round(46 * u), ink, 900)),
      this.add.text(124 * u, 80 * u, sub, textStyle(Math.round(16 * u), dark ? '#9aa0a6' : '#6b7079', 700)).setLetterSpacing(3),
    ]);
  }

  // ───────────────────────── 분대 보기 ─────────────────────────

  private renderSquad(): void {
    const { W, H, u } = this;
    const save = loadSave();
    const squad = save.squads[save.active];
    this.maskG.clear();

    // 밝은 배경 (흰색~회색 그라데이션 + 옅은 사선)
    const g = this.add.graphics();
    g.fillGradientStyle(0xf3f4f6, 0xe6e8ec, 0xd9dce2, 0xc9cdd4, 1).fillRect(0, 0, W, H);
    g.lineStyle(1, 0xffffff, 0.7);
    for (let x = -H; x < W; x += 64) g.lineBetween(x, H, x + H * 0.7, 0);
    g.fillStyle(0x1d2026, 0.08).fillPoints([v(W * 0.55, 0), v(W, 0), v(W, H), v(W * 0.75, H)], true);
    g.fillStyle(YELLOW, 1).fillRect(0, H - 6 * u, W * 0.3, 6 * u);
    this.root.add(g);
    this.header('편성', 'SQUAD', false, () => this.go('lobby'));
    this.drawTabs();

    // 카드 크기: 6열 × 2줄이 화면에 들어가게
    const gap = 14 * u;
    const top = 120 * u;
    const bottom = H - 112 * u;
    const sByW = (W - 260 * u - 5 * gap) / 6 / PC_W;
    const sByH = (bottom - top - gap) / 2 / PC_H;
    const s = Math.min(sByW, sByH);
    const cw = PC_W * s;
    const ch = PC_H * s;
    const x0 = (W - (6 * cw + 5 * gap)) / 2;
    const y0 = top + (bottom - top - (2 * ch + gap)) / 2;
    for (let i = 0; i < SQUAD_SIZE; i++) {
      const id = squad[i];
      const def = id ? OPERATOR_MAP[id] : null;
      const card = new PortraitCard(this, def).setScale(s);
      card.setPosition(x0 + (i % 6) * (cw + gap) + cw / 2, y0 + Math.floor(i / 6) * (ch + gap) + ch / 2);
      card.setMarks({ secretary: !!def && def.id === save.secretary });
      card.on('pointerdown', () => card.setScale(s * 0.97));
      card.on('pointerout', () => card.setScale(s));
      card.on('pointerup', () => {
        card.setScale(s);
        this.selected = id ?? this.selected ?? OPERATORS[0].id;
        this.openSelect();
      });
      this.root.add(card);
    }
    // 좌우 화살표 (분대 전환)
    const arrow = (x: number, d: -1 | 1) => {
      const t = this.add.text(x, y0 + ch + gap / 2, d < 0 ? '‹' : '›', textStyle(Math.round(110 * u), '#ffffff', 400)).setOrigin(0.5);
      t.setShadow(0, 2, '#00000066', 6).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        save.active = (save.active + d + SQUAD_COUNT) % SQUAD_COUNT;
        writeSave();
        this.render();
      });
      this.root.add(t);
    };
    arrow(x0 - 60 * u, -1);
    arrow(x0 + 6 * cw + 5 * gap + 60 * u, 1);

    this.root.add(
      this.add
        .text(x0, y0 - 12 * u, `분대 ${save.active + 1}  ·  ${squad.length}/${SQUAD_SIZE}  ·  전투 덱으로 사용 중  ·  카드를 눌러 멤버 변경`, textStyle(Math.round(18 * u), '#4a4f58', 700))
        .setOrigin(0, 1),
    );
    const y = H - 56 * u;
    this.root.add([
      new Button(this, W - 480 * u, y, 220 * u, 70 * u, '비우기', () => this.clearSquad(), { fontSize: Math.round(24 * u), fill: 0x2a2d34 }),
      new Button(this, W - 190 * u, y, 320 * u, 70 * u, '작전 개시 ▶', () => this.startBattle(), {
        fontSize: Math.round(28 * u),
        fill: 0x1d2026,
        stroke: YELLOW,
        textColor: YELLOW_S,
      }),
    ]);
  }

  private drawTabs(): void {
    const u = this.u;
    const save = loadSave();
    const tw = 170 * u;
    const th = 58 * u;
    let x = this.W - 40 * u - SQUAD_COUNT * (tw + 8 * u);
    for (let i = 0; i < SQUAD_COUNT; i++) {
      const on = i === save.active;
      const c = this.add.container(x, 22 * u);
      const pts = [v(SLANT * u, 0), v(tw, 0), v(tw - SLANT * u, th), v(0, th)];
      const g = this.add.graphics();
      g.fillStyle(on ? 0x1d2026 : 0xffffff, on ? 1 : 0.7).fillPoints(pts, true);
      if (on) g.fillStyle(YELLOW, 1).fillRect(SLANT * u, th - 5 * u, tw - 2 * SLANT * u, 5 * u);
      else g.lineStyle(1.5, 0x1d2026, 0.25).strokePoints(pts, true);
      const ink = on ? '#ffffff' : '#1d2026';
      c.add([
        g,
        this.add.text(30 * u, th / 2, `분대 ${i + 1}`, textStyle(Math.round(22 * u), ink, 900)).setOrigin(0, 0.5),
        this.add.text(tw - 30 * u, th / 2, `${save.squads[i].length}/${SQUAD_SIZE}`, textStyle(Math.round(16 * u), on ? '#c9ccd2' : '#6b7079', 700)).setOrigin(1, 0.5),
      ]);
      c.setSize(tw, th).setInteractive(new Phaser.Geom.Polygon(pts), Phaser.Geom.Polygon.Contains);
      c.on('pointerup', () => {
        save.active = i;
        writeSave();
        this.render();
      });
      this.root.add(c);
      x += tw + 8 * u;
    }
  }

  // ───────────────────────── 멤버 선택 ─────────────────────────

  private openSelect(): void {
    this.mode = 'select';
    this.scroll = 0;
    this.render();
  }

  private renderSelect(): void {
    const { W, H, u } = this;
    const save = loadSave();
    const squad = save.squads[save.active];
    const g = this.add.graphics();
    g.fillGradientStyle(0x2b3038, 0x1f232a, 0x14161b, 0x0e1014, 1).fillRect(0, 0, W, H);
    g.lineStyle(1, 0xffffff, 0.04);
    for (let x = -H; x < W; x += 56) g.lineBetween(x, H, x + H * 0.6, 0);
    this.root.add(g);
    this.header('멤버 선택', `SQUAD ${save.active + 1}  ·  ${squad.length}/${SQUAD_SIZE}`, true, () => this.closeSelect());

    // 오른쪽 상세 패널 폭
    const panelW = Math.min(520 * u, W * 0.3);
    const listRight = W - panelW - 40 * u;
    const top = 120 * u;
    const bottom = H - 110 * u;
    const gap = 12 * u;
    const s = (bottom - top - gap - 24 * u) / 2 / PC_H;
    const cw = PC_W * s;
    const ch = PC_H * s;
    this.view = { x: 30 * u, y: top, w: listRight - 30 * u, h: bottom - top };
    this.maskG.clear().fillStyle(0xffffff).fillRect(this.view.x, this.view.y, this.view.w, this.view.h);

    const list = [...OPERATORS].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, 'ko'));
    list.forEach((def, i) => {
      const col = Math.floor(i / 2);
      const row = i % 2;
      const card = new PortraitCard(this, def).setScale(s);
      card.setPosition(this.view.x + 14 * u + col * (cw + gap) + cw / 2, top + 12 * u + row * (ch + gap) + ch / 2);
      const idx = squad.indexOf(def.id);
      card.setMarks({ selected: def.id === this.selected, order: idx >= 0 ? idx + 1 : undefined, secretary: def.id === save.secretary });
      card.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.drag.moved > 10 || !this.inView(p)) return;
        this.selected = def.id;
        this.toggle(def.id);
      });
      this.listLayer.add(card);
    });
    this.maxScroll = Math.max(0, 28 * u + Math.ceil(list.length / 2) * (cw + gap) - this.view.w);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this.listLayer.x = -this.scroll;

    this.drawDetail(listRight + 20 * u, top, W - 30 * u, bottom);
    this.root.add(
      new Button(this, W - 190 * u, H - 56 * u, 320 * u, 70 * u, '확인', () => this.closeSelect(), {
        fontSize: Math.round(28 * u),
        fill: 0x7a5c12,
        stroke: YELLOW,
      }),
    );
  }

  private drawDetail(left: number, top: number, right: number, bottom: number): void {
    const u = this.u;
    const def = this.selected ? OPERATOR_MAP[this.selected] : null;
    if (!def) return;
    const save = loadSave();
    const squad = save.squads[save.active];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillPoints([v(left + SLANT * u, top), v(right, top), v(right - SLANT * u, bottom), v(left, bottom)], true);
    g.fillStyle(RARITY_COLOR[def.rarity] ?? 0xffffff, 1).fillRect(left + SLANT * u, top, 100 * u, 4 * u);
    this.root.add(g);
    const tx = left + 36 * u;
    const tw = right - tx - 30 * u;
    const skill = SKILL_MAP[def.skill];
    const name = this.add.text(tx, top + 26 * u, def.name, textStyle(Math.round(40 * u), '#ffffff', 900));
    if (name.width > tw) name.setScale(tw / name.width);
    const stars = this.add.text(tx, top + 82 * u, `${'★'.repeat(def.rarity)}   ${CLASS_INFO[def.cls].name}`, textStyle(Math.round(20 * u), '#' + (RARITY_COLOR[def.rarity] ?? 0xffffff).toString(16).padStart(6, '0'), 900));
    const stats = this.add.text(
      tx,
      top + 128 * u,
      [
        `코스트 ${def.cost}    저지 ${def.block}    재배치 ${def.redeploy}초`,
        `체력 ${def.hp}    ${def.damageType === 'heal' ? '회복' : '공격'} ${def.atk}`,
        `방어 ${def.def}    마법저항 ${def.res}`,
      ].join('\n'),
      { ...textStyle(Math.round(18 * u), '#e6e8eb', 700), lineSpacing: 8 * u },
    );
    const trait = this.add.text(tx, stats.y + stats.height + 18 * u, `특성  ${def.trait}`, { ...textStyle(Math.round(16 * u), '#c9ccd2', 400), wordWrap: { width: tw } });
    const sk = this.add.text(tx, trait.y + trait.height + 14 * u, skill ? `◆ ${skill.name}\n${skill.desc}` : '', {
      ...textStyle(Math.round(16 * u), '#ffffff', 400),
      wordWrap: { width: tw },
      lineSpacing: 4 * u,
    });
    this.root.add([name, stars, stats, trait, sk]);
    const inSquad = squad.includes(def.id);
    const isSec = save.secretary === def.id;
    const bw = (tw - 14 * u) / 2;
    const by = bottom - 50 * u;
    this.root.add([
      new Button(this, tx + bw / 2, by, bw, 56 * u, inSquad ? '분대에서 빼기' : '분대에 넣기', () => this.toggle(def.id), {
        fontSize: Math.round(19 * u),
        fill: inSquad ? 0x3a2a2a : 0x2a3a2a,
      }),
      new Button(this, tx + bw * 1.5 + 14 * u, by, bw, 56 * u, isSec ? '현재 비서' : '비서로 지정', () => this.setSecretary(def), {
        fontSize: Math.round(19 * u),
        fill: isSec ? 0x7a5c12 : 0x2a2e36,
        stroke: isSec ? YELLOW : 0x3a3f48,
      }),
    ]);
  }

  private closeSelect(): void {
    this.mode = 'squad';
    this.render();
  }

  private bindScroll(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'select' || !this.inView(p)) return;
      this.drag = { active: true, startX: p.x, startScroll: this.scroll, moved: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag.active || !p.isDown) return;
      const dx = p.x - this.drag.startX;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(dx));
      this.scroll = Phaser.Math.Clamp(this.drag.startScroll - dx, 0, this.maxScroll);
      this.listLayer.x = -this.scroll;
    });
    this.input.on('pointerup', () => this.time.delayedCall(0, () => (this.drag.active = false)));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      if (this.mode !== 'select') return;
      this.scroll = Phaser.Math.Clamp(this.scroll + dx + dy, 0, this.maxScroll);
      this.listLayer.x = -this.scroll;
    });
  }

  private inView(p: Phaser.Input.Pointer): boolean {
    const r = this.view;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // ───────────────────────── 동작 ─────────────────────────

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
