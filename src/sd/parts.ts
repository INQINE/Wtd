/**
 * SD 부위별 그리기.
 * 좌표 단위 = "디자인 픽셀" (캐릭터 전체 키 ≈ 224). 오른쪽(3/4 측면)을 바라보는 기준.
 * 각 함수는 부위의 피벗(관절)을 (0,0)으로 두고 그린다.
 */
import Phaser from 'phaser';
import type { Accessory, SDSpec, WeaponType } from './spec';

type G = Phaser.GameObjects.Graphics;
/** [x, y, sharp?] — sharp면 그 점에서 꺾임 */
type P = [number, number, boolean?];

export const LW = 2.6;
const SKIN = 0xffe8dc;
const SKIN_LINE = 0x8a5246;
const LASH = 0x2a1f2b;

const C = Phaser.Display.Color;
export const darken = (c: number, p: number) => C.ValueToColor(c).darken(p).color;
export const lighten = (c: number, p: number) => C.ValueToColor(c).lighten(p).color;
/** 외곽선 색: 채움색을 아주 어둡게 */
export const lineOf = (c: number) => {
  const col = C.ValueToColor(c);
  return C.GetColor(Math.round(col.red * 0.28), Math.round(col.green * 0.24), Math.round(col.blue * 0.3));
};

/** 꺾이는 점을 지원하는 Catmull-Rom(허밋) 곡선 → 점 목록 */
function curve(pts: P[], closed = true, seg = 7): Phaser.Math.Vector2[] {
  const n = pts.length;
  const out: Phaser.Math.Vector2[] = [];
  const at = (i: number) => pts[closed ? (i + n) % n : Phaser.Math.Clamp(i, 0, n - 1)];
  const tan = (i: number): [number, number] => {
    const p = at(i);
    if (p[2]) return [0, 0];
    const a = at(i - 1);
    const b = at(i + 1);
    return [(b[0] - a[0]) * 0.5, (b[1] - a[1]) * 0.5];
  };
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i);
    const p1 = at(i + 1);
    const m0 = tan(i);
    const m1 = tan(i + 1);
    for (let s = 0; s < seg; s++) {
      const t = s / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push(
        new Phaser.Math.Vector2(
          h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
          h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
        ),
      );
    }
  }
  if (!closed) out.push(new Phaser.Math.Vector2(pts[n - 1][0], pts[n - 1][1]));
  return out;
}

function shape(g: G, pts: P[], fill: number, line: number | null = lineOf(fill), lw = LW, alpha = 1): void {
  const v = curve(pts);
  g.fillStyle(fill, alpha);
  g.fillPoints(v, true);
  if (line !== null) {
    g.lineStyle(lw, line, 1);
    g.strokePoints(v, true);
  }
}

function poly(g: G, pts: [number, number][], fill: number, line: number | null = lineOf(fill), lw = LW): void {
  shape(
    g,
    pts.map(([x, y]) => [x, y, true] as P),
    fill,
    line,
    lw,
  );
}

function ellipse(g: G, x: number, y: number, rx: number, ry: number, fill: number, line: number | null = lineOf(fill), lw = LW): void {
  g.fillStyle(fill, 1);
  g.fillEllipse(x, y, rx * 2, ry * 2);
  if (line !== null) {
    g.lineStyle(lw, line, 1);
    g.strokeEllipse(x, y, rx * 2, ry * 2);
  }
}

function stroke(g: G, pts: P[], color: number, lw: number): void {
  g.lineStyle(lw, color, 1);
  g.strokePoints(curve(pts, false), false);
}

// ─────────────────────────── 머리 (앞) ───────────────────────────

/** 피벗 = 목. 얼굴 중심은 (5,-42) */
export function drawHead(g: G, s: SDSpec): void {
  const skin = s.skin ?? SKIN;
  const hair = s.hair.color;

  // 얼굴 (3/4 측면: 턱이 오른쪽으로 약간)
  const face: P[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const sy = Math.sin(a);
    const x = 5 + Math.cos(a) * 36 + (sy > 0 ? sy * sy * 5 : 0);
    const y = -42 + sy * 35 * (sy > 0 ? 1.05 : 1);
    face.push([x, y]);
  }
  shape(g, face, skin, SKIN_LINE);
  // 머리카락 그림자 (이마)
  g.fillStyle(darken(skin, 10), 1);
  g.fillEllipse(6, -56, 64, 18);

  drawEyes(g, s);

  // 볼터치
  g.fillStyle(0xff8f8f, 0.45);
  g.fillEllipse(-13, -22, 12, 6);
  g.fillEllipse(30, -22, 9, 5);

  // 입
  const mx = 13;
  const my = -18;
  switch (s.mouth ?? 'smile') {
    case 'smile':
      stroke(g, [[mx - 5, my - 1], [mx, my + 2], [mx + 5, my - 1]], SKIN_LINE, 2);
      break;
    case 'neutral':
      stroke(g, [[mx - 3, my], [mx + 3, my]], SKIN_LINE, 2);
      break;
    case 'open':
      shape(g, [[mx - 5, my - 2, true], [mx + 5, my - 2, true], [mx, my + 5]], 0x9c3848, SKIN_LINE, 1.6);
      break;
    case 'cat':
      stroke(g, [[mx - 6, my - 1], [mx - 3, my + 2], [mx, my - 1, true], [mx + 3, my + 2], [mx + 6, my - 1]], SKIN_LINE, 1.8);
      break;
  }

  drawFrontHair(g, s, hair);
  for (const acc of s.accessories ?? []) drawHeadAccessory(g, acc, false);
}

