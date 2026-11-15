/**
 * 작전(스테이지) 선택 화면.
 *  왼쪽: 스테이지 노드 지도 (지그재그로 이어진 길, 별 기록, 잠금)
 *  오른쪽: 고른 스테이지 정보 (설명, 미니맵, 등장 적, 추천 편성) + 편성 / 작전 개시
 */
import Phaser from 'phaser';
import { ENEMY_MAP } from '../data/enemies';
import { OPERATOR_MAP } from '../data/operators';
import { activeSquad, isUnlocked, loadSave, writeSave } from '../data/save';
import { STAGE_MAP, STAGES } from '../data/stages';
import type { EnemyDef, StageDef } from '../data/types';
import { sdPortrait } from '../sd/factory';
import { Button } from '../ui/button';
import { textStyle } from '../ui/theme';
import { ensureEnemyTexture } from './battle/textures';

const YELLOW = 0xf6c12c;
const YELLOW_S = '#f6c12c';
const SLANT = 18;
const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

const TILE_COLOR: Record<string, number> = {
  '#': 0x23262c,
  '.': 0x5d646d,
  _: 0x474c53,
  h: 0xb5bdc6,
  H: 0x8a919a,
  R: 0xe0413a,
  B: 0x2f80ed,
};

export class StageScene extends Phaser.Scene {
  private u = 1;
  private W = 1920;
  private H = 1080;
  private selected = '0-1';
  private root!: Phaser.GameObjects.Container;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('stages');
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.u = this.H / 1080;
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    const last = loadSave().lastStage;
    this.selected = isUnlocked(last) ? last : STAGES[0].id;

