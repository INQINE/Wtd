import Phaser from 'phaser';
import { Battle, type BattleEvent, type DeployError, type EnemyUnit, type OpUnit } from '../../battle/sim';
import type { Point } from '../../battle/grid';
import { ENEMY_MAP } from '../../data/enemies';
import { CLASS_INFO, OPERATOR_MAP } from '../../data/operators';
import { dirFromVector, rangeTiles } from '../../data/ranges';
import { STAGE_MAP } from '../../data/stages';
import { activeSquad, loadSave, nextStageId, recordClear, writeSave } from '../../data/save';
import type { Dir, OperatorDef } from '../../data/types';
import { Button } from '../../ui/button';
import { COLORS, textStyle } from '../../ui/theme';
import { CARD_H, CARD_W, DeckCard, RARITY_COLOR } from './DeckCard';
import { HEIGHT, MapRenderer } from './MapRenderer';
import { Projection } from './projection';
import { EnemySprite, OperatorSprite } from './sprites';
import { ensureHudIcons } from './textures';
import { sdPortrait } from '../../sd/factory';

/** 조작 중(드래그·방향 선택·선택) 시간 흐름 비율 */
const SLOW = 0.2;
/** 경로 예고: 적 등장 몇 초 전부터 보여줄지 */
const ROUTE_PREVIEW = 3.5;

type Mode =
  | { kind: 'idle' }
  | { kind: 'drag'; def: OperatorDef; ghost: OperatorSprite; tile: [number, number] | null }
  | { kind: 'dir'; def: OperatorDef; ghost: OperatorSprite; tile: [number, number]; dir: Dir; dragging: boolean }
  | { kind: 'selected'; uid: number };

const ERROR_TEXT: Partial<Record<DeployError, string>> = {
  cost: '코스트가 부족합니다',
  cooldown: '재배치 대기 중입니다',
  limit: '배치 가능 인원을 초과했습니다',
};

const SP_TYPE_TEXT = { auto: '자동 회복', attack: '공격 회복', defense: '피격 회복' } as const;

