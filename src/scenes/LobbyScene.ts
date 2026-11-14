/**
 * 메인 화면 (로비).
 * 명일방주 메인 화면 구성을 단순화: 왼쪽 비서 캐릭터 + 대사 / 오른쪽 기울어진 메뉴 패널 묶음 + 재화 바.
 */
import Phaser from 'phaser';
import { OPERATOR_MAP, OPERATORS } from '../data/operators';
import type { OperatorDef } from '../data/types';
import { createSDView, type SDView } from '../sd/factory';
import { artFor, sdImageFor } from '../sd/registry';
import { textStyle } from '../ui/theme';
import { activeSquad, loadSave } from '../data/save';

const INK = '#16181d';
const INK_N = 0x16181d;
const PAPER = 0xf4f5f7;
const ACCENT = 0xf2c94c;
const ACCENT_S = '#f2c94c';
/** 패널 왼쪽 사선 기울기 (px) */
const SLANT = 22;

/** 비서 대사 (멤버별, 없으면 기본) */
const LINES: Record<string, string[]> = {
  ine: ['매니저님, 오셨어요?', '오늘도 무리하지 말고요.', '작전 준비는 다 끝났어요.', '후후, 저 보러 오신 거죠?', '다치면 바로 말해요. 제가 고쳐줄게요.'],
};
const DEFAULT_LINES = ['매니저님, 오늘도 잘 부탁해요.', '작전 개시할까요?', '왁엔터 사옥은 오늘도 평화롭네요.'];

interface PanelOpts {
  title: string;
  sub: string;
  big?: boolean;
  dark?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export class LobbyScene extends Phaser.Scene {
  private secretary?: SDView;
  /** 일반 캐릭터 그림 (있으면 SD 대신 사용) */
  private art?: Phaser.GameObjects.Image;
  private artBaseY = 0;
  private artScale = 1;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleText!: Phaser.GameObjects.Text;
  private lineIdx = 0;
  private toast!: Phaser.GameObjects.Text;
  private secDef!: OperatorDef;

  constructor() {
    super('lobby');
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const u = H / 1080;
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.drawBackground(W, H);
    this.secDef = this.pickSecretary();
    this.createSecretary(W, H, u);
    this.createProfile(u);
    this.createMenu(W, H, u);
    this.createNews(u);

    this.toast = this.add
      .text(W / 2, H - 80 * u, '', { ...textStyle(Math.round(28 * u), '#ffffff', 700), backgroundColor: '#000000cc', padding: { x: 20, y: 10 } })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);

    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.time.delayedCall(500, () => this.say());
  }

  update(time: number): void {
    this.secretary?.tick(time);
    if (this.art) {
      // 일러스트 숨쉬기: 아주 살짝 위아래 + 세로로 늘었다 줄었다
      const b = Math.sin(time / 1000 * 1.6);
      this.art.y = this.artBaseY + b * 3;
      this.art.scaleY = this.artScale * (1 + b * 0.004);
    }
  }

  // ───────────────────────── 배경 ─────────────────────────