function drawEyes(g: G, s: SDSpec): void {
  const col = s.eyes.color;
  const y = -34;
  const one = (cx: number, w: number, h: number) => {
    if (s.eyes.shape === 'smile') {
      stroke(g, [[cx - w * 0.6, y + 2], [cx, y - h * 0.35], [cx + w * 0.6, y + 2]], LASH, 3);
      return;
    }
    const hh = s.eyes.shape === 'sleepy' ? h * 0.6 : s.eyes.shape === 'sharp' ? h * 0.82 : h;
    const yy = y + (h - hh) * 0.4;
    // 홍채 (위는 어둡고 아래는 밝게)
    g.fillStyle(darken(col, 45), 1);
    g.fillEllipse(cx, yy, w, hh);
    g.fillStyle(col, 1);
    g.fillEllipse(cx, yy + hh * 0.16, w * 0.78, hh * 0.62);
    g.fillStyle(lighten(col, 25), 1);
    g.fillEllipse(cx, yy + hh * 0.3, w * 0.5, hh * 0.25);
    g.fillStyle(darken(col, 60), 1);
    g.fillEllipse(cx, yy + hh * 0.02, w * 0.36, hh * 0.38);
    // 하이라이트
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - w * 0.2, yy - hh * 0.2, w * 0.2);
    g.fillCircle(cx + w * 0.22, yy + hh * 0.26, w * 0.09);
    // 윗눈썹(속눈썹)
    if (s.eyes.shape === 'sharp') {
      stroke(g, [[cx - w * 0.7, yy - hh * 0.35], [cx + w * 0.65, yy - hh * 0.62]], LASH, 3.4);
    } else {
      stroke(g, [[cx - w * 0.68, yy - hh * 0.32], [cx, yy - hh * 0.56], [cx + w * 0.62, yy - hh * 0.4]], LASH, 3.2);
    }
    if (s.eyes.shape === 'sleepy') stroke(g, [[cx - w * 0.6, yy - hh * 0.5], [cx + w * 0.6, yy - hh * 0.5]], darken(s.skin ?? SKIN, 20), 2);
  };
  one(-5, 13, 19);
  one(25, 11, 18);
}