interface RoutePreview {
  route: string;
  start: number;
  end: number;
}

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private stageId = '0-1';
  private proj!: Projection;
  private mapR!: MapRenderer;
  private squash = 0.6;
  private W = 1920;
  private H = 1080;

  private mode: Mode = { kind: 'idle' };
  private speed = 1;
  private paused = false;
  private menuOpen = false;
  private ended = false;

  private opSprites = new Map<number, OperatorSprite>();
  private enemySprites = new Map<number, EnemySprite>();
  private cards: DeckCard[] = [];
  private routePreviews: RoutePreview[] = [];
  private healAnimFrame = -1;
  /** 적 uid → 피격 번쩍임이 끝나는 시각 */
  private hitFlash = new Map<number, number>();
  private bossBar!: Phaser.GameObjects.Container;
  private bossFill!: Phaser.GameObjects.Rectangle;
  private bossName!: Phaser.GameObjects.Text;

  // 표시 레이어
  private mapImage!: Phaser.GameObjects.Image;
  private hl!: Phaser.GameObjects.Graphics;
  private routeG!: Phaser.GameObjects.Graphics;
  private dimmer!: Phaser.GameObjects.Rectangle;
  private dial!: Phaser.GameObjects.Graphics;
  private dialCancel!: Button;
  private dialHint!: Phaser.GameObjects.Text;

  // HUD
  private topBar!: Phaser.GameObjects.Container;
  private killText!: Phaser.GameObjects.Text;
  private lifeText!: Phaser.GameObjects.Text;
  private lifeIcon!: Phaser.GameObjects.Image;
  private speedBtn!: Button;
  private pauseBtn!: Button;
  private menuBtn!: Button;
  private costPanel!: Phaser.GameObjects.Container;
  private costText!: Phaser.GameObjects.Text;
  private costBar!: Phaser.GameObjects.Rectangle;
  private deployText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Container;
  private infoBg!: Phaser.GameObjects.Graphics;
  private infoPortrait!: Phaser.GameObjects.Image;
  private infoName!: Phaser.GameObjects.Text;
  private infoClass!: Phaser.GameObjects.Text;
  private infoStats!: Phaser.GameObjects.Text;
  private infoTrait!: Phaser.GameObjects.Text;
  private infoSkill!: Phaser.GameObjects.Text;
  private retreatBtn!: Phaser.GameObjects.Container;
  private skillBtn!: Phaser.GameObjects.Container;
  private skillArc!: Phaser.GameObjects.Graphics;
  private skillLabel!: Phaser.GameObjects.Text;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private menuOverlay!: Phaser.GameObjects.Container;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('battle');
  }

  init(data: { stageId?: string }): void {
    this.stageId = data.stageId ?? '0-1';
    this.mode = { kind: 'idle' };
    this.speed = 1;
    this.paused = false;
    this.menuOpen = false;
    this.ended = false;
    this.opSprites.clear();
    this.enemySprites.clear();
    this.hitFlash.clear();
    this.cards = [];
  }

  create(): void {
    const stage = STAGE_MAP[this.stageId];
    this.battle = new Battle(stage, OPERATOR_MAP, ENEMY_MAP);
    this.routePreviews = this.buildRoutePreviews();
    ensureHudIcons(this);
    this.cameras.main.setBackgroundColor(0x0a0b0d);

    this.mapImage = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(0);
    this.hl = this.add.graphics().setDepth(10);
    this.routeG = this.add.graphics().setDepth(11);
    this.dimmer = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0, 0).setDepth(3400);

    this.createDial();
    this.createHud();
    this.createDeck();
    this.createInfo();
    this.createOverlays();
    this.bindInput();

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  // ───────────────────────── 레이아웃 ─────────────────────────

  /** 화면 크기에 맞춰 투영·맵·HUD 위치를 다시 잡는다 (폰 회전/전체화면 대응) */
  private layout(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    const { W, H } = this;
    const { rows, cols } = this.battle.grid;

    this.proj = new Projection(cols, rows, { pitchDeg: 56, yShift: 0.35 });
    this.proj.fit({ left: 70, right: W - 70, top: 150, bottom: H - CARD_H - 40 }, 0.5, 0.2);
    this.mapR = new MapRenderer(this, this.battle.grid, this.proj);
    const c = this.proj.project(cols / 2, rows / 2);
    const a = this.proj.project(cols / 2, rows / 2 + 0.5);
    const b = this.proj.project(cols / 2 + 0.5, rows / 2);
    this.squash = (a.y - c.y) / (b.x - c.x);
    this.mapR.bake(`map-${this.stageId}`, W, H);
    this.mapImage.setTexture(`map-${this.stageId}`);
    this.dimmer.setSize(W, H);

    // 상단 중앙 (처치 수 · 방어점)
    this.topBar.setPosition(W / 2, 0);
    this.bossBar.setPosition(W / 2, 78);
    this.speedBtn.setPosition(W - 158, 46);
    this.pauseBtn.setPosition(W - 60, 46);
    this.menuBtn.setPosition(52, 46);
    // 코스트 (덱 오른쪽 위)
    this.costPanel.setPosition(W - 12, H - CARD_H - 20);
    for (const card of this.cards) {
      card.baseY = H - CARD_H / 2 - 8;
      card.y = card.baseY;
    }
    this.layoutDeck(true);
    this.infoBg.clear();
    this.infoBg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.92, 0, 0.92, 0);
    this.infoBg.fillRect(0, 0, 680, H);
    (this.pauseOverlay.list[0] as Phaser.GameObjects.Rectangle).setSize(W, H);
    (this.pauseOverlay.list[1] as Phaser.GameObjects.Text).setPosition(W / 2, H / 2 - 40);
    (this.menuOverlay.list[0] as Phaser.GameObjects.Rectangle).setSize(W, H);
    this.menuOverlay.list.slice(1).forEach((o, i) => (o as Phaser.GameObjects.Container).setPosition(W / 2, H / 2 - 110 + i * 110));
    this.toast.setPosition(W / 2, H - CARD_H - 100);
    for (const op of this.battle.ops) this.ensureOpSprite(op);
    this.drawHighlights();
  }

  // ───────────────────────── 좌표 ─────────────────────────

  private heightAt(r: number, c: number): number {
    return this.mapR.heightAt(r, c);
  }

  private footOf(x: number, y: number, z?: number) {
    return this.proj.project(x, y, z ?? this.heightAt(Math.floor(y), Math.floor(x)));
  }

  private tileFoot(r: number, c: number) {
    return this.proj.project(c + 0.5, r + 0.5, this.heightAt(r, c));
  }

  /** 화면 좌표 → 타일 (높은 면부터 검사) */
  private pickTile(px: number, py: number): [number, number] | null {
    const { rows, cols } = this.battle.grid;
    for (const z of [HEIGHT.wall, HEIGHT.high, 0]) {
      const w = this.proj.unproject(px, py, z);
      if (!w) continue;
      const r = Math.floor(w.y);
      const c = Math.floor(w.x);
      if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
      if (this.heightAt(r, c) === z || z === 0) return [r, c];
    }
    return null;
  }

  /** 화면 좌표 위에 그려진 멤버 (스프라이트 몸통까지 포함) */
  private pickOp(px: number, py: number): OpUnit | undefined {
    let best: OpUnit | undefined;
    let bestY = -Infinity;
    for (const op of this.battle.ops) {
      const f = this.tileFoot(op.row, op.col);
      if (Math.abs(px - f.x) < f.k * 0.4 && py < f.y + f.k * 0.3 && py > f.y - f.k * 1.0 && f.y > bestY) {
        best = op;
        bestY = f.y;
      }
    }
    if (best) return best;
    const t = this.pickTile(px, py);
    return t ? this.battle.opAt(t[0], t[1]) : undefined;
  }

  // ───────────────────────── 생성 ─────────────────────────

  private createDial(): void {
    this.dial = this.add.graphics().setDepth(3700);
    this.dialCancel = new Button(this, 0, 0, 64, 64, '✕', () => this.cancelMode(), {
      fill: 0x000000,
      alpha: 0.7,
      stroke: 0xffffff,
      fontSize: 30,
      radius: 32,
    })
      .setDepth(3800)
      .setVisible(false);
    this.dialHint = this.add
      .text(0, 0, '드래그해서 방향 선택', { ...textStyle(26), stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(3800)
      .setVisible(false);
  }

  private createHud(): void {
    // 상단 중앙 바
    this.topBar = this.add.container(0, 0).setDepth(10000);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.6);
    bg.fillPoints(
      [new Phaser.Math.Vector2(-300, 0), new Phaser.Math.Vector2(300, 0), new Phaser.Math.Vector2(270, 72), new Phaser.Math.Vector2(-270, 72)],
      true,
    );
    bg.lineStyle(2, 0xffffff, 0.12);
    bg.lineBetween(0, 14, 0, 58);
    const eIcon = this.add.image(-210, 36, 'icon-enemy').setScale(0.75);
    this.killText = this.add.text(-170, 36, '', textStyle(34, '#ffffff', 900)).setOrigin(0, 0.5);
    this.lifeIcon = this.add.image(60, 36, 'icon-life').setScale(0.75);
    this.lifeText = this.add.text(100, 36, '', textStyle(34, '#ffffff', 900)).setOrigin(0, 0.5);
    this.topBar.add([bg, eIcon, this.killText, this.lifeIcon, this.lifeText]);

    // 보스 체력바 (상단 바 아래)
    this.bossBar = this.add.container(0, 0).setDepth(10000).setVisible(false);
    const bbw = 620;
    const bbg = this.add.graphics();
    bbg.fillStyle(0x000000, 0.7).fillPoints(
      [new Phaser.Math.Vector2(-bbw / 2 - 20, 0), new Phaser.Math.Vector2(bbw / 2 + 20, 0), new Phaser.Math.Vector2(bbw / 2 + 6, 46), new Phaser.Math.Vector2(-bbw / 2 - 6, 46)],
      true,
    );
    this.bossName = this.add.text(-bbw / 2, 4, '', textStyle(18, '#e0aaff', 900));
    const bossBg = this.add.rectangle(-bbw / 2, 34, bbw, 8, 0x3a2a4a).setOrigin(0, 0.5);
    this.bossFill = this.add.rectangle(-bbw / 2, 34, bbw, 8, 0xb04cff).setOrigin(0, 0.5);
    this.bossBar.add([bbg, this.bossName, bossBg, this.bossFill]);

    const btn = { fill: 0x000000, alpha: 0.6, stroke: 0x555555, fontSize: 28 };
    this.speedBtn = new Button(this, 0, 0, 120, 64, '1X ▶', () => this.toggleSpeed(), btn).setDepth(10000);
    this.pauseBtn = new Button(this, 0, 0, 76, 64, '❚❚', () => this.togglePause(), btn).setDepth(10000);
    this.menuBtn = new Button(this, 0, 0, 76, 64, '≡', () => this.openMenu(), { ...btn, fontSize: 38 }).setDepth(10000);

    // 코스트 패널 (기준점 = 오른쪽 아래)
    this.costPanel = this.add.container(0, 0).setDepth(10000);
    const cbg = this.add.graphics();
    cbg.fillStyle(0x000000, 0.7);
    cbg.fillPoints(
      [new Phaser.Math.Vector2(-196, -66), new Phaser.Math.Vector2(0, -66), new Phaser.Math.Vector2(0, 0), new Phaser.Math.Vector2(-216, 0)],
      true,
    );
    const cIcon = this.add.image(-160, -36, 'icon-cost').setScale(0.6);
    this.costText = this.add.text(-14, -36, '', textStyle(48, '#ffffff', 900)).setOrigin(1, 0.5);
    const barBg = this.add.rectangle(-206, -4, 200, 6, 0x333333).setOrigin(0, 0.5);
    this.costBar = this.add.rectangle(-206, -4, 200, 6, 0xffffff).setOrigin(0, 0.5);
    this.deployText = this.add
      .text(-230, -26, '', { ...textStyle(22, '#e6e6e6'), backgroundColor: '#000000aa', padding: { x: 12, y: 6 } })
      .setOrigin(1, 0.5);
    this.costPanel.add([cbg, cIcon, this.costText, barBg, this.costBar, this.deployText]);

    this.toast = this.add
      .text(0, 0, '', { ...textStyle(30), backgroundColor: '#000000cc', padding: { x: 20, y: 10 } })
      .setOrigin(0.5)
      .setDepth(12000)
      .setAlpha(0);
  }

  private createDeck(): void {
    // 편성에서 고른 분대가 덱 (비어 있으면 스테이지 기본 덱)
    const squad = activeSquad().filter((id) => OPERATOR_MAP[id]);
    for (const id of squad.length ? squad : this.battle.stage.deck) {
      const def = OPERATOR_MAP[id];
      const card = new DeckCard(this, def).setDepth(10100);
      card.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.onCardDown(def, p);
      });
      this.cards.push(card);
    }
  }

  /** 배치된 멤버 카드는 빼고 오른쪽 끝에 붙여 정렬 (코스트 높은 순 → 오른쪽이 낮은 코스트) */
  private layoutDeck(instant = false): void {
    const visible = this.cards.filter((c) => !this.battle.isDeployed(c.def.id)).sort((a, b) => b.def.cost - a.def.cost);
    const gap = 4;
    const n = visible.length;
    let x = this.W - 12 - CARD_W / 2 - (n - 1) * (CARD_W + gap);
    for (const card of visible) {
      card.targetX = x;
      x += CARD_W + gap;
    }
    for (const card of this.cards) {
      const show = visible.includes(card);
      card.setVisible(show);
      if (!show) continue;
      if (instant || card.x === 0) card.x = card.targetX;
      else this.tweens.add({ targets: card, x: card.targetX, duration: 160, ease: 'Quad.out' });
    }
  }

  private createInfo(): void {
    this.info = this.add.container(0, 0).setDepth(9500).setVisible(false);
    this.infoBg = this.add.graphics();
    this.infoPortrait = this.add.image(150, 560, '__DEFAULT').setAlpha(0.97);
    this.infoName = this.add.text(40, 110, '', { ...textStyle(54, '#ffffff', 900), stroke: '#000', strokeThickness: 4 });
    this.infoClass = this.add.text(42, 182, '', textStyle(24, '#dddddd'));
    this.infoStats = this.add.text(340, 250, '', { ...textStyle(24, '#ffffff', 700), lineSpacing: 14 });
    this.infoTrait = this.add.text(40, 560, '', { ...textStyle(22, '#cfcfcf', 400), wordWrap: { width: 540 }, lineSpacing: 6 });
    this.infoSkill = this.add.text(40, 630, '', { ...textStyle(22, '#ffffff', 400), wordWrap: { width: 540 }, lineSpacing: 6 });
    this.info.add([this.infoBg, this.infoPortrait, this.infoName, this.infoClass, this.infoStats, this.infoTrait, this.infoSkill]);

    // 퇴각 버튼 (멤버 왼쪽 위)
    this.retreatBtn = this.add.container(0, 0).setDepth(9600).setVisible(false);
    const rb = this.add.circle(0, 0, 40, 0x000000, 0.75).setStrokeStyle(3, 0xffffff, 0.9);
    const rx = this.add.text(0, -2, '✕', textStyle(36, '#ffffff', 900)).setOrigin(0.5);
    const rl = this.add.text(0, 56, '퇴각', { ...textStyle(20, '#ffffff'), stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.retreatBtn.add([rb, rx, rl]);
    this.retreatBtn.setSize(84, 84).setInteractive({ useHandCursor: true });
    this.retreatBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.retreatSelected();
    });

    // 스킬 버튼 (멤버 오른쪽 아래)
    this.skillBtn = this.add.container(0, 0).setDepth(9600).setVisible(false);
    const sb = this.add.circle(0, 0, 50, 0x000000, 0.8);
    this.skillArc = this.add.graphics();
    this.skillLabel = this.add.text(0, 0, '', { ...textStyle(24, '#ffffff', 900), align: 'center' }).setOrigin(0.5);
    const sl = this.add.text(0, 68, '스킬', { ...textStyle(20, '#ffffff'), stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.skillBtn.add([sb, this.skillArc, this.skillLabel, sl]);
    this.skillBtn.setSize(108, 108).setInteractive({ useHandCursor: true });
    this.skillBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.useSkillSelected();
    });
  }

  private createOverlays(): void {
    this.pauseOverlay = this.add.container(0, 0).setDepth(9000).setVisible(false);
    const pd = this.add.rectangle(0, 0, 10, 10, 0x30343a, 0.45).setOrigin(0, 0);
    const pt = this.add
      .text(0, 0, '❚❚  일시정지', { ...textStyle(64, '#ffffff', 900), stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setAlpha(0.85);
    this.pauseOverlay.add([pd, pt]);

    this.menuOverlay = this.add.container(0, 0).setDepth(15000).setVisible(false);
    const md = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
    const resume = new Button(this, 0, 0, 420, 88, '작전 계속', () => this.closeMenu(), { fontSize: 32 });
    const retry = new Button(this, 0, 0, 420, 88, '다시 하기', () => this.scene.restart({ stageId: this.stageId }), { fontSize: 32 });
    const quit = new Button(this, 0, 0, 420, 88, '작전 포기', () => this.scene.start('stages'), { fontSize: 32, fill: 0x5a1d1a });
    this.menuOverlay.add([md, resume, retry, quit]);
  }

  // ───────────────────────── 입력 ─────────────────────────

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.ended || this.menuOpen) return;
      this.onFieldDown(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));

    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-SPACE', () => this.togglePause());
    kb.on('keydown-F', () => this.toggleSpeed());
    kb.on('keydown-ESC', () => (this.menuOpen ? this.closeMenu() : this.mode.kind === 'idle' ? this.openMenu() : this.cancelMode()));
    kb.on('keydown-Q', () => this.retreatSelected());
    kb.on('keydown-E', () => this.useSkillSelected());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'].forEach((k, i) => {
      kb.on(`keydown-${k}`, () => {
        const visible = this.cards.filter((c) => c.visible).sort((a, b) => b.targetX - a.targetX);
        const card = visible[i];
        if (card) this.onCardDown(card.def, this.input.activePointer);
      });
    });
  }

  private onCardDown(def: OperatorDef, p: Phaser.Input.Pointer): void {
    if (this.ended || this.menuOpen) return;
    if (this.mode.kind === 'drag' || this.mode.kind === 'dir') this.endInteraction();
    const err = this.battle.cardError(def.id);
    if (err) {
      this.showToast(ERROR_TEXT[err] ?? '배치할 수 없습니다');
      return;
    }
    this.clearSelection();
    const ghost = new OperatorSprite(this, def).setDepth(3600).setAlpha(0.85);
    ghost.setPosition(p.x, p.y);
    ghost.setK(this.proj.project(0, this.battle.grid.rows / 2).k, this.squash);
    this.mode = { kind: 'drag', def, ghost, tile: null };
    this.cards.forEach((c) => c.setSelected(c.def === def));
    this.drawHighlights();
  }

  private onFieldDown(p: Phaser.Input.Pointer): void {
    if (this.mode.kind === 'dir') {
      this.mode.dragging = true;
      this.updateDirFromPointer(p);
      return;
    }
    const op = this.pickOp(p.x, p.y);
    if (op) this.select(op);
    else this.clearSelection();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const m = this.mode;
    if (m.kind === 'drag') {
      const t = this.pickTile(p.x, p.y);
      if (t && this.battle.canPlaceOn(m.def.id, t[0], t[1])) {
        m.tile = t;
        const f = this.tileFoot(t[0], t[1]);
        m.ghost.setPosition(f.x, f.y).setK(f.k, this.squash);
      } else {
        m.tile = null;
        m.ghost.setPosition(p.x, p.y + 40);
      }
      this.drawHighlights();
    } else if (m.kind === 'dir' && m.dragging) {
      this.updateDirFromPointer(p);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const m = this.mode;
    if (m.kind === 'drag') {
      this.onMove(p);
      if (m.tile) {
        this.mode = { kind: 'dir', def: m.def, ghost: m.ghost, tile: m.tile, dir: 'right', dragging: false };
        m.ghost.setAlpha(1);
        this.drawDial();
        this.drawHighlights();
      } else {
        this.endInteraction();
      }
    } else if (m.kind === 'dir' && m.dragging) {
      m.dragging = false;
      const f = this.tileFoot(m.tile[0], m.tile[1]);
      if (Math.hypot(p.x - f.x, p.y - (f.y - f.k * 0.4)) >= f.k * 0.45) this.confirmDeploy(m.def, m.tile, m.dir);
    }
  }

  private updateDirFromPointer(p: Phaser.Input.Pointer): void {
    const m = this.mode;
    if (m.kind !== 'dir') return;
    const f = this.tileFoot(m.tile[0], m.tile[1]);
    const cx = f.x;
    const cy = f.y - f.k * 0.4;
    if (Math.hypot(p.x - cx, p.y - cy) < 20) return;
    // 화면에서 드래그한 방향 그대로 (다이얼과 일치)
    const dir = dirFromVector(p.x - cx, p.y - cy);
    if (dir !== m.dir) {
      m.dir = dir;
      m.ghost.setDir(dir);
      this.drawHighlights();
    }
    this.drawDial();
  }

  private confirmDeploy(def: OperatorDef, tile: [number, number], dir: Dir): void {
    const op = this.battle.deploy(def.id, tile[0], tile[1], dir);
    this.endInteraction();
    if (!op) {
      this.showToast('배치할 수 없습니다');
      return;
    }
    this.layoutDeck();
    const s = this.ensureOpSprite(op);
    const y = s.y;
    s.y = y - 60;
    s.setAlpha(0);
    this.tweens.add({ targets: s, y, alpha: 1, duration: 220, ease: 'Quad.in' });
    const f = this.tileFoot(op.row, op.col);
    this.burst(f.x, f.y, def.color, f.k * 0.7);
  }

  private cancelMode(): void {
    if (this.mode.kind === 'selected') this.clearSelection();
    else this.endInteraction();
  }

  private endInteraction(): void {
    const m = this.mode;
    if (m.kind === 'drag' || m.kind === 'dir') m.ghost.destroy();
    if (m.kind !== 'selected') this.mode = { kind: 'idle' };
    this.dial.clear();
    this.dialCancel.setVisible(false);
    this.dialHint.setVisible(false);
    this.cards.forEach((c) => c.setSelected(false));
    this.drawHighlights();
  }

  private drawDial(): void {
    const m = this.mode;
    if (m.kind !== 'dir') return;
    const f = this.tileFoot(m.tile[0], m.tile[1]);
    const cx = f.x;
    const cy = f.y - f.k * 0.4;
    const R = f.k * 1.35;
    const g = this.dial;
    g.clear();
    g.fillStyle(0xffffff, 0.06).fillCircle(cx, cy, R);
    g.lineStyle(3, 0xffffff, 0.55).strokeCircle(cx, cy, R);
    const dirs: Dir[] = ['right', 'down', 'left', 'up'];
    dirs.forEach((d, i) => {
      const a = (i * Math.PI) / 2;
      const on = d === m.dir;
      if (on) {
        g.fillStyle(0xffd54a, 0.22);
        g.slice(cx, cy, R, a - Math.PI / 4, a + Math.PI / 4, false);
        g.fillPath();
      }
      const tx = cx + Math.cos(a) * R * 0.82;
      const ty = cy + Math.sin(a) * R * 0.82;
      const s = on ? 22 : 15;
      g.fillStyle(on ? 0xffd54a : 0xffffff, on ? 1 : 0.6);
      g.fillTriangle(
        tx + Math.cos(a) * s,
        ty + Math.sin(a) * s,
        tx + Math.cos(a + 2.4) * s,
        ty + Math.sin(a + 2.4) * s,
        tx + Math.cos(a - 2.4) * s,
        ty + Math.sin(a - 2.4) * s,
      );
    });
    this.dialCancel.setPosition(cx - R * 0.78, cy - R * 0.78).setVisible(true);
    this.dialHint.setPosition(cx, Math.min(cy + R + 30, this.H - CARD_H - 30)).setVisible(true);
  }

  private select(op: OpUnit): void {
    this.mode = { kind: 'selected', uid: op.uid };
    const d = op.def;
    const pt = sdPortrait(this, d);
    // 발을 기준점으로, 높이 약 380px에 맞춤
    this.infoPortrait.setTexture(pt.key).setOrigin(pt.footX / pt.width, pt.footY / pt.height).setFlipX(pt.flip);
    this.infoPortrait.setScale(Math.min(380 / pt.height, 300 / pt.width) * (pt.height === pt.width ? 1.2 : 1));
    this.infoName.setText(d.name);
    this.infoClass
      .setText(`${CLASS_INFO[d.cls].name}   ${'★'.repeat(d.rarity)}`)
      .setColor('#' + (RARITY_COLOR[d.rarity] ?? 0xffffff).toString(16).padStart(6, '0'));
    this.info.setVisible(true);
    this.refreshInfo();
    this.drawHighlights();
  }

  private refreshInfo(): void {
    if (this.mode.kind !== 'selected') return;
    const op = this.battle.opByUid(this.mode.uid);
    if (!op) {
      this.clearSelection();
      return;
    }
    const b = this.battle;
    const d = op.def;
    const sk = op.skill;
    const heal = d.damageType === 'heal';
    this.infoStats.setText(
      [
        `체력        ${Math.ceil(op.hp)} / ${op.maxHp}`,
        `${heal ? '회복력' : '공격력'}      ${Math.round(b.opAtk(op))}`,
        `방어력      ${Math.round(b.opDef(op))}`,
        `마법저항   ${d.res}`,
        `저지         ${d.block}`,
        `재배치      ${d.redeploy}초`,
      ].join('\n'),
    );
    this.infoTrait.setText(`특성  ${d.trait}`);
    const state = op.skillTime > 0 ? `발동 중 ${op.skillTime.toFixed(1)}초` : `SP ${Math.floor(op.sp)} / ${sk.spCost}`;
    this.infoSkill.setText(`◆ ${sk.name}   [${SP_TYPE_TEXT[sk.spType]} · ${sk.trigger === 'manual' ? '수동' : '자동'} 발동]\n${sk.desc}\n${state}`);

    // 멤버 주변 버튼
    const f = this.tileFoot(op.row, op.col);
    const clampX = (x: number) => Phaser.Math.Clamp(x, 60, this.W - 60);
    const clampY = (y: number) => Phaser.Math.Clamp(y, 110, this.H - CARD_H - 80);
    this.retreatBtn.setPosition(clampX(f.x - f.k * 0.85), clampY(f.y - f.k * 1.1)).setVisible(true);
    const manual = sk.trigger === 'manual';
    this.skillBtn.setPosition(clampX(f.x + f.k * 0.95), clampY(f.y - f.k * 0.15)).setVisible(manual);
    if (manual) {
      const ready = b.skillReady(op);
      const active = op.skillTime > 0;
      const ratio = active ? op.skillTime / sk.duration : op.sp / sk.spCost;
      const g = this.skillArc;
      g.clear();
      g.lineStyle(7, 0x333333, 1).strokeCircle(0, 0, 46);
      g.lineStyle(7, active ? 0xffa726 : ready ? 0xffd54a : 0x9be15d, 1);
      g.beginPath();
      g.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(ratio, 0, 1), false);
      g.strokePath();
      if (ready) {
        g.fillStyle(0xffd54a, 0.25 + 0.15 * Math.sin(this.time.now / 150));
        g.fillCircle(0, 0, 42);
      }
      this.skillLabel.setText(active ? '발동중' : ready ? '발동' : `${Math.floor(op.sp)}/${sk.spCost}`);
      this.skillLabel.setColor(ready ? '#ffd54a' : '#ffffff');
    }
  }

  private clearSelection(): void {
    if (this.mode.kind === 'selected') this.mode = { kind: 'idle' };
    this.info.setVisible(false);
    this.retreatBtn.setVisible(false);
    this.skillBtn.setVisible(false);
    this.drawHighlights();
  }

  private retreatSelected(): void {
    if (this.mode.kind !== 'selected') return;
    const uid = this.mode.uid;
    this.clearSelection();
    if (this.battle.retreat(uid)) {
      const s = this.opSprites.get(uid);
      if (s) {
        this.opSprites.delete(uid);
        this.tweens.add({ targets: s, alpha: 0, y: s.y - 50, duration: 250, onComplete: () => s.destroy() });
      }
      this.layoutDeck();
    }
  }

  private useSkillSelected(): void {
    if (this.mode.kind !== 'selected') return;
    if (this.battle.activateSkill(this.mode.uid)) this.clearSelection();
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.speedBtn.setText(this.speed === 1 ? '1X ▶' : '2X ▶▶');
  }

  private togglePause(): void {
    if (this.ended || this.menuOpen) return;
    this.paused = !this.paused;
    this.pauseBtn.setText(this.paused ? '▶' : '❚❚');
    this.pauseOverlay.setVisible(this.paused);
  }

  private openMenu(): void {
    if (this.ended) return;
    this.endInteraction();
    this.clearSelection();
    this.menuOpen = true;
    this.menuOverlay.setVisible(true);
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.menuOverlay.setVisible(false);
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 300 });
  }

  // ───────────────────────── 하이라이트 ─────────────────────────

  private drawHighlights(): void {
    if (!this.mapR) return;
    this.hl.clear();
    const m = this.mode;
    if (m.kind === 'drag') {
      const ok: [number, number][] = [];
      for (let r = 0; r < this.battle.grid.rows; r++)
        for (let c = 0; c < this.battle.grid.cols; c++) if (this.battle.canPlaceOn(m.def.id, r, c)) ok.push([r, c]);
      this.mapR.fillTiles(this.hl, ok, 0x7dffb0, 0.28, true);
      if (m.tile) this.mapR.fillTiles(this.hl, rangeTiles(m.def.range, m.tile[0], m.tile[1], 'right'), 0xffa040, 0.45);
    } else if (m.kind === 'dir') {
      this.mapR.fillTiles(this.hl, rangeTiles(m.def.range, m.tile[0], m.tile[1], m.dir), 0xffa040, 0.55, true);
    } else if (m.kind === 'selected') {
      const op = this.battle.opByUid(m.uid);
      if (op) {
        this.mapR.fillTiles(this.hl, rangeTiles(op.def.range, op.row, op.col, op.dir), 0xffa040, 0.5, true);
        this.mapR.floorRing(this.hl, op.x, op.y, this.heightAt(op.row, op.col) + 0.01, 0.5, 0xffffff, 0.9, 3);
      }
    }
  }

  // ───────────────────────── 경로 예고 ─────────────────────────

  private buildRoutePreviews(): RoutePreview[] {
    const out: RoutePreview[] = [];
    const lastShown: Record<string, number> = {};
    for (const w of [...this.battle.stage.waves].sort((a, b) => a.time - b.time)) {
      if (lastShown[w.route] !== undefined && w.time - lastShown[w.route] < 15) continue;
      lastShown[w.route] = w.time;
      out.push({ route: w.route, start: Math.max(0, w.time - ROUTE_PREVIEW), end: w.time + 1 });
    }
    return out;
  }

  private drawRoutes(): void {
    this.routeG.clear();
    const t = this.battle.time;
    for (const rp of this.routePreviews) {
      if (t < rp.start || t > rp.end) continue;
      const fadeIn = Math.min(1, (t - rp.start) / 0.4);
      const fadeOut = Math.min(1, (rp.end - t) / 0.6);
      const path: Point[] = this.battle.routes[rp.route];
      this.mapR.drawRoute(this.routeG, path, !!this.battle.stage.routes[rp.route].air, t, Math.min(fadeIn, fadeOut));
    }
  }

  // ───────────────────────── 루프 ─────────────────────────

  update(_time: number, deltaMs: number): void {
    const interacting = this.mode.kind !== 'idle';
    const scale = this.paused || this.ended || this.menuOpen ? 0 : this.speed * (interacting ? SLOW : 1);
    if (scale > 0) this.battle.update((deltaMs / 1000) * scale);

    if (this.mode.kind === 'drag' || this.mode.kind === 'dir') this.mode.ghost.tick(this.time.now);
    this.dimmer.fillAlpha = this.mode.kind === 'dir' ? 0.35 : interacting ? 0.18 : 0;
    this.syncUnits();
    this.drawRoutes();
    for (const ev of this.battle.drainEvents()) this.playEvent(ev);
    this.updateHud();
    if (this.mode.kind === 'selected') this.refreshInfo();
  }

  private ensureOpSprite(op: OpUnit): OperatorSprite {
    let s = this.opSprites.get(op.uid);
    if (!s) {
      s = new OperatorSprite(this, op.def);
      s.setDir(op.dir);
      this.opSprites.set(op.uid, s);
    }
    const f = this.tileFoot(op.row, op.col);
    s.setPosition(f.x, f.y).setK(f.k, this.squash);
    s.setDepth(1000 + op.y * 100);
    return s;
  }

  private syncUnits(): void {
    const b = this.battle;
    const t = b.time;
    const alive = new Set<number>();
    const selectedUid = this.mode.kind === 'selected' ? this.mode.uid : -1;
    for (const op of b.ops) {
      alive.add(op.uid);
      const s = this.opSprites.get(op.uid) ?? this.ensureOpSprite(op);
      s.tick(this.time.now);
      const sk = op.skill;
      s.setStatus(op.hp / op.maxHp, op.sp / sk.spCost, op.skillTime > 0, sk.duration ? op.skillTime / sk.duration : 0, b.skillReady(op), t);
      // 선택된 멤버는 어두운 필터 위로
      s.setDepth(op.uid === selectedUid ? 3550 : 1000 + op.y * 100);
    }
    for (const [uid, s] of this.opSprites) {
      if (!alive.has(uid)) {
        this.opSprites.delete(uid);
        this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
        this.layoutDeck();
      }
    }

    const aliveE = new Set<number>();
    for (const e of b.enemies) {
      aliveE.add(e.uid);
      let s = this.enemySprites.get(e.uid);
      if (!s) {
        s = new EnemySprite(this, e.def);
        s.setAlpha(0);
        this.tweens.add({ targets: s, alpha: 1, duration: 300 });
        this.enemySprites.set(e.uid, s);
      }
      const f = this.footOf(e.x, e.y, 0);
      const bob = e.blockedBy === null ? Math.abs(Math.sin(t * 9 + e.uid)) * f.k * 0.05 : 0;
      s.setPosition(f.x, f.y);
      s.setK(f.k, this.squash, bob, this.enemyFacingLeft(e));
      s.setDepth(1000 + e.y * 100 + (e.def.air ? 60 : 1));
      s.setHp(e.hp / e.maxHp);
      // 감속된 적은 푸르스름하게
      const hitUntil = this.hitFlash.get(e.uid) ?? 0;
      s.setTintState(this.time.now < hitUntil ? 'hit' : e.slowTime > 0 ? 'slow' : 'normal');
    }
    for (const [uid, s] of this.enemySprites) {
      if (!aliveE.has(uid)) {
        this.enemySprites.delete(uid);
        this.tweens.add({ targets: s, alpha: 0, duration: 250, onComplete: () => s.destroy() });
      }
    }
  }

  private enemyFacingLeft(e: EnemyUnit): boolean {
    const n = e.path[Math.min(e.next, e.path.length - 1)];
    return n.x < e.x - 0.01;
  }

  // ───────────────────────── 이펙트 ─────────────────────────

  private unitPoint(side: 'op' | 'enemy', uid: number, fallback: Point, chest = 0.45) {
    if (side === 'op') {
      const op = this.battle.opByUid(uid);
      const f = this.footOf(op?.x ?? fallback.x, op?.y ?? fallback.y);
      return { x: f.x, y: f.y - f.k * chest, k: f.k };
    }
    const e = this.battle.enemyByUid(uid);
    const f = this.footOf(e?.x ?? fallback.x, e?.y ?? fallback.y, 0);
    const lift = e?.def.air ? 0.55 : 0;
    return { x: f.x, y: f.y - f.k * (chest + lift), k: f.k };
  }

  private playEvent(ev: BattleEvent): void {
    switch (ev.type) {
      case 'hit': {
        const src = ev.side === 'op' ? 'op' : 'enemy';
        const tgt = ev.side === 'op' ? 'enemy' : 'op';
        const from = this.unitPoint(src, ev.srcUid, ev.from, 0.55);
        const to = this.unitPoint(tgt, ev.tgtUid, ev.to, 0.4);
        const color = ev.damageType === 'arts' ? 0xc77dff : ev.side === 'enemy' ? 0xff5252 : 0xfff3b0;
        if (ev.splash) {
          const shell = this.add.circle(from.x, from.y, 10, 0xffb74d).setDepth(5000);
          const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(from.x, from.y),
            new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - 120),
            new Phaser.Math.Vector2(to.x, to.y),
          );
          const tw = { t: 0 };
          this.tweens.add({
            targets: tw,
            t: 1,
            duration: 380,
            onUpdate: () => {
              const pt = curve.getPoint(tw.t);
              shell.setPosition(pt.x, pt.y);
            },
            onComplete: () => {
              shell.destroy();
              this.explosion(ev.to.x, ev.to.y, ev.splash!, to.k);
            },
          });
        } else if (ev.ranged) {
          const dot = this.add.circle(from.x, from.y, ev.damageType === 'arts' ? 9 : 5, color).setDepth(5000);
          if (ev.damageType === 'arts') dot.setStrokeStyle(3, 0xffffff, 0.8);
          this.tweens.add({
            targets: dot,
            x: to.x,
            y: to.y,
            duration: ev.damageType === 'arts' ? 220 : 140,
            onComplete: () => {
              dot.destroy();
              this.hitSpark(to.x, to.y, color);
            },
          });
        } else {
          this.slash(to.x, to.y, color, to.k);
        }
        const victim = ev.side === 'op' ? this.enemySprites.get(ev.tgtUid) : this.opSprites.get(ev.tgtUid);
        if (victim instanceof OperatorSprite) victim.rig.flash(0xffb0b0);
        else if (victim) {
          this.hitFlash.set(ev.tgtUid, this.time.now + 70);
        }
        if (ev.side === 'op') {
          this.opSprites.get(ev.srcUid)?.rig.playAttack(this.time.now);
        } else {
          const attacker = this.enemySprites.get(ev.srcUid);
          if (attacker && !ev.ranged) this.tweens.add({ targets: attacker.img, x: Math.sign(to.x - from.x) * 8, duration: 70, yoyo: true });
        }
        break;
      }
      case 'heal': {
        const to = this.unitPoint('op', ev.tgtUid, ev.to, 0.4);
        const healer = ev.srcUid !== ev.tgtUid ? this.opSprites.get(ev.srcUid) : undefined;
        if (healer && this.healAnimFrame !== this.game.loop.frame) {
          // 같은 프레임에 여러 명을 회복해도 시전 모션은 한 번만
          this.healAnimFrame = this.game.loop.frame;
          healer.rig.playAttack(this.time.now);
        }
        if (healer) {
          // 시전 순간 무기 끝(없으면 가슴)에서 대상에게 빛이 날아감
          this.time.delayedCall(200, () => {
            const tip = 'tipWorld' in healer.rig ? healer.rig.tipWorld() : null;
            const from = tip ?? this.unitPoint('op', ev.srcUid, ev.from, 0.6);
            const orb = this.add.image(from.x, from.y, 'glow').setTint(0xb58cff).setDepth(5000).setScale(0.22).setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: orb,
              x: to.x,
              y: to.y,
              duration: 260,
              ease: 'Sine.in',
              onComplete: () => orb.destroy(),
            });
          });
        }
        const landing = () => {
          const glow = this.add.image(to.x, to.y, 'glow').setTint(0x5cff9d).setDepth(5000).setScale(0.2).setAlpha(0.9);
          this.tweens.add({ targets: glow, scale: 0.6, alpha: 0, duration: 450, onComplete: () => glow.destroy() });
          for (let i = 0; i < 3; i++) {
            const plus = this.add.text(to.x + Phaser.Math.Between(-20, 20), to.y, '+', textStyle(28, '#7dffa0', 900)).setOrigin(0.5).setDepth(5001);
            this.tweens.add({ targets: plus, y: to.y - 50, alpha: 0, duration: 600, delay: i * 80, onComplete: () => plus.destroy() });
          }
        };
        if (healer) this.time.delayedCall(460, landing);
        else landing();
        break;
      }
      case 'skill': {
        const p = this.unitPoint('op', ev.uid, ev.at, 1.2);
        const op = this.battle.opByUid(ev.uid);
        const banner = this.add
          .text(p.x, p.y - 20, ev.name, { ...textStyle(26, '#ffffff', 900), backgroundColor: '#000000cc', padding: { x: 14, y: 6 } })
          .setOrigin(0.5)
          .setDepth(6000);
        this.tweens.add({ targets: banner, y: p.y - 60, alpha: 0, delay: 600, duration: 500, onComplete: () => banner.destroy() });
        const f = this.footOf(ev.at.x, ev.at.y);
        this.burst(f.x, f.y, op?.def.color ?? 0xffd54a, f.k);
        break;
      }
      case 'pulse': {
        // 보스 기믹: 보라색 충격파가 바닥을 따라 퍼진다
        const st = { t: 0 };
        const g = this.add.graphics().setDepth(4990);
        this.tweens.add({
          targets: st,
          t: 1,
          duration: 520,
          ease: 'Quad.out',
          onUpdate: () => {
            g.clear();
            this.mapR.floorRing(g, ev.at.x, ev.at.y, 0.02, ev.radius * st.t, 0xc77dff, 1 - st.t * 0.8, 8);
            this.mapR.floorRing(g, ev.at.x, ev.at.y, 0.02, ev.radius * st.t * 0.7, 0xffffff, (1 - st.t) * 0.6, 3);
          },
          onComplete: () => g.destroy(),
        });
        const p = this.unitPoint('enemy', ev.uid, ev.at, 1.6);
        const banner = this.add
          .text(p.x, p.y, ev.name, { ...textStyle(26, '#e0aaff', 900), backgroundColor: '#1a0b2ecc', padding: { x: 14, y: 6 } })
          .setOrigin(0.5)
          .setDepth(6000);
        this.tweens.add({ targets: banner, y: p.y - 40, alpha: 0, delay: 500, duration: 500, onComplete: () => banner.destroy() });
        this.cameras.main.shake(140, 0.003);
        break;
      }
      case 'leak': {
        const flash = this.add.rectangle(0, 0, this.W, this.H, 0xff0000, 0.3).setOrigin(0, 0).setDepth(9900);
        this.tweens.add({ targets: flash, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
        this.lifeText.setColor('#ff5a5a');
        this.time.delayedCall(600, () => this.lifeText.setColor('#ffffff'));
        this.cameras.main.shake(180, 0.005);
        break;
      }
      case 'opDie':
        this.showToast('멤버가 쓰러졌습니다');
        break;
      case 'end':
        this.ended = true;
        this.endInteraction();
        this.clearSelection();
        this.time.delayedCall(700, () => this.showResult(ev.result));
        break;
    }
  }

  private slash(x: number, y: number, color: number, k: number): void {
    const g = this.add.graphics().setDepth(5000);
    const a = Phaser.Math.FloatBetween(-0.9, -0.3);
    const L = k * 0.32;
    g.lineStyle(6, color, 1);
    g.lineBetween(x - Math.cos(a) * L, y - Math.sin(a) * L, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.lineStyle(2, 0xffffff, 1);
    g.lineBetween(x - Math.cos(a) * L, y - Math.sin(a) * L, x + Math.cos(a) * L, y + Math.sin(a) * L);
    this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  private hitSpark(x: number, y: number, color: number): void {
    const c = this.add.circle(x, y, 5, color, 0.9).setDepth(5000);
    this.tweens.add({ targets: c, radius: 18, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  }

  private explosion(wx: number, wy: number, radius: number, k: number): void {
    const st = { t: 0 };
    const g = this.add.graphics().setDepth(4990);
    this.tweens.add({
      targets: st,
      t: 1,
      duration: 350,
      onUpdate: () => {
        g.clear();
        this.mapR.floorRing(g, wx, wy, 0.02, radius * (0.3 + st.t * 0.7), 0xffb74d, 1 - st.t, 6);
      },
      onComplete: () => g.destroy(),
    });
    const f = this.footOf(wx, wy, 0);
    const glow = this.add.image(f.x, f.y - k * 0.2, 'glow').setTint(0xff9f43).setDepth(5001).setScale(0.3);
    this.tweens.add({ targets: glow, scale: 0.9, alpha: 0, duration: 350, onComplete: () => glow.destroy() });
  }

  private burst(x: number, y: number, color: number, size: number): void {
    const ring = this.add.ellipse(x, y, 100, 100, color, 0).setStrokeStyle(5, color).setDepth(990);
    ring.setDisplaySize(20, 20 * this.squash);
    this.tweens.add({
      targets: ring,
      displayWidth: size * 2,
      displayHeight: size * 2 * this.squash,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
  }

  private updateHud(): void {
    const b = this.battle;
    this.costText.setText(String(b.cost));
    this.costBar.scaleX = b.cost >= b.stage.maxCost ? 1 : b.costProgress;
    this.deployText.setText(`배치 가능 인원  ${b.stage.maxDeploy - b.deployedCount}`);
    this.killText.setText(`${b.killed + b.leaked}/${b.totalEnemies}`);
    this.lifeText.setText(String(b.life));
    const boss = b.enemies.find((e) => e.def.boss);
    this.bossBar.setVisible(!!boss);
    if (boss) {
      this.bossName.setText(`${boss.def.name}${boss.hp <= boss.maxHp / 2 ? '  · 격노' : ''}`);
      this.bossFill.scaleX = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
      this.bossFill.fillColor = boss.hp <= boss.maxHp / 2 ? 0xff4c6a : 0xb04cff;
    }
    for (const card of this.cards) {
      if (card.visible) card.refresh(b.cardError(card.def.id), b.cooldowns[card.def.id] ?? 0);
    }
  }

  // ───────────────────────── 결과 ─────────────────────────

  private showResult(result: 'won' | 'lost'): void {
    const b = this.battle;
    const { W, H } = this;
    const won = result === 'won';
    const stars = !won ? 0 : b.life === b.maxLife ? 3 : 2;
    const layer = this.add.container(0, 0).setDepth(20000);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0, 0).setInteractive();
    const band = this.add.graphics();
    band.fillStyle(won ? 0x000000 : 0x2a0000, 0.85);
    band.fillPoints(
      [new Phaser.Math.Vector2(0, H * 0.28), new Phaser.Math.Vector2(W, H * 0.22), new Phaser.Math.Vector2(W, H * 0.6), new Phaser.Math.Vector2(0, H * 0.66)],
      true,
    );
    band.fillStyle(won ? 0xffd54a : 0xe0413a, 1);
    band.fillRect(0, H * 0.28 - 6, W * 0.42, 6);
    const head = this.add.text(120, H * 0.32, won ? '작전 종료' : '작전 실패', textStyle(110, won ? '#ffffff' : '#ff6b6b', 900));
    const sub = this.add.text(128, H * 0.32 + 130, won ? 'MISSION COMPLETE' : 'MISSION FAILED', textStyle(30, won ? '#ffd54a' : '#ff9a9a', 700));
    const starText = this.add
      .text(W - 120, H * 0.36, won ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '', textStyle(96, '#ffd54a', 900))
      .setOrigin(1, 0);
    const stat = this.add
      .text(W - 120, H * 0.36 + 120, `처치 ${b.killed}/${b.totalEnemies}  ·  방어점 ${b.life}/${b.maxLife}  ·  ${Math.floor(b.time)}초`, textStyle(28, '#cccccc'))
      .setOrigin(1, 0);
    // 기록 저장 + 다음 스테이지
    const newBest = won ? recordClear(this.stageId, stars) : false;
    const next = won ? nextStageId(this.stageId) : null;
    if (newBest) stat.setText(stat.text + '  ·  최고 기록!');
    const btns: Button[] = [];
    const bw = 300;
    const defs: [string, () => void, object][] = [
      ['다시 하기', () => this.scene.restart({ stageId: this.stageId }), { fontSize: 30 }],
      ['작전 목록', () => this.scene.start('stages'), { fontSize: 30 }],
    ];
    if (next) {
      defs.push([
        '다음 작전 ▶',
        () => {
          loadSave().lastStage = next;
          writeSave();
          this.scene.start('stages');
        },
        { fontSize: 30, fill: 0x7a5c12, stroke: COLORS.accent },
      ]);
    }
    defs.forEach(([label, fn, o], i) => {
      btns.push(new Button(this, W / 2 + (i - (defs.length - 1) / 2) * (bw + 24), H * 0.8, bw, 90, label, fn, o));
    });
    const [retry, back] = [btns[0], btns.slice(1)];
    layer.add([dim, band, head, sub, starText, stat, retry, ...back]);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 300 });
    head.x -= 80;
    this.tweens.add({ targets: head, x: head.x + 80, duration: 450, ease: 'Cubic.out' });
  }
}