  private drawBackground(W: number, H: number): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x2b3038, 0x1f232a, 0x14161b, 0x0e1014, 1);
    g.fillRect(0, 0, W, H);
    // 원근감 있는 바닥 격자
    g.lineStyle(1, 0xffffff, 0.05);
    const hy = H * 0.62;
    for (let i = -20; i <= 20; i++) g.lineBetween(W * 0.35 + i * 30, hy, W * 0.35 + i * 220, H);
    for (let k = 0; k < 8; k++) {
      const y = hy + (H - hy) * Math.pow(k / 8, 1.8);
      g.lineBetween(0, y, W, y);
    }
    // 건물 실루엣 (사선 기둥)
    g.fillStyle(0xffffff, 0.035);
    for (const [x, w] of [
      [0.08, 0.05],
      [0.17, 0.03],
      [0.42, 0.07],
      [0.55, 0.025],
    ]) {
      g.fillPoints(
        [
          new Phaser.Math.Vector2(W * x, 0),
          new Phaser.Math.Vector2(W * (x + w), 0),
          new Phaser.Math.Vector2(W * (x + w) - 40, hy),
          new Phaser.Math.Vector2(W * x - 40, hy),
        ],
        true,
      );
    }
    // 비서 뒤 은은한 빛
    const glow = this.add.graphics();
    for (let i = 12; i > 0; i--) {
      glow.fillStyle(0x9b7cff, 0.012 * (13 - i));
      glow.fillCircle(W * 0.27, H * 0.55, i * 38 * (H / 1080));
    }
    // 오른쪽 아래 대각선 장식 띠
    g.fillStyle(ACCENT, 0.9);
    g.fillPoints(
      [new Phaser.Math.Vector2(0, H - 8), new Phaser.Math.Vector2(W * 0.38, H - 8), new Phaser.Math.Vector2(W * 0.38 - 8, H), new Phaser.Math.Vector2(0, H)],
      true,
    );
  }

  // ───────────────────────── 비서 ─────────────────────────

  private pickSecretary(): OperatorDef {
    const id = loadSave().secretary;
    if (id && OPERATOR_MAP[id]) return OPERATOR_MAP[id];
    // 그림이 있는 멤버를 우선
    return OPERATORS.find((o) => sdImageFor(this, o.id)) ?? OPERATOR_MAP.ine ?? OPERATORS[0];
  }

  private createSecretary(W: number, H: number, u: number): void {
    const art = artFor(this, this.secDef.id);
    let x = W * 0.27;
    const y = H * 0.94;
    let bubbleX = x - 250 * u;
    let bubbleY = H * 0.235;
    if (art) {
      // 일반 캐릭터 그림: 화면 아래에 붙여 크게 (아래가 잘린 구도면 화면 밖까지)
      x = W * 0.29;
      const img = this.add.image(x, H, art.key).setOrigin(0.5, 1);
      const targetH = art.croppedBottom ? H * 0.93 : H * 0.88;
      this.artScale = targetH / img.height;
      img.setScale(this.artScale).setFlipX(art.facing === 'left');
      this.artBaseY = art.croppedBottom ? H + 2 : H * 0.97;
      img.y = this.artBaseY;
      this.art = img;
      // 왼쪽에서 살짝 밀려 들어오며 나타남
      img.setAlpha(0).x -= 60 * u;
      this.tweens.add({ targets: img, x, alpha: 1, duration: 500, ease: 'Cubic.out' });
      img.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 40 });
      img.on('pointerdown', () => {
        this.tweens.add({ targets: img, scaleX: this.artScale * 1.015, duration: 90, yoyo: true });
        this.say();
      });
      bubbleX = x - img.displayWidth * 0.62;
      bubbleY = H * 0.5;
    } else {
      this.add.ellipse(x, y, 360 * u, 50 * u, 0x000000, 0.35);
      this.secretary = createSDView(this, this.secDef).setPosition(x, y).setHeightPx(H * 0.7);
      const zone = this.add.zone(x, y - H * 0.35, H * 0.4, H * 0.7).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.secretary?.playAttack(this.time.now);
        this.say();
      });
    }

    // 대사 말풍선
    this.bubble = this.add.container(Math.max(24 * u, bubbleX), bubbleY).setAlpha(0);
    const bw = 440 * u;
    const bh = 96 * u;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.72);
    bg.fillPoints(
      [
        new Phaser.Math.Vector2(SLANT * u, 0),
        new Phaser.Math.Vector2(bw, 0),
        new Phaser.Math.Vector2(bw - SLANT * u, bh),
        new Phaser.Math.Vector2(0, bh),
      ],
      true,
    );
    bg.fillStyle(ACCENT, 1).fillRect(SLANT * u, 0, 70 * u, 4 * u);
    const name = this.add.text(30 * u, 14 * u, this.secDef.name, textStyle(Math.round(20 * u), ACCENT_S, 700));
    this.bubbleText = this.add.text(30 * u, 44 * u, '', { ...textStyle(Math.round(26 * u), '#ffffff', 400), wordWrap: { width: bw - 60 * u } });
    this.bubble.add([bg, name, this.bubbleText]);
  }

  private say(): void {
    const lines = LINES[this.secDef.id] ?? DEFAULT_LINES;
    this.bubbleText.setText(lines[this.lineIdx % lines.length]);
    this.lineIdx++;
    this.tweens.killTweensOf(this.bubble);
    this.bubble.setAlpha(0).setY(this.bubble.y);
    this.tweens.add({ targets: this.bubble, alpha: 1, duration: 200 });
    this.tweens.add({ targets: this.bubble, alpha: 0, delay: 3500, duration: 400 });
  }

  // ───────────────────────── 프로필 / 상단 ─────────────────────────

  private createProfile(u: number): void {
    const x = 48 * u;
    const y = 44 * u;
    // 아이콘 버튼 (설정=전체화면, 도감)
    const icon = (ix: number, label: string, onClick: () => void) => {
      const c = this.add.container(ix, y);
      const bg = this.add.rectangle(0, 0, 64 * u, 56 * u, 0x000000, 0.5).setStrokeStyle(1, 0xffffff, 0.15);
      const t = this.add.text(0, 0, label, textStyle(Math.round(26 * u), '#ffffff', 700)).setOrigin(0.5);
      c.add([bg, t]);
      c.setSize(64 * u, 56 * u).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => c.setScale(0.94));
      c.on('pointerup', () => {
        c.setScale(1);
        onClick();
      });
      c.on('pointerout', () => c.setScale(1));
    };
    icon(x, '⛶', () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()));
    icon(x + 76 * u, '✉', () => this.showToast('새 메일이 없습니다'));

    // 레벨 원 + 이름
    const py = 190 * u;
    const g = this.add.graphics();
    g.lineStyle(6 * u, 0xffffff, 0.25).strokeCircle(x + 52 * u, py, 52 * u);
    g.lineStyle(6 * u, ACCENT, 1);
    g.beginPath();
    g.arc(x + 52 * u, py, 52 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.35, false);
    g.strokePath();
    this.add.text(x + 52 * u, py - 8 * u, '1', textStyle(Math.round(44 * u), '#ffffff', 900)).setOrigin(0.5);
    this.add.text(x + 52 * u, py + 28 * u, 'LV', textStyle(Math.round(16 * u), '#c9ccd2', 700)).setOrigin(0.5);
    this.add.text(x + 124 * u, py - 30 * u, '매니저', textStyle(Math.round(34 * u), '#ffffff', 900));
    this.add.text(x + 126 * u, py + 14 * u, 'WAK ENTERTAINMENT', textStyle(Math.round(16 * u), '#9aa0a6', 700)).setLetterSpacing(2);
  }

  /** 상단 아이콘 옆 한 줄 소식 */
  private createNews(u: number): void {
    const x = 196 * u;
    const y = 44 * u;
    const c = this.add.container(x, y);
    const w = 460 * u;
    const h = 40 * u;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5).fillRect(0, -h / 2, w, h);
    bg.fillStyle(0xe0413a, 1).fillRect(0, -h / 2, 72 * u, h);
    const tag = this.add.text(36 * u, 0, 'NEWS', textStyle(Math.round(15 * u), '#ffffff', 900)).setOrigin(0.5).setLetterSpacing(2);
    const t = this.add.text(88 * u, 0, '아이네 SD 추가 · 메인 화면 오픈', textStyle(Math.round(19 * u), '#e6e8eb', 700)).setOrigin(0, 0.5);
    c.add([bg, tag, t]);
  }

  // ───────────────────────── 메뉴 패널 ─────────────────────────

  private createMenu(W: number, _H: number, u: number): void {
    const left = Math.max(W * 0.48, W - 1000 * u);
    const right = W - 44 * u;
    const bw = right - left;
    const top = 128 * u;
    const gap = 14 * u;

    // 재화 바 (오른쪽 위)
    this.createResources(right, 50 * u, u);

    // 메뉴 묶음 전체를 살짝 기울여 입체감
    const group = this.add.container(0, 0);
    const add = (x: number, y: number, w: number, h: number, o: PanelOpts) => group.add(this.panel(x, y, w, h, u, o));

    const r1h = 230 * u;
    const r2h = 118 * u;
    const opW = bw * 0.6;
    add(left, top, opW, r1h, {
      title: '작전',
      sub: 'OPERATION',
      big: true,
      dark: true,
      onClick: () => {
        if (!activeSquad().length) {
          this.showToast('편성에서 분대를 먼저 구성해 주세요');
          return;
        }
        this.go('battle', { stageId: '0-1' });
      },
    });
    // 현재 작전 정보 (작전 패널 안)
    const info = this.add.container(left + 40 * u, top + r1h - 70 * u);
    info.add([
      this.add.text(0, 0, '현재', textStyle(Math.round(16 * u), '#16181d', 900)).setBackgroundColor(ACCENT_S).setPadding(6 * u, 2 * u),
      this.add.text(58 * u, -2 * u, '0-1  고멤 사무실 습격', textStyle(Math.round(22 * u), '#ffffff', 700)),
      this.add.text(0, 32 * u, '텐션 ∞', textStyle(Math.round(18 * u), '#9aa0a6', 700)),
    ]);
    group.add(info);

    // 이벤트 배너
    add(left + opW + gap, top, bw - opW - gap, r1h, {
      title: '이벤트',
      sub: 'SHADOW OUTBREAK',
      disabled: true,
    });

    let y = top + r1h + gap;
    add(left, y, bw * 0.36, r2h, { title: '편성', sub: 'SQUAD', onClick: () => this.go('squad') });
    add(left + bw * 0.36 + gap, y, bw * 0.64 - gap, r2h, { title: '멤버', sub: 'MEMBERS', onClick: () => this.go('sd-gallery') });
    y += r2h + gap;
    add(left, y, bw * 0.36, r2h, { title: '상점', sub: 'STORE', disabled: true });
    add(left + bw * 0.36 + gap, y, bw * 0.64 - gap, r2h, { title: '오디션', sub: 'AUDITION', disabled: true });
    y += r2h + gap;
    add(left, y, bw * 0.5 - gap / 2, r2h, { title: '임무', sub: 'MISSION', disabled: true });
    add(left + bw * 0.5 + gap / 2, y, bw * 0.5 - gap / 2, r2h, { title: '왁엔터 사옥', sub: 'HEADQUARTERS', disabled: true });

    // 메뉴 묶음 중심을 기준으로 살짝 회전 (모서리 기준이면 오른쪽이 들려 올라감) + 등장 애니메이션
    const cx = left + bw / 2;
    const cy = (top + y + r2h) / 2;
    group.each((child: Phaser.GameObjects.Container) => {
      child.x -= cx;
      child.y -= cy;
    });
    group.setPosition(cx + 40 * u, cy).setAngle(-2).setAlpha(0);
    this.tweens.add({ targets: group, x: cx, alpha: 1, duration: 380, ease: 'Cubic.out' });
  }

  private panel(x: number, y: number, w: number, h: number, u: number, o: PanelOpts): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const s = SLANT * u;
    const pts = [new Phaser.Math.Vector2(s, 0), new Phaser.Math.Vector2(w, 0), new Phaser.Math.Vector2(w - s, h), new Phaser.Math.Vector2(0, h)];
    const bg = this.add.graphics();
    const draw = (hover: boolean) => {
      bg.clear();
      const fill = o.dark ? (hover ? 0x2a2e36 : 0x1d2026) : hover ? 0xffffff : PAPER;
      bg.fillStyle(fill, o.disabled ? 0.78 : 0.96);
      bg.fillPoints(pts, true);
      if (o.dark) {
        bg.lineStyle(2 * u, 0xffffff, 0.2).strokePoints(pts, true);
        bg.fillStyle(ACCENT, 1).fillPoints(
          [new Phaser.Math.Vector2(s, 0), new Phaser.Math.Vector2(s + 10 * u, 0), new Phaser.Math.Vector2(10 * u, h), new Phaser.Math.Vector2(0, h)],
          true,
        );
      }
    };
    draw(false);
    const color = o.dark ? '#ffffff' : o.disabled ? '#5c616b' : INK;
    const titleSize = Math.round((o.big ? 84 : 46) * u);
    const tx = (o.big ? 44 : 34) * u;
    const title = this.add.text(tx, o.big ? 34 * u : h / 2 - 6 * u, o.title, textStyle(titleSize, color, 900)).setOrigin(0, o.big ? 0 : 0.5);
    const sub = this.add
      .text(o.big ? tx + 4 * u : tx + 2 * u, o.big ? 34 * u + titleSize * 1.15 : h / 2 + titleSize * 0.5, o.sub, textStyle(Math.round((o.big ? 20 : 15) * u), o.dark ? '#9aa0a6' : '#6b7079', 700))
      .setLetterSpacing(3);
    // 오른쪽 장식: 얇은 사선 줄
    const deco = this.add.graphics();
    deco.lineStyle(2 * u, o.dark ? 0xffffff : INK_N, o.dark ? 0.12 : 0.1);
    for (let i = 0; i < 4; i++) deco.lineBetween(w - (60 + i * 14) * u, 12 * u, w - (60 + i * 14) * u - h * 0.35, h - 12 * u);
    c.add([bg, deco, title, sub]);
    if (o.disabled) {
      const tag = this.add
        .text(w - s - 16 * u, 16 * u, '준비 중', textStyle(Math.round(15 * u), '#ffffff', 700))
        .setOrigin(1, 0)
        .setBackgroundColor('#00000099')
        .setPadding(8 * u, 3 * u);
      c.add(tag);
    }
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Polygon(pts), Phaser.Geom.Polygon.Contains);
    if (c.input) c.input.cursor = 'pointer';
    c.on('pointerover', () => draw(true));
    c.on('pointerout', () => {
      draw(false);
      c.setScale(1);
    });
    c.on('pointerdown', () => c.setScale(0.97));
    c.on('pointerup', () => {
      c.setScale(1);
      if (o.disabled) this.showToast(`${o.title}: 준비 중입니다`);
      else o.onClick?.();
    });
    return c;
  }

  private createResources(right: number, y: number, u: number): void {
    const items: { label: string; value: string; draw: (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) => void }[] = [
      {
        label: '텐션',
        value: '∞',
        draw: (g, cx, cy, r) => {
          g.fillStyle(0x58c4ff, 1).fillTriangle(cx + r * 0.2, cy - r, cx - r * 0.6, cy + r * 0.15, cx + r * 0.05, cy + r * 0.15);
          g.fillTriangle(cx - r * 0.2, cy + r, cx + r * 0.6, cy - r * 0.15, cx - r * 0.05, cy - r * 0.15);
        },
      },
      {
        label: '후원금',
        value: '12,000',
        draw: (g, cx, cy, r) => {
          g.fillStyle(ACCENT, 1).fillCircle(cx, cy, r);
          g.lineStyle(2, 0x7a5c12, 1).strokeCircle(cx, cy, r * 0.6);
        },
      },
      {
        label: '왁굳 다이아',
        value: '300',
        draw: (g, cx, cy, r) => {
          g.fillStyle(0xff5a7a, 1).fillPoints(
            [new Phaser.Math.Vector2(cx, cy - r), new Phaser.Math.Vector2(cx + r * 0.8, cy), new Phaser.Math.Vector2(cx, cy + r), new Phaser.Math.Vector2(cx - r * 0.8, cy)],
            true,
          );
        },
      },
    ];
    let x = right;
    for (const it of [...items].reverse()) {
      const w = 210 * u;
      const h = 52 * u;
      x -= w;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.55);
      g.fillPoints(
        [new Phaser.Math.Vector2(x + 12 * u, y - h / 2), new Phaser.Math.Vector2(x + w, y - h / 2), new Phaser.Math.Vector2(x + w - 12 * u, y + h / 2), new Phaser.Math.Vector2(x, y + h / 2)],
        true,
      );
      it.draw(g, x + 38 * u, y, 14 * u);
      this.add.text(x + w - 22 * u, y, it.value, textStyle(Math.round(26 * u), '#ffffff', 900)).setOrigin(1, 0.5);
      x -= 10 * u;
    }
  }

  // ───────────────────────── 기타 ─────────────────────────

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