function drawFrontHair(g: G, s: SDSpec, hair: number): void {
  const style = s.hair.style;
  const lockY = style === 'short' || style === 'messy' ? -16 : style === 'bob' ? -2 : 12;

  // 앞머리: 끝은 뾰족, 사이 골은 둥글게 → 명일방주식 '머리카락 덩어리'
  let bangs: P[];
  switch (s.hair.bangs) {
    case 'straight':
      bangs = [
        [33, -46, true],
        [26, -55],
        [19, -44, true],
        [11, -55],
        [3, -43, true],
        [-5, -55],
        [-13, -45, true],
        [-21, -55],
        [-29, -47, true],
      ];
      break;
    case 'split':
      bangs = [
        [35, -42, true],
        [28, -54],
        [19, -46, true],
        [12, -60],
        [5, -74, true],
        [-2, -62],
        [-10, -47, true],
        [-18, -56],
        [-28, -45, true],
      ];
      break;
    default: // swept: 바라보는 쪽(오른쪽)으로 쓸어넘김
      bangs = [
        [37, -40, true],
        [29, -53],
        [22, -42, true],
        [13, -56],
        [6, -45, true],
        [-4, -58],
        [-12, -49, true],
        [-21, -60],
        [-30, -51, true],
      ];
  }

  const top: P[] =
    style === 'messy'
      ? [
          [-52, -40],
          [-58, -58, true],
          [-50, -66],
          [-56, -84, true],
          [-38, -88],
          [-34, -106, true],
          [-14, -98],
          [6, -110, true],
          [18, -98],
          [40, -100, true],
          [42, -84],
          [58, -78, true],
          [50, -62],
          [54, -34],
        ]
      : [
          [-52, -42],
          [-53, -66],
          [-42, -88],
          [-20, -100],
          [6, -102],
          [30, -94],
          [46, -76],
          [53, -52],
          [52, -32],
        ];

  const pts: P[] = [
    [44, lockY, true], // 오른쪽 옆머리 끝
    [37, -30],
    ...bangs,
    [-38, -30],
    [-44, lockY, true], // 왼쪽 옆머리 끝
    ...top,
  ];
  shape(g, pts, hair, lineOf(hair));

  // 그림자 (앞머리 아래쪽)
  g.fillStyle(darken(hair, 18), 0.55);
  g.fillPoints(curve([[-36, -58], [0, -66], [34, -60], [30, -52, true], [0, -58], [-32, -52, true]]), true);

  // 브릿지
  if (s.hair.streak !== undefined) {
    shape(g, [[16, -92], [26, -62, true], [18, -46, true], [10, -62, true]], s.hair.streak, lineOf(hair));
  }
  // 하이라이트 (천사의 고리): 머리 둘레를 따라 밝은 띠
  const ring: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Phaser.Math.DegToRad(205 + (i / 16) * 125);
    ring.push(new Phaser.Math.Vector2(3 + Math.cos(a) * 41, -56 + Math.sin(a) * 37));
  }
  for (let i = 16; i >= 0; i--) {
    const a = Phaser.Math.DegToRad(205 + (i / 16) * 125);
    const w = Math.sin((i / 16) * Math.PI) * 6;
    ring.push(new Phaser.Math.Vector2(3 + Math.cos(a) * (41 - w), -56 + Math.sin(a) * (37 - w)));
  }
  g.fillStyle(lighten(hair, 30), 0.7);
  g.fillPoints(ring, true);
  // 삐친 머리
  if (s.hair.ahoge) {
    shape(g, [[2, -99], [10, -116], [22, -126, true], [14, -110], [8, -98, true]], hair, lineOf(hair));
  }
}

function drawHeadAccessory(g: G, a: Accessory, back: boolean): void {
  const c = a.color;
  if (back) {
    if (a.type === 'halo') {
      g.lineStyle(9, lineOf(c), 1);
      g.strokeEllipse(0, -114, 62, 16);
      g.lineStyle(5, c, 1);
      g.strokeEllipse(0, -114, 62, 16);
    }
    return;
  }
  switch (a.type) {
    case 'cat_ears':
    case 'fox_ears': {
      const tall = a.type === 'fox_ears' ? 1.35 : 1;
      for (const [x, dir] of [
        [-30, -1],
        [24, 1],
      ] as const) {
        shape(g, [[x - 13, -86, true], [x + dir * 6, -86 - 32 * tall, true], [x + 14, -90, true]], c, lineOf(c));
        g.fillStyle(0xffb3c1, 0.9);
        g.fillTriangle(x - 7, -88, x + dir * 5, -86 - 24 * tall, x + 8, -90);
      }
      break;
    }
    case 'bunny_ears':
      shape(g, [[-26, -92], [-34, -140], [-24, -152], [-16, -138], [-16, -94]], c, lineOf(c));
      shape(g, [[14, -96], [20, -142], [32, -150], [34, -134], [24, -96]], c, lineOf(c));
      break;
    case 'horns':
      shape(g, [[-34, -84, true], [-44, -108], [-40, -124, true], [-34, -104], [-24, -88, true]], c, lineOf(c));
      shape(g, [[24, -90, true], [32, -112], [28, -128, true], [24, -108], [14, -94, true]], c, lineOf(c));
      break;
    case 'ribbon':
      shape(g, [[-40, -80, true], [-58, -96], [-60, -74], [-40, -80, true]], c, lineOf(c));
      shape(g, [[-40, -80, true], [-24, -98], [-18, -78], [-40, -80, true]], c, lineOf(c));
      ellipse(g, -40, -80, 5, 5, darken(c, 15));
      break;
    case 'hairpin':
      poly(g, [[-44, -64], [-30, -70], [-28, -64], [-42, -58]], c);
      poly(g, [[-40, -74], [-28, -78], [-27, -73], [-39, -69]], c);
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const an = (i / 5) * Math.PI * 2;
        ellipse(g, -38 + Math.cos(an) * 6, -76 + Math.sin(an) * 6, 5, 5, c);
      }
      ellipse(g, -38, -76, 3.5, 3.5, 0xffe066);
      break;
    case 'headphones':
      g.lineStyle(9, lineOf(c), 1);
      g.beginPath();
      g.arc(2, -52, 54, Math.PI * 1.02, Math.PI * 1.98, false);
      g.strokePath();
      g.lineStyle(5, c, 1);
      g.beginPath();
      g.arc(2, -52, 54, Math.PI * 1.02, Math.PI * 1.98, false);
      g.strokePath();
      shape(g, [[-60, -58], [-48, -60], [-44, -34], [-56, -30]], c, lineOf(c));
      ellipse(g, 54, -46, 7, 13, darken(c, 15));
      break;
    case 'glasses':
      g.lineStyle(2.4, c, 1);
      g.strokeRoundedRect(-14, -42, 19, 15, 5);
      g.strokeRoundedRect(16, -42, 17, 15, 5);
      g.lineBetween(5, -36, 16, -36);
      break;
    case 'beret':
      shape(g, [[-48, -80], [-30, -106], [10, -112], [44, -98], [50, -82], [10, -80]], c, lineOf(c));
      ellipse(g, 6, -112, 4, 4, darken(c, 20));
      break;
    case 'crown':
      poly(g, [[-10, -98], [-12, -118], [-4, -108], [4, -122], [12, -108], [20, -118], [18, -98]], c);
      ellipse(g, 4, -112, 3, 3, 0xff4d6d, null);
      break;
    case 'antenna':
      stroke(g, [[10, -100], [18, -122], [28, -132]], lineOf(c), 3);
      ellipse(g, 30, -134, 6, 6, c);
      break;
    case 'halo':
      // 뒤쪽 고리는 뒷머리에서, 앞쪽 반원만 여기서
      g.lineStyle(9, lineOf(c), 1);
      g.beginPath();
      g.arc(0, -114, 31, 0.15, Math.PI - 0.15, false);
      g.strokePath();
      g.lineStyle(5, c, 1);
      g.beginPath();
      g.arc(0, -114, 31, 0.1, Math.PI - 0.1, false);
      g.strokePath();
      break;
    default:
      break;
  }
}

