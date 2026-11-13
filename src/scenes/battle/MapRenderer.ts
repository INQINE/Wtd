import Phaser from 'phaser';
import type { Grid, Point, TileType } from '../../battle/grid';
import { Projection } from './projection';

/** 타일 높이 (월드 단위) */
export const HEIGHT: Record<TileType, number> = {
  wall: 0.5,
  ground: 0,
  road: 0,
  high: 0.32,
  highBlocked: 0.32,
  spawn: 0,
  goal: 0,
};

type V = Phaser.Math.Vector2;
const v = (x: number, y: number): V => new Phaser.Math.Vector2(x, y);

const PALETTE = {
  ground: 0x5d646d,
  groundEdge: 0x7b838c,
  road: 0x474c53,
  highTop: 0xb5bdc6,
  highEdge: 0xe2e8ee,
  highFront: 0x5a6068,
  highSide: 0x6c737b,
  blockedTop: 0x8a919a,
  wallTop: 0x33373d,
  wallEdge: 0x464b52,
  wallFront: 0x202327,
  wallSide: 0x2a2d32,
};

/** 맵(타일·벽·고지대)을 원근 투영으로 그려서 한 장의 텍스처로 굽는다. */
export class MapRenderer {
  constructor(
    private scene: Phaser.Scene,
    private grid: Grid,
    private proj: Projection,
  ) {}

  heightAt(r: number, c: number): number {
    if (r < 0 || c < 0 || r >= this.grid.rows || c >= this.grid.cols) return 0;
    return HEIGHT[this.grid.tiles[r][c]];
  }

  private quad(x0: number, y0: number, x1: number, y1: number, z: number): V[] {
    const p = this.proj;
    return [p.project(x0, y0, z), p.project(x1, y0, z), p.project(x1, y1, z), p.project(x0, y1, z)].map((q) => v(q.x, q.y));
  }

  /** 수직 면: (x0,y0)-(x1,y1) 선분을 z0~z1로 세운 면 */
  private wall(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): V[] {
    const p = this.proj;
    return [p.project(x0, y0, z1), p.project(x1, y1, z1), p.project(x1, y1, z0), p.project(x0, y0, z0)].map((q) => v(q.x, q.y));
  }

  bake(key: string, width: number, height: number): void {
    const g = this.scene.make.graphics({}, false);
    const { rows, cols, tiles } = this.grid;
    const p = this.proj;

    // 배경
    g.fillGradientStyle(0x1c2026, 0x1c2026, 0x0a0b0d, 0x0a0b0d, 1);
    g.fillRect(0, 0, width, height);

    // 바깥 바닥 (분위기용 격자)
    const ext = 7;
    g.fillStyle(0x15181c, 1);
    g.fillPoints(this.quad(-ext, -ext, cols + ext, rows + 4, -0.6), true);
    g.lineStyle(1, 0xffffff, 0.035);
    for (let x = -ext; x <= cols + ext; x++) {
      const a = p.project(x, -ext, -0.6);
      const b = p.project(x, rows + 4, -0.6);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let y = -ext; y <= rows + 4; y++) {
      const a = p.project(-ext, y, -0.6);
      const b = p.project(cols + ext, y, -0.6);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // 맵 받침대 (맵이 떠 있는 판처럼 보이게)
    const m = 0.12;
    g.fillStyle(0x0e1013, 1);
    g.fillPoints(this.wall(-m, rows + m, cols + m, rows + m, -0.6, 0), true);
    g.fillStyle(0x121418, 1);
    g.fillPoints(this.wall(-m, -m, -m, rows + m, -0.6, 0), true);
    g.fillPoints(this.wall(cols + m, -m, cols + m, rows + m, -0.6, 0), true);
    g.fillStyle(0x0b0c0e, 1);
    g.fillPoints(this.quad(-m, -m, cols + m, rows + m, 0), true);

    // 평지 타일
    const inset = 0.035;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        if (HEIGHT[t] > 0) continue;
        const q = this.quad(c + inset, r + inset, c + 1 - inset, r + 1 - inset, 0);
        g.fillStyle(t === 'road' ? PALETTE.road : PALETTE.ground, 1);
        g.fillPoints(q, true);
        g.lineStyle(2, t === 'road' ? 0x5a6067 : PALETTE.groundEdge, 0.9);
        g.strokePoints(q, true);
        if (t === 'road') {
          g.lineStyle(2, 0x3a3e44, 1);
          for (let k = 0.2; k < 1; k += 0.25) {
            const a = p.project(c + k, r + 0.12, 0);
            const b = p.project(c + k - 0.12, r + 0.88, 0);
            g.lineBetween(a.x, a.y, b.x, b.y);
          }
        }
        if (t === 'spawn' || t === 'goal') this.drawGate(g, r, c, t);
      }
    }

