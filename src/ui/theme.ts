export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const GAME_W = 1920;
export const GAME_H = 1080;

export const COLORS = {
  bg: 0x14161a,
  panel: 0x1d2026,
  panelLight: 0x2a2e36,
  line: 0x3a3f48,
  text: '#f2f2f2',
  textDim: '#9aa0a6',
  accent: 0xf2c94c,
  accentText: '#f2c94c',
  danger: 0xe0524a,
  ok: 0x58c46b,
  shadow: 0x2a0033,
};

export function textStyle(size: number, color = COLORS.text, weight: 400 | 700 | 900 = 700): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight === 400 ? 'normal' : 'bold' };
}