// ─────────────────────────── 뒷머리 ───────────────────────────

/** 피벗 = 목 */
export function drawBackHair(g: G, s: SDSpec): void {
  const hair = darken(s.hair.color, 14);
  const line = lineOf(s.hair.color);
  for (const acc of s.accessories ?? []) drawHeadAccessory(g, acc, true);
  if (s.outfit.style === 'hoodie') {
    // 후드
    shape(g, [[-40, -8], [-30, -24], [30, -26], [42, -8], [20, 4], [-22, 4]], darken(s.outfit.main, 12));
  }
  switch (s.hair.style) {
    case 'long':
      shape(
        g,
        [
          [-46, -74],
          [-56, -20],
          [-58, 46],
          [-50, 98, true],
          [-38, 84, true],
          [-28, 104, true],
          [-14, 88, true],
          [0, 106, true],
          [14, 88, true],
          [28, 102, true],
          [40, 84, true],
          [52, 94, true],
          [58, 36],
          [54, -30],
          [46, -74],
        ],
        hair,
        line,
      );
      break;
    case 'bob':
      shape(
        g,
        [
          [-50, -64],
          [-58, -26],
          [-56, 6, true],
          [-42, -2, true],
          [-30, 8, true],
          [30, 8, true],
          [44, -2, true],
          [58, 6, true],
          [58, -26],
          [50, -64],
        ],
        hair,
        line,
      );
      break;
    case 'twintail':
    case 'sidetail': {
      shape(g, [[-40, -76], [-64, -62], [-78, -18], [-78, 34], [-68, 80, true], [-60, 40], [-54, -2], [-46, -44]], hair, line);
      ellipse(g, -46, -68, 7, 7, s.outfit.accent);
      if (s.hair.style === 'twintail') {
        shape(g, [[40, -80], [62, -66], [74, -24], [72, 26], [62, 70, true], [56, 32], [50, -8], [44, -52]], hair, line);
        ellipse(g, 46, -72, 6, 6, s.outfit.accent);
      }
      break;
    }
    case 'ponytail':
      shape(g, [[-30, -96], [-58, -102], [-84, -76], [-90, -22], [-80, 34, true], [-72, -8], [-62, -50], [-42, -76]], hair, line);
      ellipse(g, -38, -92, 7, 7, s.outfit.accent);
      break;
    case 'messy':
      shape(g, [[-44, -30], [-60, -22, true], [-48, -12], [-54, 2, true], [-38, -8], [-30, 0, true], [-24, -16]], hair, line);
      break;
    default:
      break;
  }
  // 뒤통수 전체 볼륨
  ellipse(g, 0, -52, 50, 50, hair, line);
}

