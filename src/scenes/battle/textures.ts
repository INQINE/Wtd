import Phaser from 'phaser';
import type { EnemyDef } from '../../data/types';

/** 텍스처 해상도: 월드 1칸 = 128px */
export const TEX_PER_TILE = 128;
export const EN_TEX = 128;

const OUTLINE = 0x15171b;

/** Graphics/Text 여러 개를 한 장의 텍스처로 굽는다 */
function bake(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => Phaser.GameObjects.Text[] | void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  const texts = draw(g) ?? [];
  const dt = scene.textures.addDynamicTexture(key, w, h);
  if (!dt) return;
  dt.draw(g);
  for (const t of texts) dt.draw(t);
  g.destroy();
  texts.forEach((t) => t.destroy());
}

/** 적(왁두 계열) 임시 그래픽. 발끝이 텍스처 아래 중앙. */
export function ensureEnemyTexture(scene: Phaser.Scene, def: EnemyDef): string {
  const key = `enemy-${def.id}`;
  bake(scene, key, EN_TEX, EN_TEX, (g) => {
    const c = def.color;
    const S = def.shape === 'small' ? 0.72 : 1;
    const cx = 64;
    const base = 124;
    const r = 40 * S;
    const cy = base - r - 8 * S;
    // 흑화 오라
    g.fillStyle(0x9b30ff, 0.18);
    g.fillCircle(cx, cy, r * 1.35);
    // 발
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(cx - r * 0.45, base - 4, r * 0.6, r * 0.3);
    g.fillEllipse(cx + r * 0.45, base - 4, r * 0.6, r * 0.3);
    g.fillStyle(c, 1);
    g.lineStyle(4, 0x2a0033, 1);
    switch (def.shape) {
      case 'square': {
        g.fillRoundedRect(cx - r, cy - r, r * 2, r * 2, 10);
        g.strokeRoundedRect(cx - r, cy - r, r * 2, r * 2, 10);
        g.fillStyle(0xb8c2cc, 0.55);
        g.fillRect(cx - r + 6, cy - r * 0.15, r * 2 - 12, 8);
        g.fillRect(cx - 4, cy - r + 6, 8, r * 2 - 12);
        break;
      }
      case 'triangle': {
        g.fillTriangle(cx, cy - r * 1.2, cx + r * 1.05, cy + r, cx - r * 1.05, cy + r);
        g.strokeTriangle(cx, cy - r * 1.2, cx + r * 1.05, cy + r, cx - r * 1.05, cy + r);
        // 활
        g.lineStyle(4, 0xd9b26f, 1);
        g.beginPath();
        g.arc(cx + r * 0.9, cy + r * 0.2, r * 0.7, -1.2, 1.2);
        g.strokePath();
        break;
      }
      case 'diamond': {
        g.fillStyle(0xdfe9ee, 0.95);
        g.fillTriangle(cx - r * 0.8, cy, cx - r * 2, cy - r * 0.9, cx - r * 1.5, cy + r * 0.4);
        g.fillTriangle(cx + r * 0.8, cy, cx + r * 2, cy - r * 0.9, cx + r * 1.5, cy + r * 0.4);
        g.fillStyle(c, 1);
        g.fillCircle(cx, cy, r);
        g.strokeCircle(cx, cy, r);
        break;
      }
      default: {
        g.fillCircle(cx, cy, r);
        g.strokeCircle(cx, cy, r);
        if (def.shape === 'circle') {
          // 투구
          g.fillStyle(0x3a3f48, 1);
          g.fillEllipse(cx, cy - r * 0.6, r * 1.7, r * 0.8);
        }
      }
    }
    // 빨간 눈
    const ey = def.shape === 'triangle' ? cy + r * 0.25 : cy;
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx - r * 0.32, ey, r * 0.42, r * 0.5);
    g.fillEllipse(cx + r * 0.32, ey, r * 0.42, r * 0.5);
    g.fillStyle(0xff2020, 1);
    g.fillCircle(cx - r * 0.38, ey + 2, r * 0.13);
    g.fillCircle(cx + r * 0.26, ey + 2, r * 0.13);
  });
  return key;
}

/** HUD 아이콘들 */
export function ensureHudIcons(scene: Phaser.Scene): void {
  // 적 아이콘 (왁두 얼굴)
  bake(scene, 'icon-enemy', 64, 64, (g) => {
    g.fillStyle(0xc0392b, 1);
    g.fillCircle(32, 34, 24);
    g.lineStyle(3, 0x2a0033, 1);
    g.strokeCircle(32, 34, 24);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(24, 32, 10, 12);
    g.fillEllipse(40, 32, 10, 12);
    g.fillStyle(0x000000, 1);
    g.fillCircle(23, 33, 3);
    g.fillCircle(39, 33, 3);
  });
  // 방어점(체력) 아이콘
  bake(scene, 'icon-life', 64, 64, (g) => {
    const pts = [new Phaser.Math.Vector2(32, 6), new Phaser.Math.Vector2(58, 32), new Phaser.Math.Vector2(32, 58), new Phaser.Math.Vector2(6, 32)];
    g.fillStyle(0x2f80ed, 1);
    g.fillPoints(pts, true);
    g.lineStyle(4, 0xd6e8ff, 1);
    g.strokePoints(pts, true);
    g.fillStyle(0xffffff, 0.9);
    g.fillPoints([new Phaser.Math.Vector2(32, 20), new Phaser.Math.Vector2(44, 32), new Phaser.Math.Vector2(32, 44), new Phaser.Math.Vector2(20, 32)], true);
  });
  // 코스트 아이콘 (육각형)
  bake(scene, 'icon-cost', 64, 64, (g) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(new Phaser.Math.Vector2(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26));
    }
    g.fillStyle(0xf2f2f2, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0x1d2026, 1);
    g.fillCircle(32, 32, 10);
  });
  // 원형 글로우
  bake(scene, 'glow', 128, 128, (g) => {
    for (let i = 16; i > 0; i--) {
      g.fillStyle(0xffffff, 0.035 * (17 - i) * 0.35);
      g.fillCircle(64, 64, i * 4);
    }
  });
}
