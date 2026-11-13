import Phaser from 'phaser';
import { Battle, type BattleEvent, type DeployError, type OpUnit } from '../../battle/sim';
import { tileAt } from '../../battle/grid';
import { ENEMY_MAP } from '../../data/enemies';
import { CLASS_INFO, OPERATOR_MAP } from '../../data/operators';
import { dirFromVector, rangeTiles } from '../../data/ranges';
import { STAGE_MAP } from '../../data/stages';
import type { Dir, OperatorDef } from '../../data/types';
import { Button } from '../../ui/button';
import { COLORS, GAME_H, GAME_W, textStyle } from '../../ui/theme';
import { CARD_H, CARD_W, DeckCard } from './DeckCard';
import { EnemyView, OperatorView } from './views';

/** 고지대가 위로 솟아 보이는 높이(px) */
const LIFT = 12;
/** 조작 중(드래그·방향 선택·선택) 시간 흐름 비율 */
const SLOW = 0.2;

type Mode =
  | { kind: 'idle' }
  | { kind: 'drag'; def: OperatorDef; ghost: OperatorView; tile: [number, number] | null }
  | { kind: 'dir'; def: OperatorDef; ghost: OperatorView; tile: [number, number]; dir: Dir; dragging: boolean }
  | { kind: 'selected'; uid: number };