    this.drawBackground();
    this.root = this.add.container(0, 0);
    this.toast = this.add
      .text(this.W / 2, this.H - 150 * this.u, '', { ...textStyle(Math.round(26 * this.u), '#ffffff', 700), backgroundColor: '#000000cc', padding: { x: 18, y: 8 } })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
    this.render();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  private drawBackground(): void {
    const { W, H, u } = this;
    const g = this.add.graphics();
    g.fillGradientStyle(0x262b33, 0x1c2027, 0x121419, 0x0c0e11, 1).fillRect(0, 0, W, H);
    g.lineStyle(1, 0xffffff, 0.035);
    for (let x = 0; x < W; x += 60 * u) g.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 60 * u) g.lineBetween(0, y, W, y);
    g.fillStyle(0xffffff, 0.03).fillPoints([v(0, H * 0.2), v(W * 0.62, H * 0.08), v(W * 0.62, H * 0.86), v(0, H * 0.98)], true);
    g.fillStyle(YELLOW, 0.9).fillRect(0, H - 6 * u, W * 0.3, 6 * u);
  }

  private render(): void {
    this.root.removeAll(true);
    const { W, H, u } = this;
    const save = loadSave();

    // 머리말
    const cleared = STAGES.filter((s) => (save.stages[s.id] ?? 0) > 0).length;
    const stars = STAGES.reduce((n, s) => n + (save.stages[s.id] ?? 0), 0);
    this.root.add([
      new Button(this, 60 * u, 50 * u, 84 * u, 60 * u, '◀', () => this.go('lobby'), { fill: 0x000000, alpha: 0.55, stroke: 0x555555, fontSize: Math.round(28 * u) }),
      this.add.text(120 * u, 22 * u, '작전', textStyle(Math.round(46 * u), '#ffffff', 900)),
      this.add.text(124 * u, 80 * u, 'OPERATION', textStyle(Math.round(16 * u), '#9aa0a6', 700)).setLetterSpacing(3),
      this.add.text(300 * u, 34 * u, '제1장  왁엔터 사옥 습격', textStyle(Math.round(26 * u), YELLOW_S, 900)),
      this.add.text(300 * u, 74 * u, `클리어 ${cleared}/${STAGES.length}   ★ ${stars}/${STAGES.length * 3}`, textStyle(Math.round(18 * u), '#c9ccd2', 700)),
    ]);

    // ── 노드 지도 ──
    const panelLeft = Math.max(W * 0.6, W - 760 * u);
    const mapL = 70 * u;
    const mapR = panelLeft - 50 * u;
    const nw = Math.min(250 * u, (mapR - mapL) / 3.4);
    const nh = 104 * u;
    const n = STAGES.length;
    const step = (mapR - mapL - nw) / Math.max(1, n - 1);
    const pos = STAGES.map((_, i) => ({ x: mapL + nw / 2 + i * step, y: H * (i % 2 === 0 ? 0.36 : 0.62) }));
    // 길 (점선 느낌)
    const g = this.add.graphics();
    for (let i = 0; i < n - 1; i++) {
      const open = isUnlocked(STAGES[i + 1].id);
      g.lineStyle(5 * u, open ? YELLOW : 0xffffff, open ? 0.85 : 0.15);
      g.lineBetween(pos[i].x, pos[i].y, pos[i + 1].x, pos[i + 1].y);
    }
    this.root.add(g);
    STAGES.forEach((st, i) => this.root.add(this.node(st, pos[i].x, pos[i].y, nw, nh)));

    this.drawInfo(panelLeft, 120 * u, W - 40 * u, H - 40 * u);
  }

  private node(st: StageDef, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const u = this.u;
    const save = loadSave();
    const open = isUnlocked(st.id);
    const on = st.id === this.selected;
    const best = save.stages[st.id] ?? 0;
    const boss = st.waves.some((wv) => ENEMY_MAP[wv.enemy]?.boss);
    const c = this.add.container(x, y);
    const s = SLANT * u;
    const pts = [v(-w / 2 + s, -h / 2), v(w / 2, -h / 2), v(w / 2 - s, h / 2), v(-w / 2, h / 2)];
    const g = this.add.graphics();
    g.fillStyle(on ? 0xf4f5f7 : 0x1d2026, open ? 0.97 : 0.6).fillPoints(pts, true);
    g.lineStyle((on ? 4 : 2) * u, on ? YELLOW : boss ? 0xb04cff : 0xffffff, on ? 1 : open ? 0.35 : 0.12).strokePoints(pts, true);
    if (boss) g.fillStyle(0xb04cff, open ? 1 : 0.4).fillPoints([v(-w / 2 + s, -h / 2), v(-w / 2 + s + 10 * u, -h / 2), v(-w / 2 + 10 * u, h / 2), v(-w / 2, h / 2)], true);
    const ink = on ? '#16181d' : '#ffffff';
    const alpha = open ? 1 : 0.4;
    const id = this.add.text(-w / 2 + 34 * u, -h / 2 + 10 * u, st.id, textStyle(Math.round(36 * u), ink, 900)).setAlpha(alpha);
    const name = this.add.text(-w / 2 + 30 * u, -h / 2 + 56 * u, st.name, textStyle(Math.round(17 * u), on ? '#3a3f48' : '#c9ccd2', 700)).setAlpha(alpha);
    if (name.width > w - 56 * u) name.setScale((w - 56 * u) / name.width);
    c.add([g, id, name]);
    if (open) {
      c.add(
        this.add
          .text(w / 2 - 26 * u, -h / 2 + 14 * u, best ? '★'.repeat(best) + '☆'.repeat(3 - best) : '☆☆☆', textStyle(Math.round(20 * u), best ? (on ? '#c98a00' : YELLOW_S) : on ? '#9aa0a6' : '#5c616b', 900))
          .setOrigin(1, 0),
      );
      if (boss) c.add(this.add.text(w / 2 - 28 * u, h / 2 - 12 * u, 'BOSS', textStyle(Math.round(14 * u), '#b04cff', 900)).setOrigin(1, 1).setLetterSpacing(2));
    } else {
      c.add(this.add.text(w / 2 - 28 * u, -h / 2 + 14 * u, 'LOCK', textStyle(Math.round(15 * u), '#9aa0a6', 900)).setOrigin(1, 0).setLetterSpacing(2));
    }
    c.setSize(w, h).setInteractive(new Phaser.Geom.Polygon(pts), Phaser.Geom.Polygon.Contains);
    if (c.input) c.input.cursor = 'pointer';
    c.on('pointerdown', () => c.setScale(0.97));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      if (!open) {
        this.showToast('앞 작전을 먼저 클리어해야 합니다');
        return;
      }
      this.selected = st.id;
      const sv = loadSave();
      sv.lastStage = st.id;
      writeSave();
      this.render();
    });
    return c;
  }

  // ───────────────────────── 정보 패널 ─────────────────────────

  private drawInfo(left: number, top: number, right: number, bottom: number): void {
    const u = this.u;
    const st = STAGE_MAP[this.selected];
    const save = loadSave();
    const best = save.stages[st.id] ?? 0;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55).fillPoints([v(left + SLANT * u, top), v(right, top), v(right - SLANT * u, bottom), v(left, bottom)], true);
    g.fillStyle(YELLOW, 1).fillRect(left + SLANT * u, top, 110 * u, 4 * u);
    this.root.add(g);
    const tx = left + 40 * u;
    const tw = right - tx - 40 * u;

    const id = this.add.text(tx, top + 22 * u, st.id, textStyle(Math.round(54 * u), YELLOW_S, 900));
    const name = this.add.text(tx + id.width + 18 * u, top + 38 * u, st.name, textStyle(Math.round(32 * u), '#ffffff', 900));
    const rec = this.add
      .text(right - 44 * u, top + 30 * u, best ? '★'.repeat(best) + '☆'.repeat(3 - best) : '미클리어', textStyle(Math.round(best ? 30 : 18) * u, best ? YELLOW_S : '#9aa0a6', 900))
      .setOrigin(1, 0);
    const desc = this.add.text(tx, top + 100 * u, st.desc ?? '', { ...textStyle(Math.round(19 * u), '#d6d9de', 400), wordWrap: { width: tw }, lineSpacing: 5 * u });
    this.root.add([id, name, rec, desc]);

    // 미니맵
    let y = desc.y + desc.height + 22 * u;
    const rows = st.map.length;
    const cols = st.map[0].length;
    const cell = Math.min((tw * 0.5) / cols, (170 * u) / rows);
    const mg = this.add.graphics();
    mg.fillStyle(0x000000, 0.5).fillRect(tx - 6 * u, y - 6 * u, cols * cell + 12 * u, rows * cell + 12 * u);
    st.map.forEach((line, r) =>
      [...line].forEach((ch, c) => {
        mg.fillStyle(TILE_COLOR[ch] ?? 0x23262c, 1).fillRect(tx + c * cell + 1, y + r * cell + 1, cell - 2, cell - 2);
      }),
    );
    this.root.add(mg);
    // 미니맵 옆 정보
    const total = st.waves.reduce((sum, wv) => sum + wv.count, 0);
    const ix = tx + cols * cell + 30 * u;
    this.root.add(
      this.add.text(ix, y, [`적  ${total}`, `방어점 체력  ${st.life}`, `배치 인원  ${st.maxDeploy}`, `시작 코스트  ${st.initialCost}`].join('\n'), {
        ...textStyle(Math.round(19 * u), '#e6e8eb', 700),
        lineSpacing: 10 * u,
      }),
    );
    y += rows * cell + 26 * u;

    // 등장 적
    this.root.add(this.add.text(tx, y, '등장하는 적', textStyle(Math.round(17 * u), '#9aa0a6', 900)).setLetterSpacing(1));
    y += 30 * u;
    const kinds = [...new Set(st.waves.map((wv) => wv.enemy))].map((eid) => ENEMY_MAP[eid]);
    const iw = Math.min(96 * u, tw / kinds.length);
    kinds.forEach((e, i) => this.root.add(this.enemyIcon(e, tx + i * iw + iw / 2, y, iw)));
    y += iw * 0.72 + 44 * u;

    // 추천
    if (st.hint) {
      const tag = this.add.text(tx, y, '추천', textStyle(Math.round(15 * u), '#16181d', 900)).setBackgroundColor(YELLOW_S).setPadding(8 * u, 3 * u);
      const hint = this.add.text(tx, y + 34 * u, st.hint, { ...textStyle(Math.round(18 * u), '#ffffff', 400), wordWrap: { width: tw }, lineSpacing: 5 * u });
      this.root.add([tag, hint]);
    }

    // 버튼
    const by = bottom - 54 * u;
    const bw = (tw - 16 * u) * 0.4;
    this.root.add([
      new Button(this, tx + bw / 2, by, bw, 72 * u, `편성 (${activeSquad().length}명)`, () => this.go('squad', { from: 'stages' }), { fontSize: Math.round(24 * u) }),
      new Button(this, tx + bw + 16 * u + (tw - bw - 16 * u) / 2, by, tw - bw - 16 * u, 72 * u, '작전 개시 ▶', () => this.start(), {
        fontSize: Math.round(28 * u),
        fill: 0x7a5c12,
        stroke: YELLOW,
      }),
    ]);
  }

  private enemyIcon(e: EnemyDef, x: number, y: number, w: number): Phaser.GameObjects.Container {
    const u = this.u;
    const c = this.add.container(x, y);
    const size = w * 0.68;
    const bg = this.add.rectangle(0, size / 2, size + 8 * u, size + 8 * u, 0x000000, 0.45).setStrokeStyle(1.5, e.boss ? 0xb04cff : 0xffffff, e.boss ? 1 : 0.18);
    let img: Phaser.GameObjects.Image;
    const op = e.opSprite ? OPERATOR_MAP[e.opSprite] : undefined;
    if (op) {
      const pt = sdPortrait(this, op);
      img = this.add.image(0, size / 2, pt.key).setTint(0x8f6fd6);
      img.setCrop(pt.face.x, pt.face.y, pt.face.w, pt.face.w);
      const k = size / pt.face.w;
      img.setOrigin(0, 0).setScale(k).setPosition(-size / 2 - pt.face.x * k, -pt.face.y * k);
    } else {
      img = this.add.image(0, size / 2, ensureEnemyTexture(this, e)).setDisplaySize(size, size);
    }
    const name = this.add.text(0, size + 10 * u, e.name, textStyle(Math.round(13 * u), e.boss ? '#e0aaff' : '#c9ccd2', 700)).setOrigin(0.5, 0);
    if (name.width > w - 4) name.setScale((w - 4) / name.width);
    c.add([bg, img, name]);
    return c;
  }

  // ───────────────────────── 동작 ─────────────────────────

  private start(): void {
    if (!activeSquad().length) {
      this.showToast('편성에서 분대를 먼저 구성해 주세요');
      return;
    }
    this.go('battle', { stageId: this.selected });
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
