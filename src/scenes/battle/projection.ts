/**
 * 2.5D 원근 투영.
 *
 * 월드 좌표 (타일 단위)
 *   x: 오른쪽(열 방향), y: 화면 아래쪽(행 방향, 카메라 쪽), z: 위(높이)
 * 카메라는 맵 아래쪽 위에서 비스듬히 내려다본다 (명일방주처럼).
 */
export interface Projected {
  x: number;
  y: number;
  /** 그 지점에서 월드 1칸이 몇 픽셀인지 (원근 배율) */
  k: number;
  /** 카메라까지 깊이 */
  d: number;
}

export interface Viewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class Projection {
  /** 카메라가 바닥과 이루는 각도 */
  readonly pitch: number;
  /** 카메라와 맵 중심 사이 거리 (작을수록 원근감 강함) */
  readonly dist: number;
  private readonly mx: number;
  private readonly my: number;
  private readonly C: [number, number, number];
  private readonly F: [number, number, number];
  private readonly U: [number, number, number];
  f = 1;
  cx = 0;
  cy = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
    opts: { pitchDeg?: number; dist?: number; yShift?: number } = {},
  ) {
    this.pitch = ((opts.pitchDeg ?? 58) * Math.PI) / 180;
    this.dist = opts.dist ?? Math.max(cols, rows) * 1.9;
    this.mx = cols / 2;
    // 맵 중심보다 살짝 앞쪽을 바라봐야 아래쪽 줄이 덜 커진다
    this.my = rows / 2 + (opts.yShift ?? 0);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this.C = [0, this.dist * cp, this.dist * sp];
    this.F = [0, -cp, -sp];
    this.U = [0, -sp, cp];
  }

  /** 정규화 좌표 (f=1, 중심 0) */
  private raw(x: number, y: number, z: number): { u: number; v: number; d: number } {
    const vx = x - this.mx - this.C[0];
    const vy = y - this.my - this.C[1];
    const vz = z - this.C[2];
    const d = vx * this.F[0] + vy * this.F[1] + vz * this.F[2];
    const u = vx; // R = (1,0,0)
    const v = vx * this.U[0] + vy * this.U[1] + vz * this.U[2];
    return { u: u / d, v: v / d, d };
  }

  /** 맵 전체(+여유, 최대 높이)가 viewport 안에 들어가도록 배율과 중심을 정한다. */
  fit(vp: Viewport, maxZ: number, margin = 0.15): void {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const x of [-margin, this.cols + margin]) {
      for (const y of [-margin, this.rows + margin]) {
        for (const z of [0, maxZ]) {
          const p = this.raw(x, y, z);
          minU = Math.min(minU, p.u);
          maxU = Math.max(maxU, p.u);
          minV = Math.min(minV, p.v);
          maxV = Math.max(maxV, p.v);
        }
      }
    }
    const w = vp.right - vp.left;
    const h = vp.bottom - vp.top;
    this.f = Math.min(w / (maxU - minU), h / (maxV - minV));
    this.cx = (vp.left + vp.right) / 2 - ((minU + maxU) / 2) * this.f;
    // 화면 y는 아래로 증가하므로 v를 뒤집는다
    this.cy = (vp.top + vp.bottom) / 2 + ((minV + maxV) / 2) * this.f;
  }

  project(x: number, y: number, z = 0): Projected {
    const p = this.raw(x, y, z);
    return { x: this.cx + p.u * this.f, y: this.cy - p.v * this.f, k: this.f / p.d, d: p.d };
  }

  /** 화면 좌표에서 높이 z인 평면과 만나는 월드 좌표 */
  unproject(sx: number, sy: number, z = 0): { x: number; y: number } | null {
    const u = (sx - this.cx) / this.f;
    const v = (this.cy - sy) / this.f;
    // 광선 방향 = F + u*R + v*U
    const dir = [this.F[0] + u, this.F[1] + v * this.U[1], this.F[2] + v * this.U[2]];
    if (Math.abs(dir[2]) < 1e-9) return null;
    const t = (z - this.C[2]) / dir[2];
    if (t <= 0) return null;
    return { x: this.C[0] + dir[0] * t + this.mx, y: this.C[1] + dir[1] * t + this.my };
  }
}