const ERROR_TEXT: Partial<Record<DeployError, string>> = {
  cost: '코스트가 부족합니다',
  cooldown: '재배치 대기 중입니다',
  limit: '배치 인원이 가득 찼습니다',
};

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private stageId = '0-1';
  private tile = 112;
  private ox = 0;
  private oy = 0;

  private mode: Mode = { kind: 'idle' };
  private speed = 1;
  private paused = false;
  private ended = false;

  private opViews = new Map<number, OperatorView>();
  private enemyViews = new Map<number, EnemyView>();
  private cards: DeckCard[] = [];

  private hl!: Phaser.GameObjects.Graphics;
  private dial!: Phaser.GameObjects.Container;
  private infoPanel!: Phaser.GameObjects.Container;
  private infoText!: Phaser.GameObjects.Text;
  private infoTitle!: Phaser.GameObjects.Text;
  private retreatBtn!: Button;
  private costText!: Phaser.GameObjects.Text;
  private costBar!: Phaser.GameObjects.Rectangle;
  private deployText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private lifeText!: Phaser.GameObjects.Text;
  private speedBtn!: Button;
  private pauseBtn!: Button;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('battle');
  }

  init(data: { stageId?: string }): void {
    this.stageId = data.stageId ?? '0-1';
    this.mode = { kind: 'idle' };
    this.speed = 1;
    this.paused = false;
    this.ended = false;
    this.opViews.clear();
    this.enemyViews.clear();
    this.cards = [];
  }

  create(): void {
    const stage = STAGE_MAP[this.stageId];
    this.battle = new Battle(stage, OPERATOR_MAP, ENEMY_MAP);
    const { rows, cols } = this.battle.grid;
    this.tile = Math.floor(Math.min(1500 / cols, 790 / rows, 120));
    this.ox = Math.round((GAME_W - cols * this.tile) / 2);
    this.oy = 88 + Math.round((790 - rows * this.tile) / 2);

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.drawMap();
    this.hl = this.add.graphics().setDepth(50);
    this.createHud();
    this.createDeck();
    this.createDial();
    this.createInfoPanel();
    this.createPauseOverlay();
    this.bindInput();
  }

  // ───────────────────────── 좌표 ─────────────────────────

  private tileCenter(r: number, c: number): { x: number; y: number } {
    const t = tileAt(this.battle.grid, r, c);
    const lift = t === 'high' || t === 'highBlocked' ? LIFT : 0;
    return { x: this.ox + (c + 0.5) * this.tile, y: this.oy + (r + 0.5) * this.tile - lift };
  }

  /** 시뮬레이션 좌표(타일 단위) → 화면 좌표 */
  private toScreen(x: number, y: number): { x: number; y: number } {
    const t = tileAt(this.battle.grid, Math.floor(y), Math.floor(x));
    const lift = t === 'high' || t === 'highBlocked' ? LIFT : 0;
    return { x: this.ox + x * this.tile, y: this.oy + y * this.tile - lift };
  }

  private pointerTile(px: number, py: number): [number, number] | null {
    const c = Math.floor((px - this.ox) / this.tile);
    let r = Math.floor((py - this.oy) / this.tile);
    // 고지대는 위로 솟아 있으니 살짝 보정
    const below = tileAt(this.battle.grid, r + 1, c);
    if ((below === 'high' || below === 'highBlocked') && (py - this.oy) % this.tile > this.tile - LIFT) r += 1;
    if (r < 0 || c < 0 || r >= this.battle.grid.rows || c >= this.battle.grid.cols) return null;
    return [r, c];
  }

  // ───────────────────────── 맵 ─────────────────────────

  private drawMap(): void {
    const g = this.make.graphics({}, false);
    const T = this.tile;
    const { rows, cols, tiles } = this.battle.grid;
    // 바닥 그림자 판
    g.fillStyle(0x0b0c0e, 1);
    g.fillRoundedRect(this.ox - 14, this.oy - 14 - LIFT, cols * T + 28, rows * T + 28 + LIFT, 12);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        const x = this.ox + c * T;
        const y = this.oy + r * T;
        switch (t) {
          case 'wall':
            g.fillStyle(0x24272c, 1).fillRect(x, y, T, T);
            g.lineStyle(1, 0x1b1d21, 1).strokeRect(x, y, T, T);
            break;
          case 'ground':
          case 'road':
          case 'spawn':
          case 'goal': {
            g.fillStyle(t === 'road' ? 0x4e535a : 0x6a7078, 1).fillRect(x + 1, y + 1, T - 2, T - 2);
            g.fillStyle(0xffffff, 0.04).fillRect(x + 1, y + 1, T - 2, 6);
            if (t === 'road') {
              g.lineStyle(2, 0x3c4046, 1);
              for (let k = 12; k < T; k += 22) g.lineBetween(x + k, y + 4, x + k - 10, y + T - 4);
            }
            break;
          }
          case 'high':
          case 'highBlocked': {
            g.fillStyle(0x3b4047, 1).fillRect(x + 1, y + T - LIFT, T - 2, LIFT);
            g.fillStyle(t === 'high' ? 0xa4acb5 : 0x7d848c, 1).fillRect(x + 1, y + 1 - LIFT, T - 2, T - 2);
            g.lineStyle(2, 0xc8d0d8, 0.6).strokeRect(x + 4, y + 4 - LIFT, T - 8, T - 8);
            break;
          }
        }
        if (t === 'spawn' || t === 'goal') {
          const col = t === 'spawn' ? 0xe0524a : 0x3d8bfd;
          g.fillStyle(col, 0.35).fillRect(x + 1, y + 1, T - 2, T - 2);
          g.lineStyle(4, col, 1).strokeRect(x + 6, y + 6, T - 12, T - 12);
          this.add
            .text(x + T / 2, y + T / 2, t === 'spawn' ? '!' : '◆', { ...textStyle(46, '#ffffff', 900), stroke: '#000', strokeThickness: 5 })
            .setOrigin(0.5)
            .setDepth(1);
        }
      }
    }
    // 매 프레임 다시 그리지 않도록 한 장의 텍스처로 굽는다
    const key = `map-${this.battle.stage.id}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    g.generateTexture(key, GAME_W, GAME_H);
    g.destroy();
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  // ───────────────────────── HUD ─────────────────────────

  private createHud(): void {
    const top = this.add.rectangle(0, 0, GAME_W, 72, 0x000000, 0.55).setOrigin(0, 0).setDepth(9000);
    top.setInteractive(); // 지도 클릭이 HUD 아래로 새지 않게
    const stage = this.battle.stage;
    this.add.text(28, 36, `${stage.id}  ${stage.name}`, textStyle(28)).setOrigin(0, 0.5).setDepth(9001);
    this.killText = this.add.text(GAME_W / 2 - 40, 36, '', textStyle(30)).setOrigin(1, 0.5).setDepth(9001);
    this.lifeText = this.add.text(GAME_W / 2 + 40, 36, '', textStyle(30, '#ff8c8c')).setOrigin(0, 0.5).setDepth(9001);
    this.speedBtn = new Button(this, GAME_W - 190, 36, 110, 52, '1x ▶', () => this.toggleSpeed(), { fontSize: 26 }).setDepth(9001);
    this.pauseBtn = new Button(this, GAME_W - 66, 36, 90, 52, '❚❚', () => this.togglePause(), { fontSize: 26 }).setDepth(9001);

    // 코스트 & 배치 수 (왼쪽 아래)
    const baseY = GAME_H - CARD_H / 2 - 14;
    const box = this.add.graphics().setDepth(9000);
    box.fillStyle(0x000000, 0.6).fillRoundedRect(20, baseY - 70, 280, 140, 14);
    this.add.text(44, baseY - 46, '코스트', textStyle(22, COLORS.textDim)).setOrigin(0, 0.5).setDepth(9001);
    this.costText = this.add.text(276, baseY - 6, '', textStyle(64, COLORS.accentText, 900)).setOrigin(1, 0.5).setDepth(9001);
    this.add.rectangle(44, baseY + 34, 232, 10, 0x333333).setOrigin(0, 0.5).setDepth(9001);
    this.costBar = this.add.rectangle(44, baseY + 34, 232, 10, COLORS.accent).setOrigin(0, 0.5).setDepth(9002);
    this.deployText = this.add.text(44, baseY - 6, '', textStyle(22, COLORS.textDim)).setOrigin(0, 0.5).setDepth(9001);

    this.toast = this.add
      .text(GAME_W / 2, GAME_H - CARD_H - 60, '', { ...textStyle(30), backgroundColor: '#000000aa', padding: { x: 18, y: 8 } })
      .setOrigin(0.5)
      .setDepth(9500)
      .setAlpha(0);
  }

  private createDeck(): void {
    const defs = this.battle.stage.deck.map((id) => OPERATOR_MAP[id]);
    const y = GAME_H - CARD_H / 2 - 14;
    for (const def of defs) {
      const card = new DeckCard(this, 0, y, def).setDepth(9100);
      card.baseY = y;
      card.on('pointerdown', (p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.onCardDown(def, p);
      });
      this.cards.push(card);
    }
    this.layoutDeck(true);
  }

  /** 배치된 멤버 카드는 숨기고 나머지를 오른쪽 정렬 */
  private layoutDeck(instant = false): void {
    const visible = this.cards.filter((c) => !this.battle.isDeployed(c.def.id));
    const gap = 8;
    let x = GAME_W - 24 - CARD_W / 2;
    for (const card of [...visible].reverse()) {
      card.targetX = x;
      x -= CARD_W + gap;
    }
    for (const card of this.cards) {
      const show = visible.includes(card);
      card.setVisible(show);
      if (!show) continue;
      if (instant) card.x = card.targetX;
      else this.tweens.add({ targets: card, x: card.targetX, duration: 160, ease: 'Quad.out' });
    }
  }

  private createDial(): void {
    this.dial = this.add.container(0, 0).setDepth(8000).setVisible(false);
    const ring = this.add.circle(0, 0, 150, 0xffffff, 0.08).setStrokeStyle(3, 0xffffff, 0.5);
    const arrows = (['right', 'down', 'left', 'up'] as Dir[]).map((d, i) => {
      const a = (i * Math.PI) / 2;
      return this.add.triangle(Math.cos(a) * 120, Math.sin(a) * 120, 0, -16, 0, 16, 24, 0, 0xffffff, 0.75).setRotation(a).setName(d);
    });
    const hint = this.add
      .text(0, 182, '드래그해서 방향 선택', { ...textStyle(24), stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5);
    const cancel = new Button(this, 128, -128, 56, 56, '✕', () => this.cancelMode(), { fill: COLORS.danger, fontSize: 28, radius: 28 });
    this.dial.add([ring, ...arrows, hint, cancel]);
  }

  private createInfoPanel(): void {
    this.infoPanel = this.add.container(24, 96).setDepth(9200).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.75).fillRoundedRect(0, 0, 340, 330, 14);
    bg.lineStyle(2, COLORS.line).strokeRoundedRect(0, 0, 340, 330, 14);
    this.infoTitle = this.add.text(20, 18, '', textStyle(32));
    this.infoText = this.add.text(20, 70, '', { ...textStyle(22, COLORS.text, 400), lineSpacing: 8, wordWrap: { width: 300 } });
    this.infoPanel.add([bg, this.infoTitle, this.infoText]);
    this.retreatBtn = new Button(this, 0, 0, 96, 96, '퇴각', () => this.retreatSelected(), {
      fill: COLORS.danger,
      fontSize: 26,
      radius: 48,
    })
      .setDepth(9300)
      .setVisible(false);
  }

  private createPauseOverlay(): void {
    this.pauseOverlay = this.add.container(GAME_W / 2, 140).setDepth(8500).setVisible(false);
    const t = this.add
      .text(0, 0, '일시정지 중  (배치는 가능)', { ...textStyle(30), backgroundColor: '#000000aa', padding: { x: 18, y: 8 } })
      .setOrigin(0.5);
    this.pauseOverlay.add(t);
  }

  // ───────────────────────── 입력 ─────────────────────────

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.ended) return;
      this.onFieldDown(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));

    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-SPACE', () => this.togglePause());
      kb.on('keydown-F', () => this.toggleSpeed());
      kb.on('keydown-ESC', () => this.cancelMode());
      kb.on('keydown-Q', () => this.retreatSelected());
      for (let i = 1; i <= 9; i++) {
        kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][i - 1]}`, () => {
          const visible = this.cards.filter((c) => c.visible);
          const card = visible[visible.length - i];
          if (card) this.onCardDown(card.def, this.input.activePointer);
        });
      }
    }
  }

  private onCardDown(def: OperatorDef, p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    if (this.mode.kind === 'drag' || this.mode.kind === 'dir') this.cancelMode();
    const err = this.battle.cardError(def.id);
    if (err) {
      this.showToast(ERROR_TEXT[err] ?? '배치할 수 없습니다');
      return;
    }
    this.clearSelection();
    const ghost = new OperatorView(this, p.x, p.y, def, this.tile * 0.34).setDepth(8100).setAlpha(0.85);
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
    const t = this.pointerTile(p.x, p.y);
    const op = t ? this.battle.opAt(t[0], t[1]) : undefined;
    if (op) this.select(op);
    else this.clearSelection();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const m = this.mode;
    if (m.kind === 'drag') {
      const t = this.pointerTile(p.x, p.y);
      if (t && this.battle.canPlaceOn(m.def.id, t[0], t[1])) {
        m.tile = t;
        const c = this.tileCenter(t[0], t[1]);
        m.ghost.setPosition(c.x, c.y - 8);
      } else {
        m.tile = null;
        m.ghost.setPosition(p.x, p.y - 40);
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
        const c = this.tileCenter(m.tile[0], m.tile[1]);
        this.dial.setPosition(c.x, c.y).setVisible(true);
        this.updateDialArrows('right');
        this.drawHighlights();
      } else {
        this.cancelMode();
      }
    } else if (m.kind === 'dir' && m.dragging) {
      m.dragging = false;
      const c = this.tileCenter(m.tile[0], m.tile[1]);
      const dist = Math.hypot(p.x - c.x, p.y - c.y);
      if (dist >= 50) {
        this.confirmDeploy(m.def, m.tile, m.dir);
      } else if (dist < 20) {
        // 제자리 탭은 무시 (방향 선택 대기 유지)
      }
    }
  }

  private updateDirFromPointer(p: Phaser.Input.Pointer): void {
    const m = this.mode;
    if (m.kind !== 'dir') return;
    const c = this.tileCenter(m.tile[0], m.tile[1]);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (Math.hypot(dx, dy) < 25) return;
    m.dir = dirFromVector(dx, dy);
    m.ghost.setDir(m.dir);
    this.updateDialArrows(m.dir);
    this.drawHighlights();
  }

  private updateDialArrows(dir: Dir): void {
    for (const obj of this.dial.list) {
      if (obj instanceof Phaser.GameObjects.Triangle) {
        obj.setFillStyle(obj.name === dir ? COLORS.accent : 0xffffff, obj.name === dir ? 1 : 0.5);
        obj.setScale(obj.name === dir ? 1.3 : 1);
      }
    }
  }

  private confirmDeploy(def: OperatorDef, tile: [number, number], dir: Dir): void {
    const op = this.battle.deploy(def.id, tile[0], tile[1], dir);
    this.endInteraction();
    if (!op) {
      this.showToast('배치할 수 없습니다');
      return;
    }
    this.layoutDeck();
    const view = this.ensureOpView(op);
    view.setScale(1.4).setAlpha(0);
    this.tweens.add({ targets: view, scale: 1, alpha: 1, duration: 180, ease: 'Back.out' });
    const c = this.tileCenter(op.row, op.col);
    const ring = this.add.circle(c.x, c.y, 20, def.color, 0).setStrokeStyle(5, def.color).setDepth(7000);
    this.tweens.add({ targets: ring, radius: 70, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
  }

  private cancelMode(): void {
    if (this.mode.kind === 'selected') {
      this.clearSelection();
      return;
    }
    this.endInteraction();
  }

  private endInteraction(): void {
    const m = this.mode;
    if (m.kind === 'drag' || m.kind === 'dir') m.ghost.destroy();
    this.mode = { kind: 'idle' };
    this.dial.setVisible(false);
    this.cards.forEach((c) => c.setSelected(false));
    this.drawHighlights();
  }

  private select(op: OpUnit): void {
    this.mode = { kind: 'selected', uid: op.uid };
    const d = op.def;
    this.infoTitle.setText(d.name);
    this.infoPanel.setVisible(true);
    const c = this.tileCenter(op.row, op.col);
    const bx = c.x + (c.x > GAME_W - 300 ? -90 : 90);
    this.retreatBtn.setPosition(bx, c.y - 70).setVisible(true);
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
    const d = op.def;
    this.infoText.setText(
      [
        `${'★'.repeat(d.rarity)}  ${CLASS_INFO[d.cls].name}`,
        `체력  ${Math.ceil(op.hp)} / ${op.maxHp}`,
        `${d.damageType === 'heal' ? '회복량' : '공격력'}  ${d.atk}   방어력  ${d.def}`,
        `마법저항  ${d.res}   저지  ${d.block}`,
        `퇴각 시 코스트 +${Math.floor(d.cost / 2)}`,
        d.trait,
      ].join('\n'),
    );
  }

  private clearSelection(): void {
    if (this.mode.kind === 'selected') this.mode = { kind: 'idle' };
    this.infoPanel.setVisible(false);
    this.retreatBtn.setVisible(false);
    this.drawHighlights();
  }

  private retreatSelected(): void {
    if (this.mode.kind !== 'selected') return;
    const uid = this.mode.uid;
    this.clearSelection();
    if (this.battle.retreat(uid)) {
      const v = this.opViews.get(uid);
      if (v) {
        this.opViews.delete(uid);
        this.tweens.add({ targets: v, alpha: 0, y: v.y - 30, duration: 250, onComplete: () => v.destroy() });
      }
      this.layoutDeck();
    }
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.speedBtn.setText(this.speed === 1 ? '1x ▶' : '2x ▶▶').setFill(this.speed === 2 ? 0x7a5c12 : COLORS.panelLight);
  }

  private togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
    this.pauseBtn.setText(this.paused ? '▶' : '❚❚');
    this.pauseOverlay.setVisible(this.paused);
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 300 });
  }

  // ───────────────────────── 하이라이트 ─────────────────────────

  private fillTiles(tiles: [number, number][], color: number, alpha: number, stroke = false): void {
    const T = this.tile;
    for (const [r, c] of tiles) {
      const t = tileAt(this.battle.grid, r, c);
      if (!t || t === 'wall') continue;
      const lift = t === 'high' || t === 'highBlocked' ? LIFT : 0;
      const x = this.ox + c * T;
      const y = this.oy + r * T - lift;
      this.hl.fillStyle(color, alpha).fillRect(x + 3, y + 3, T - 6, T - 6);
      if (stroke) this.hl.lineStyle(3, color, 0.9).strokeRect(x + 5, y + 5, T - 10, T - 10);
    }
  }

  private drawHighlights(): void {
    this.hl.clear();
    const m = this.mode;
    if (m.kind === 'drag') {
      const ok: [number, number][] = [];
      for (let r = 0; r < this.battle.grid.rows; r++)
        for (let c = 0; c < this.battle.grid.cols; c++) if (this.battle.canPlaceOn(m.def.id, r, c)) ok.push([r, c]);
      this.fillTiles(ok, COLORS.ok, 0.22, true);
      if (m.tile) this.fillTiles(rangeTiles(m.def.range, m.tile[0], m.tile[1], 'right'), 0xff9f43, 0.35);
    } else if (m.kind === 'dir') {
      this.fillTiles(rangeTiles(m.def.range, m.tile[0], m.tile[1], m.dir), 0xff9f43, 0.45, true);
    } else if (m.kind === 'selected') {
      const op = this.battle.opByUid(m.uid);
      if (op) this.fillTiles(rangeTiles(op.def.range, op.row, op.col, op.dir), 0xff9f43, 0.4, true);
    }
  }

  // ───────────────────────── 루프 ─────────────────────────

  update(_time: number, deltaMs: number): void {
    const interacting = this.mode.kind !== 'idle';
    const scale = this.paused || this.ended ? 0 : this.speed * (interacting ? SLOW : 1);
    if (scale > 0) this.battle.update((deltaMs / 1000) * scale);

    this.syncUnits();
    for (const ev of this.battle.drainEvents()) this.playEvent(ev);
    this.updateHud();
    if (this.mode.kind === 'selected') this.refreshInfo();
  }

  private ensureOpView(op: OpUnit): OperatorView {
    let v = this.opViews.get(op.uid);
    if (!v) {
      const c = this.tileCenter(op.row, op.col);
      v = new OperatorView(this, c.x, c.y - 8, op.def, this.tile * 0.34);
      v.setDir(op.dir);
      v.setDepth(100 + c.y);
      this.opViews.set(op.uid, v);
    }
    return v;
  }

  private syncUnits(): void {
    const alive = new Set<number>();
    for (const op of this.battle.ops) {
      alive.add(op.uid);
      const v = this.ensureOpView(op);
      v.setHp(op.hp / op.maxHp);
      v.showHp(op.hp < op.maxHp);
    }
    for (const [uid, v] of this.opViews) {
      if (!alive.has(uid)) {
        this.opViews.delete(uid);
        this.tweens.add({ targets: v, alpha: 0, scale: 0.6, duration: 300, onComplete: () => v.destroy() });
        this.layoutDeck();
      }
    }

    const aliveE = new Set<number>();
    for (const e of this.battle.enemies) {
      aliveE.add(e.uid);
      const s = this.toScreen(e.x, e.y);
      let v = this.enemyViews.get(e.uid);
      if (!v) {
        v = new EnemyView(this, s.x, s.y, e.def, this.tile / 112);
        v.setAlpha(0);
        this.tweens.add({ targets: v, alpha: 1, duration: 250 });
        this.enemyViews.set(e.uid, v);
      }
      // 걷는 느낌의 통통 튀기
      const bob = e.blockedBy === null ? Math.abs(Math.sin(this.battle.time * 8 + e.uid)) * 5 : 0;
      v.setPosition(s.x, s.y);
      v.sprite.y = (e.def.air ? -30 * (this.tile / 112) : 0) - bob;
      v.setDepth(100 + s.y + (e.def.air ? 400 : 0));
      v.setHp(e.hp / e.maxHp);
    }
    for (const [uid, v] of this.enemyViews) {
      if (!aliveE.has(uid)) {
        this.enemyViews.delete(uid);
        this.tweens.add({ targets: v, alpha: 0, scale: 0.4, duration: 250, onComplete: () => v.destroy() });
      }
    }
  }

  private playEvent(ev: BattleEvent): void {
    switch (ev.type) {
      case 'hit': {
        const from = this.toScreen(ev.from.x, ev.from.y);
        const to = this.toScreen(ev.to.x, ev.to.y);
        to.y -= 12;
        const color = ev.damageType === 'arts' ? 0xc77dff : ev.side === 'enemy' ? 0xff5252 : 0xfff3b0;
        const showNumber = () => this.floatText(to.x, to.y - 20, String(ev.amount), ev.damageType === 'arts' ? '#e0aaff' : ev.side === 'enemy' ? '#ff8080' : '#ffffff');
        if (ev.ranged && !ev.splash) {
          const dot = this.add.circle(from.x, from.y - 10, ev.damageType === 'arts' ? 10 : 6, color).setDepth(7000);
          this.tweens.add({
            targets: dot,
            x: to.x,
            y: to.y,
            duration: 160,
            onComplete: () => {
              dot.destroy();
              this.hitSpark(to.x, to.y, color);
              showNumber();
            },
          });
        } else if (ev.splash) {
          const shell = this.add.circle(from.x, from.y - 10, 12, 0xff9f43).setDepth(7000);
          this.tweens.add({
            targets: shell,
            x: to.x,
            y: to.y,
            duration: 260,
            ease: 'Quad.in',
            onComplete: () => {
              shell.destroy();
              const boom = this.add.circle(to.x, to.y, 10, 0xff9f43, 0.6).setDepth(7000);
              this.tweens.add({ targets: boom, radius: ev.splash! * this.tile, alpha: 0, duration: 300, onComplete: () => boom.destroy() });
              showNumber();
            },
          });
        } else {
          this.slash(to.x, to.y, color);
          showNumber();
        }
        // 맞은 유닛 번쩍
        const v = ev.side === 'op' ? this.enemyViews.get(ev.tgtUid) : this.opViews.get(ev.tgtUid);
        if (v) {
          this.tweens.add({ targets: v, alpha: 0.55, duration: 60, yoyo: true });
        }
        // 공격자 반동
        const a = ev.side === 'op' ? this.opViews.get(ev.srcUid) : this.enemyViews.get(ev.srcUid);
        if (a && !ev.ranged) {
          const dx = Math.sign(to.x - from.x) * 10;
          const dy = Math.sign(to.y - from.y) * 10;
          this.tweens.add({ targets: a, x: a.x + dx, y: a.y + dy, duration: 70, yoyo: true });
        }
        break;
      }
      case 'heal': {
        const to = this.toScreen(ev.to.x, ev.to.y);
        const ring = this.add.circle(to.x, to.y - 8, 16, 0x58f08a, 0).setStrokeStyle(4, 0x58f08a).setDepth(7000);
        this.tweens.add({ targets: ring, radius: 48, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
        this.floatText(to.x, to.y - 40, `+${ev.amount}`, '#7dffa0');
        break;
      }
      case 'leak': {
        const s = this.toScreen(ev.at.x, ev.at.y);
        const flash = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff0000, 0.25).setDepth(9900);
        this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
        this.floatText(s.x, s.y - 50, '방송 체력 -1', '#ff6b6b', 34);
        this.cameras.main.shake(180, 0.006);
        break;
      }
      case 'opDie':
        this.showToast('멤버가 쓰러졌습니다');
        break;
      case 'end':
        this.time.delayedCall(600, () => this.showResult(ev.result));
        this.ended = true;
        this.endInteraction();
        this.clearSelection();
        break;
    }
  }

  private slash(x: number, y: number, color: number): void {
    const g = this.add.graphics().setDepth(7000);
    g.lineStyle(5, color, 1);
    const a = Math.random() * Math.PI;
    g.lineBetween(x - Math.cos(a) * 26, y - Math.sin(a) * 26, x + Math.cos(a) * 26, y + Math.sin(a) * 26);
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  private hitSpark(x: number, y: number, color: number): void {
    const c = this.add.circle(x, y, 6, color, 0.9).setDepth(7000);
    this.tweens.add({ targets: c, radius: 20, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 24): void {
    const t = this.add
      .text(x + Phaser.Math.Between(-10, 10), y, text, { ...textStyle(size, color, 900), stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(7500);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 650, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  private updateHud(): void {
    const b = this.battle;
    this.costText.setText(String(b.cost));
    this.costBar.scaleX = b.cost >= b.stage.maxCost ? 1 : b.costProgress;
    this.deployText.setText(`배치 ${b.deployedCount}/${b.stage.maxDeploy}`);
    this.killText.setText(`처치 ${b.killed + b.leaked} / ${b.totalEnemies}`);
    this.lifeText.setText(`♥ ${b.life}`);
    for (const card of this.cards) {
      if (!card.visible) continue;
      card.refresh(b.cardError(card.def.id), b.cooldowns[card.def.id] ?? 0);
    }
  }

  // ───────────────────────── 결과 ─────────────────────────

  private showResult(result: 'won' | 'lost'): void {
    const b = this.battle;
    const layer = this.add.container(0, 0).setDepth(20000);
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const won = result === 'won';
    const stars = !won ? 0 : b.life === b.maxLife ? 3 : 2;
    const title = this.add
      .text(GAME_W / 2, 330, won ? '작전 성공' : '작전 실패', textStyle(96, won ? COLORS.accentText : '#ff6b6b', 900))
      .setOrigin(0.5);
    const starText = this.add
      .text(GAME_W / 2, 450, won ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '', textStyle(80, '#ffe27a', 900))
      .setOrigin(0.5);
    const info = this.add
      .text(GAME_W / 2, 560, `처치 ${b.killed} / ${b.totalEnemies}   ·   방송 체력 ${b.life} / ${b.maxLife}   ·   ${Math.floor(b.time)}초`, textStyle(30, COLORS.textDim))
      .setOrigin(0.5);
    const retry = new Button(this, GAME_W / 2 - 170, 700, 300, 90, '다시 하기', () => this.scene.restart({ stageId: this.stageId }), {
      fill: 0x3a5f2a,
      fontSize: 32,
    });
    const back = new Button(this, GAME_W / 2 + 170, 700, 300, 90, '타이틀로', () => this.scene.start('title'), { fontSize: 32 });
    layer.add([dim, title, starText, info, retry, back]);
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 300 });
    title.setScale(1.4);
    this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.out' });
  }
}
