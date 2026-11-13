import type { Cell, Position, RouteDef } from '../data/types';

export type TileType = 'wall' | 'ground' | 'road' | 'high' | 'highBlocked' | 'spawn' | 'goal';

const LEGEND: Record<string, TileType> = {
  '#': 'wall',
  '.': 'ground',
  _: 'road',
  h: 'high',
  H: 'highBlocked',
  R: 'spawn',
  B: 'goal',
};

export interface Grid {
  rows: number;
  cols: number;
  tiles: TileType[][];
}

export interface Point {
  x: number;
  y: number;
}

export function parseMap(lines: string[]): Grid {
  const rows = lines.length;
  const cols = lines[0].length;
  const tiles = lines.map((line, r) => {
    if (line.length !== cols) throw new Error(`맵 ${r}행 길이가 다름 (${line.length} != ${cols})`);
    return [...line].map((ch) => {
      const t = LEGEND[ch];
      if (!t) throw new Error(`알 수 없는 맵 문자 '${ch}'`);
      return t;
    });
  });
  return { rows, cols, tiles };
}

export function tileAt(grid: Grid, r: number, c: number): TileType | null {
  if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return null;
  return grid.tiles[r][c];
}

export function isWalkable(t: TileType | null): boolean {
  return t === 'ground' || t === 'road' || t === 'spawn' || t === 'goal';
}

export function isDeployable(t: TileType | null, pos: Position): boolean {
  return pos === 'ground' ? t === 'ground' : t === 'high';
}

/** 4방향 BFS 최단 경로 (시작/끝 포함). */
export function findPath(grid: Grid, start: Cell, end: Cell): Cell[] {
  const key = (r: number, c: number) => r * grid.cols + c;
  const prev = new Map<number, number>();
  const q: Cell[] = [start];
  prev.set(key(...start), -1);
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  while (q.length) {
    const [r, c] = q.shift()!;
    if (r === end[0] && c === end[1]) break;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const k = key(nr, nc);
      if (prev.has(k) || !isWalkable(tileAt(grid, nr, nc))) continue;
      prev.set(k, key(r, c));
      q.push([nr, nc]);
    }
  }
  if (!prev.has(key(...end))) throw new Error(`경로 없음: ${start} → ${end}`);
  const out: Cell[] = [];
  let k = key(...end);
  while (k !== -1) {
    out.push([Math.floor(k / grid.cols), k % grid.cols]);
    k = prev.get(k)!;
  }
  return out.reverse();
}

const center = ([r, c]: Cell): Point => ({ x: c + 0.5, y: r + 0.5 });

/** 직선 위에 있는 중간 점을 지워서 이동 경로를 단순하게 만든다. */
function simplify(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** 경로 정의 → 타일 중심 좌표의 웨이포인트 목록 */
export function buildRoute(grid: Grid, route: RouteDef): Point[] {
  const checkpoints: Cell[] = [route.start, ...(route.via ?? []), route.end];
  if (route.air) return checkpoints.map(center);
  const cells: Cell[] = [];
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const seg = findPath(grid, checkpoints[i], checkpoints[i + 1]);
    cells.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return simplify(cells.map(center));
}
