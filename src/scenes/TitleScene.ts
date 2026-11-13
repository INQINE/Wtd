import Phaser from 'phaser';
import { Button } from '../ui/button';
import { COLORS, textStyle } from '../ui/theme';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    const GAME_W = this.scale.width;
    const GAME_H = this.scale.height;
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const g = this.add.graphics();
    // 배경: 사선 줄무늬 + 그라데이션 느낌
    g.fillGradientStyle(0x1b1e24, 0x1b1e24, 0x0c0d10, 0x0c0d10, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.lineStyle(2, 0xffffff, 0.03);
    for (let x = -GAME_H; x < GAME_W; x += 48) g.lineBetween(x, GAME_H, x + GAME_H, 0);
    g.fillStyle(COLORS.accent, 1).fillRect(0, GAME_H - 10, GAME_W, 10);
    g.fillStyle(COLORS.accent, 0.9).fillRect(160, 300, 12, 230);

    this.add.text(200, 300, 'WAKTA KNIGHTS', textStyle(40, COLORS.accentText, 900)).setOrigin(0, 0);
    this.add.text(196, 350, '왁방주', textStyle(150, '#ffffff', 900)).setOrigin(0, 0);
    this.add.text(204, 540, 'M0.5 프로토타입 · 2.5D · 임시 그래픽', textStyle(28, COLORS.textDim, 400));

    new Button(this, GAME_W - 360, 640, 460, 110, '작전 개시', () => this.scene.start('battle', { stageId: '0-1' }), {
      fill: 0x7a5c12,
      stroke: COLORS.accent,
      fontSize: 44,
    });
    new Button(this, GAME_W - 360, 880, 460, 80, 'SD 도감', () => this.scene.start('sd-gallery'));
    new Button(this, GAME_W - 360, 780, 460, 80, '전체화면', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });

    const help = [
      '조작 방법',
      '· 아래 카드를 끌어서 초록색 칸에 놓기',
      '· 놓은 뒤 멤버에서 바깥쪽으로 드래그해서 방향 정하기',
      '· 배치된 멤버를 누르면 정보 / 퇴각',
      '· 선택 후 스킬 버튼으로 스킬 발동',
      '· PC 단축키: Space 일시정지, F 배속, E 스킬, Q 퇴각, Esc 취소/메뉴, 1~9 카드',
    ];
    this.add.text(200, 660, help.join('\n'), { ...textStyle(26, COLORS.text, 400), lineSpacing: 10 });
  }
}