// ─────────────────────────── 몸통 ───────────────────────────

/** 피벗 = 엉덩이(허리 아래). 어깨 높이 y=-56 */
export function drawBody(g: G, s: SDSpec): void {
  const o = s.outfit;
  const skin = s.skin ?? SKIN;
  // 목
  g.fillStyle(darken(skin, 12), 1);
  g.fillRect(-6, -66, 12, 14);

  const torso: P[] = [
    [-22, -49],
    [-17, -57],
    [17, -57],
    [22, -49],
    [18, -4, true],
    [-16, -4, true],
  ];

  switch (o.style) {
    case 'hoodie': {
      shape(g, [[-26, -48], [-20, -58], [20, -58], [26, -48], [26, 4, true], [-24, 4, true]], o.main);
      g.fillStyle(darken(o.main, 15), 1);
      g.fillRect(-24, -2, 50, 6);
      poly(g, [[-12, -20], [14, -20], [17, -6], [-15, -6]], darken(o.main, 10));
      stroke(g, [[-5, -56], [-7, -36]], o.accent, 2.2);
      stroke(g, [[5, -56], [6, -38]], o.accent, 2.2);
      ellipse(g, -7, -35, 2.4, 2.4, o.accent, null);
      ellipse(g, 6, -37, 2.4, 2.4, o.accent, null);
      poly(g, [[-14, 4], [18, 4], [18, 12], [-14, 12]], o.bottom);
      break;
    }
    case 'jacket':
    case 'suit': {
      shape(g, torso, o.inner);
      shape(g, [[-22, -49], [-17, -57], [-6, -57], [-2, -4, true], [-16, -4, true]], o.main);
      shape(g, [[22, -49], [17, -57], [8, -57], [5, -4, true], [18, -4, true]], o.main);
      // 옷깃
      poly(g, [[-6, -57], [-12, -44], [-2, -48]], lighten(o.main, 15));
      poly(g, [[8, -57], [14, -44], [4, -48]], lighten(o.main, 15));
      if (o.style === 'suit') {
        poly(g, [[0, -54], [3, -50], [2, -26], [0, -22], [-2, -26], [-3, -50]], o.accent);
        poly(g, [[-17, -4], [19, -4], [20, 10], [-18, 10]], o.bottom);
      } else {
        // 대각선 벨트
        g.lineStyle(4, o.accent, 1);
        g.lineBetween(-18, -48, 16, -12);
        poly(g, [[-17, -4], [19, -4], [24, 12], [-21, 12]], o.bottom);
      }
      g.fillStyle(0x1c1d22, 1);
      g.fillRect(-17, -9, 36, 5);
      ellipse(g, 4, -6.5, 3, 3, o.accent, null);
      break;
    }
    case 'uniform': {
      shape(g, torso, o.main);
      poly(g, [[-20, -56], [20, -56], [14, -40], [1, -30], [-12, -40]], o.accent);
      g.lineStyle(1.6, 0xffffff, 0.9);
      g.lineBetween(-16, -52, -9, -41);
      g.lineBetween(16, -52, 11, -41);
      // 리본
      shape(g, [[1, -34, true], [-10, -40], [-10, -28], [1, -34, true], [12, -40], [12, -28]], o.inner);
      // 주름치마
      poly(g, [[-18, -6], [20, -6], [28, 16], [-26, 16]], o.bottom);
      g.lineStyle(1.5, lineOf(o.bottom), 0.8);
      for (const x of [-14, -5, 4, 13, 22]) g.lineBetween(x * 0.7, -5, x, 15);
      break;
    }
    case 'dress': {
      shape(g, torso, o.main);
      shape(g, [[-17, -8], [19, -8], [34, 22, true], [-32, 22, true]], o.main);
      // 프릴
      const frill: P[] = [[-32, 20, true]];
      for (let x = -32; x <= 34; x += 8) frill.push([x + 4, 26], [x + 8, 20, true]);
      frill.push([34, 18, true], [-32, 18, true]);
      shape(g, frill, o.inner);
      shape(g, [[1, -12, true], [-9, -18], [-9, -6], [1, -12, true], [11, -18], [11, -6]], o.accent);
      poly(g, [[-8, -57], [10, -57], [6, -46], [-4, -46]], o.inner);
      break;
    }
    case 'coat': {
      // 코트 자락 (다리 위를 덮음)
      shape(g, [[-22, -12], [22, -12], [32, 44, true], [-30, 44, true]], darken(o.main, 8));
      shape(g, torso, o.main);
      poly(g, [[-3, -57], [7, -57], [6, 44], [-2, 44]], o.inner);
      g.lineStyle(LW, lineOf(o.main), 1);
      g.lineBetween(-3, -57, -2, 44);
      g.lineBetween(7, -57, 6, 44);
      for (const y of [-42, -28, -14]) ellipse(g, 10, y, 2.4, 2.4, o.accent, null);
      poly(g, [[-17, -57], [-4, -57], [-10, -44]], lighten(o.main, 12));
      poly(g, [[18, -57], [8, -57], [14, -44]], lighten(o.main, 12));
      g.fillStyle(0x1c1d22, 1);
      g.fillRect(-18, -9, 38, 5);
      break;
    }
    case 'armor': {
      shape(g, torso, o.main);
      shape(g, [[-14, -52], [16, -52], [14, -24], [1, -16], [-12, -24]], lighten(o.main, 22));
      ellipse(g, 1, -36, 5, 5, o.accent);
      poly(g, [[-18, -6], [20, -6], [22, 12], [-20, 12]], darken(o.main, 10));
      g.lineStyle(1.6, lineOf(o.main), 1);
      g.lineBetween(1, -6, 1, 12);
      // 어깨 보호대
      ellipse(g, -21, -51, 11, 9, lighten(o.main, 10));
      ellipse(g, 22, -51, 11, 9, lighten(o.main, 10));
      g.lineStyle(2, o.accent, 1);
      g.strokeEllipse(22, -51, 16, 12);
      break;
    }
  }
  if (o.style === 'jacket' || o.style === 'coat' || o.style === 'hoodie') {
    // 소속 마크
    poly(g, [[-12, -44], [-9, -48], [-6, -44], [-9, -40]], o.accent, null);
  }
  if (o.turtleneck) {
    // 목까지 올라온 니트 깃 + 골지 무늬
    shape(g, [[-9, -66], [9, -66], [10, -55, true], [-10, -55, true]], o.inner);
    g.lineStyle(1, lineOf(o.inner), 0.5);
    for (const x of [-6, -2, 2, 6]) g.lineBetween(x, -64, x, -56);
  }
  for (const a of s.accessories ?? []) {
    if (a.type !== 'necklace') continue;
    // 별 펜던트 목걸이
    g.lineStyle(1.2, 0xd9dde3, 1);
    g.strokePoints(curve([[-7, -55], [1, -43], [9, -55]], false), false);
    const star: P[] = [];
    for (let i = 0; i < 10; i++) {
      const an = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 5 : 2.2;
      star.push([1 + Math.cos(an) * r, -39 + Math.sin(an) * r, true]);
    }
    shape(g, star, 0xeef1f5, 0x6b7280, 1.2);
    ellipse(g, 1, -39, 1.6, 1.6, a.color, null);
  }
}

