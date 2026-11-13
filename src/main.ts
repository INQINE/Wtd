import Phaser from 'phaser';
import { BattleScene } from './scenes/battle/BattleScene';
import { TitleScene } from './scenes/TitleScene';
import { COLORS, GAME_H, GAME_W } from './ui/theme';

async function waitFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 32px "Noto Sans KR"'), document.fonts.load('900 32px "Noto Sans KR"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    // 폰트를 못 불러와도 기본 폰트로 진행
  }
}

waitFonts().then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_W,
      height: GAME_H,
    },
    input: { activePointers: 2 },
    scene: [TitleScene, BattleScene],
  });
  (window as unknown as { game: Phaser.Game }).game = game;
});