    // 블록(벽, 고지대): 먼 줄 → 가까운 줄, 바깥 → 중심 순서로 그려야 겹침이 맞는다
    const mid = cols / 2;
    const order: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      const cs = [...Array(cols).keys()].sort((a, b) => Math.abs(b + 0.5 - mid) - Math.abs(a + 0.5 - mid));
      for (const c of cs) if (HEIGHT[tiles[r][c]] > 0) order.push([r, c]);
    }
    for (const [r, c] of order) this.drawBlock(g, r, c, tiles[r][c]);

    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, r: number, c: number, t: TileType): void {
    const h = HEIGHT[t];
    const isWall = t === 'wall';
    const camX = this.grid.cols / 2;
    // 앞면 (카메라 쪽)
    const hFront = this.heightAt(r + 1, c);
    if (r === this.grid.rows - 1 || hFront < h) {
      g.fillStyle(isWall ? PALETTE.wallFront : PALETTE.highFront, 1);
      g.fillPoints(this.wall(c, r + 1, c + 1, r + 1, r === this.grid.rows - 1 ? 0 : hFront, h), true);
    }
    // 옆면 (카메라가 보는 쪽만)
    if (c + 1 <= camX) {
      const hn = this.heightAt(r, c + 1);
      if (hn < h) {
        g.fillStyle(isWall ? PALETTE.wallSide : PALETTE.highSide, 1);
        g.fillPoints(this.wall(c + 1, r, c + 1, r + 1, hn, h), true);
      }
    }
    if (c >= camX) {
      const hn = this.heightAt(r, c - 1);
      if (hn < h) {
        g.fillStyle(isWall ? PALETTE.wallSide : PALETTE.highSide, 1);
        g.fillPoints(this.wall(c, r, c, r + 1, hn, h), true);
      }
    }
    // 윗면
    const top = this.quad(c, r, c + 1, r + 1, h);
    g.fillStyle(isWall ? PALETTE.wallTop : t === 'high' ? PALETTE.highTop : PALETTE.blockedTop, 1);
    g.fillPoints(top, true);
    if (isWall) {
      g.lineStyle(2, PALETTE.wallEdge, 1);
      g.strokePoints(top, true);
    } else {
      const inner = this.quad(c + 0.06, r + 0.06, c + 0.94, r + 0.94, h);
      g.lineStyle(3, PALETTE.highEdge, 0.9);
      g.strokePoints(inner, true);
      g.lineStyle(2, 0x2c3036, 1);
      g.strokePoints(top, true);
    }
  }

  /** 진입점(빨간 게이트) / 방어점(파란 마름모) */
  private drawGate(g: Phaser.GameObjects.Graphics, r: number, c: number, t: TileType): void {
    const p = this.proj;
    const red = t === 'spawn';
    const col = red ? 0xe0413a : 0x2f80ed;
    g.fillStyle(col, 0.35);
    g.fillPoints(this.quad(c + 0.04, r + 0.04, c + 0.96, r + 0.96, 0), true);
    g.lineStyle(4, col, 1);
    g.strokePoints(this.quad(c + 0.1, r + 0.1, c + 0.9, r + 0.9, 0), true);
    if (red) {
      // 서 있는 게이트 틀
      const posts = [
        [c + 0.15, r + 0.5],
        [c + 0.85, r + 0.5],
      ];
      g.lineStyle(7, 0x8f1d18, 1);
      for (const [x, y] of posts) {
        const a = p.project(x, y, 0);
        const b = p.project(x, y, 0.95);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      const a = p.project(c + 0.1, r + 0.5, 0.95);
      const b = p.project(c + 0.9, r + 0.5, 0.95);
      g.lineStyle(9, 0xe0413a, 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(0xff6b5e, 0.25);
      g.fillPoints(this.wall(c + 0.15, r + 0.5, c + 0.85, r + 0.5, 0, 0.92), true);
    } else {
      const ctr = p.project(c + 0.5, r + 0.5, 0.6);
      const s = ctr.k * 0.26;
      const pts = [v(ctr.x, ctr.y - s * 1.3), v(ctr.x + s, ctr.y), v(ctr.x, ctr.y + s * 1.3), v(ctr.x - s, ctr.y)];
      g.fillStyle(0x2f80ed, 1);
      g.fillPoints(pts, true);
      g.lineStyle(4, 0xd6e8ff, 1);
      g.strokePoints(pts, true);
    }
  }

  // ───────────── 동적 표시 (매번 다시 그림) ─────────────

  fillTiles(g: Phaser.GameObjects.Graphics, tiles: [number, number][], color: number, alpha: number, edge = false): void {
    for (const [r, c] of tiles) {
      if (r < 0 || c < 0 || r >= this.grid.rows || c >= this.grid.cols) continue;
      const t = this.grid.tiles[r][c];
      if (t === 'wall') continue;
      const h = HEIGHT[t] + 0.005;
      const q = this.quad(c + 0.05, r + 0.05, c + 0.95, r + 0.95, h);
      g.fillStyle(color, alpha);
      g.fillPoints(q, true);
      if (edge) {
        g.lineStyle(3, color, 0.95);
        g.strokePoints(q, true);
      }
    }
  }

  /** 적 이동 경로 예고 (빨간 화살표가 경로를 따라 흐름) */
  drawRoute(g: Phaser.GameObjects.Graphics, path: Point[], air: boolean, phase: number, alpha: number): void {
    const z = air ? 0.6 : 0.02;
    const p = this.proj;
    const pts = path.map((q) => p.project(q.x, q.y, z));
    g.lineStyle(6, 0xff3b30, 0.35 * alpha);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
    g.strokePath();
    // 흐르는 화살표
    const seg: number[] = [0];
    for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    const total = seg[seg.length - 1];
    for (let s = (phase * 1.6) % 0.8; s < total; s += 0.8) {
      let i = 1;
      while (i < seg.length - 1 && seg[i] < s) i++;
      const t = (s - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
      const x = path[i - 1].x + (path[i].x - path[i - 1].x) * t;
      const y = path[i - 1].y + (path[i].y - path[i - 1].y) * t;
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      const L = Math.hypot(dx, dy) || 1;
      const fx = dx / L;
      const fy = dy / L;
      const tip = p.project(x + fx * 0.18, y + fy * 0.18, z);
      const l = p.project(x - fx * 0.1 - fy * 0.14, y - fy * 0.1 + fx * 0.14, z);
      const rr = p.project(x - fx * 0.1 + fy * 0.14, y - fy * 0.1 - fx * 0.14, z);
      g.fillStyle(0xff3b30, 0.9 * alpha);
      g.fillTriangle(tip.x, tip.y, l.x, l.y, rr.x, rr.y);
    }
  }

  /** 바닥 위 원(타원) — 선택 링 등 */
  floorRing(g: Phaser.GameObjects.Graphics, x: number, y: number, z: number, radius: number, color: number, alpha: number, width = 3): void {
    const p = this.proj;
    const pts: V[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const q = p.project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z);
      pts.push(v(q.x, q.y));
    }
    g.lineStyle(width, color, alpha);
    g.strokePoints(pts, false);
  }
}