// ─────────────────────────── 다리 ───────────────────────────

/** 피벗 = 엉덩이. 발끝 y ≈ 62 */
export function drawLegs(g: G, s: SDSpec): void {
  const skin = s.skin ?? SKIN;
  // 꼬리/날개 (몸 뒤)
  for (const a of s.accessories ?? []) {
    if (a.type === 'tail') {
      shape(g, [[-10, -8], [-30, -2], [-50, -20], [-58, -48], [-48, -60, true], [-42, -38], [-28, -20], [-12, -16]], a.color);
      g.fillStyle(lighten(a.color, 35), 1);
      g.fillEllipse(-51, -52, 10, 12);
    }
    if (a.type === 'wings') {
      shape(g, [[-6, -46], [-40, -70], [-66, -60, true], [-52, -46], [-62, -34, true], [-44, -28], [-50, -16, true], [-10, -30]], a.color);
    }
  }

  const leg = (hx: number, fx: number, footY: number, dark: number) => {
    const L = s.legs;
    const wide = L.style === 'pants' ? 8.5 : 6.4;
    const col = L.style === 'bare' || L.style === 'socks' ? skin : L.style === 'pants' ? s.outfit.bottom : L.color;
    const c = darken(col, dark);
    poly(g, [[hx - wide, -4], [hx + wide, -4], [fx + wide - 1.5, footY - 6], [fx - wide + 1.5, footY - 6]], c);
    if (L.style === 'socks') {
      poly(g, [[hx - 6 + (fx - hx) * 0.55, 26], [hx + 6 + (fx - hx) * 0.55, 26], [fx + 5, footY - 6], [fx - 5, footY - 6]], darken(L.color, dark));
    }
    // 신발 (앞쪽 = +x)
    shape(g, [[fx - 7, footY - 10], [fx + 5, footY - 10], [fx + 12, footY - 3], [fx + 11, footY + 1, true], [fx - 7, footY + 1, true]], darken(L.shoes, dark));
  };
  leg(-8, -13, 60, 14);
  leg(8, 12, 62, 0);
}

// ─────────────────────────── 팔 ───────────────────────────

/** 피벗 = 어깨. 팔은 +y 방향으로 늘어짐, 손 중심 (0,42) */
export function drawArm(g: G, s: SDSpec, back: boolean): void {
  const o = s.outfit;
  const d = back ? 16 : 0;
  const skin = darken(s.skin ?? SKIN, d);
  const sleeve = o.style === 'armor' ? lighten(o.main, 10) : o.style === 'jacket' || o.style === 'suit' ? o.main : o.main;
  const shortSleeve = o.style === 'dress';
  const len = shortSleeve ? 16 : 34;
  if (shortSleeve) {
    poly(g, [[-5.5, 12], [5.5, 12], [5, 38], [-5, 38]], skin, SKIN_LINE);
  }
  shape(g, [[-7.5, -4], [7.5, -4], [8.5, len, true], [-8.5, len, true]], darken(sleeve, d));
  if (!shortSleeve) {
    g.fillStyle(darken(o.accent, d), 1);
    g.fillRect(-8.5, len - 4, 17, 4);
  }
  ellipse(g, 0, 42, 7, 7, skin, SKIN_LINE, 2.2);
}

// ─────────────────────────── 무기 ───────────────────────────

export interface WeaponPose {
  /** 기본 팔 각도 (도, 0 = 아래로 늘어짐, 음수 = 앞으로 듦) */
  arm: number;
  /** 무기가 화면에서 이루는 각도 (도, 0 = 위를 향함, 양수 = 앞쪽으로 기울어짐) */
  angle: number;
  attack: 'slash' | 'thrust' | 'shoot' | 'cast' | 'bash';
}

export const WEAPON_POSE: Record<WeaponType, WeaponPose> = {
  sword: { arm: -25, angle: 40, attack: 'slash' },
  greatsword: { arm: -40, angle: 62, attack: 'slash' },
  hammer: { arm: -20, angle: 22, attack: 'slash' },
  spear: { arm: -55, angle: 78, attack: 'thrust' },
  shield: { arm: -55, angle: 0, attack: 'bash' },
  crossbow: { arm: -80, angle: 90, attack: 'shoot' },
  gun: { arm: -78, angle: 90, attack: 'shoot' },
  bow: { arm: -85, angle: 0, attack: 'shoot' },
  staff: { arm: -24, angle: 6, attack: 'cast' },
  book: { arm: -62, angle: 0, attack: 'cast' },
  mic: { arm: -150, angle: -35, attack: 'cast' },
  syringe: { arm: -30, angle: 45, attack: 'slash' },
  none: { arm: -12, angle: 0, attack: 'slash' },
};

/** 피벗 = 손잡이, 위(-y)를 향해 그림 */
export function drawWeapon(g: G, s: SDSpec): void {
  const w = s.weapon;
  const metal = w.color;
  const acc = w.accent ?? 0xffcc33;
  const wood = 0x6b4a2f;
  const dark = 0x2a2d33;
  switch (w.type) {
    case 'sword':
      poly(g, [[-3, -2], [3, -2], [3, 16], [-3, 16]], dark);
      ellipse(g, 0, 18, 4, 4, acc);
      shape(g, [[-5, -7, true], [5, -7, true], [5, -92, true], [0, -106, true], [-5, -92, true]], metal);
      g.lineStyle(1.6, lighten(metal, 25), 1);
      g.lineBetween(0, -12, 0, -92);
      poly(g, [[-14, -8], [14, -8], [14, -2], [-14, -2]], acc);
      break;
    case 'greatsword':
      poly(g, [[-3.5, -2], [3.5, -2], [3.5, 24], [-3.5, 24]], dark);
      shape(g, [[-10, -9, true], [10, -9, true], [11, -122, true], [0, -140, true], [-11, -122, true]], metal);
      g.lineStyle(2, lighten(metal, 25), 1);
      g.lineBetween(0, -14, 0, -122);
      poly(g, [[-19, -10], [19, -10], [19, -2], [-19, -2]], acc);
      break;
    case 'hammer':
      poly(g, [[-3, 26], [3, 26], [3, -96], [-3, -96]], wood);
      shape(g, [[-27, -124, true], [27, -124, true], [27, -92, true], [-27, -92, true]], metal);
      g.fillStyle(acc, 1);
      g.fillRect(-27, -112, 54, 7);
      break;
    case 'spear':
      poly(g, [[-2.5, 44], [2.5, 44], [2.5, -118], [-2.5, -118]], wood);
      shape(g, [[-8, -116, true], [8, -116, true], [0, -152, true]], metal);
      poly(g, [[-5, -112], [5, -112], [3, -98], [-3, -98]], acc);
      break;
    case 'shield':
      poly(g, [[-3, 0], [3, 0], [3, 10], [-3, 10]], dark);
      shape(g, [[-28, -52], [28, -52], [30, 0], [0, 28, true], [-30, 0]], metal);
      shape(g, [[-20, -44], [20, -44], [22, -2], [0, 18, true], [-22, -2]], darken(metal, 18), null);
      poly(g, [[0, -34], [11, -16], [0, 2], [-11, -16]], acc);
      break;
    case 'crossbow':
      poly(g, [[-5, -62], [5, -62], [5, 14], [-5, 14]], wood);
      poly(g, [[-3, -84], [3, -84], [3, -58], [-3, -58]], metal);
      g.lineStyle(1.4, 0xe8e8e8, 1);
      g.lineBetween(-30, -54, 30, -54);
      g.lineStyle(6, lineOf(metal), 1);
      g.strokePoints(curve([[-31, -52], [0, -70], [31, -52]], false), false);
      g.lineStyle(3.5, metal, 1);
      g.strokePoints(curve([[-31, -52], [0, -70], [31, -52]], false), false);
      ellipse(g, 0, -60, 4, 4, acc);
      break;
    case 'gun':
      poly(g, [[-6, -52], [6, -52], [6, 10], [-6, 10]], dark);
      poly(g, [[-3, -104], [3, -104], [3, -52], [-3, -52]], metal);
      poly(g, [[6, -62], [13, -62], [13, -32], [6, -32]], dark);
      poly(g, [[-6, 10], [8, 10], [10, 30], [-4, 30]], wood);
      g.fillStyle(acc, 1);
      g.fillRect(-6, -40, 12, 4);
      break;
    case 'bow':
      g.lineStyle(1.4, 0xeeeeee, 1);
      g.lineBetween(8, -70, 8, 70);
      g.lineStyle(7, lineOf(wood), 1);
      g.strokePoints(curve([[8, -72], [-12, -30], [-14, 0], [-12, 30], [8, 72]], false), false);
      g.lineStyle(4, wood, 1);
      g.strokePoints(curve([[8, -72], [-12, -30], [-14, 0], [-12, 30], [8, 72]], false), false);
      ellipse(g, -14, 0, 4, 7, acc);
      break;
    case 'staff':
      poly(g, [[-2.5, 38], [2.5, 38], [2.5, -96], [-2.5, -96]], wood);
      g.fillStyle(acc, 0.25);
      g.fillCircle(0, -110, 20);
      g.lineStyle(5, lineOf(acc), 1);
      g.strokeCircle(0, -110, 13);
      g.lineStyle(3, metal, 1);
      g.strokeCircle(0, -110, 13);
      ellipse(g, 0, -110, 7, 7, acc);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(-2, -113, 2.5);
      break;
    case 'book':
      poly(g, [[-16, -36], [16, -36], [16, -4], [-16, -4]], acc);
      g.fillStyle(0xf5f0e1, 1);
      g.fillRect(14, -34, 3, 28);
      poly(g, [[0, -28], [6, -20], [0, -12], [-6, -20]], metal, null);
      break;
    case 'mic':
      poly(g, [[-3, -2], [3, -2], [3, 22], [-3, 22]], dark);
      ellipse(g, 0, -12, 10, 10, metal);
      g.lineStyle(1.2, darken(metal, 30), 1);
      g.lineBetween(-8, -12, 8, -12);
      g.lineBetween(0, -21, 0, -3);
      g.fillStyle(acc, 1);
      g.fillRect(-4, -2, 8, 4);
      break;
    case 'syringe':
      poly(g, [[-1, -70], [1, -70], [1, -94], [-1, -94]], 0xcfd6dc);
      shape(g, [[-7, -70, true], [7, -70, true], [7, -12, true], [-7, -12, true]], 0xeef4f7);
      g.fillStyle(acc, 0.9);
      g.fillRect(-5, -60, 10, 34);
      poly(g, [[-13, -14], [13, -14], [13, -9], [-13, -9]], metal);
      poly(g, [[-2, -10], [2, -10], [2, 12], [-2, 12]], metal);
      poly(g, [[-8, 12], [8, 12], [8, 16], [-8, 16]], metal);
      break;
    case 'none':
      break;
  }
}
