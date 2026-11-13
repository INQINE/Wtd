import Phaser from 'phaser';
import { COLORS, textStyle } from './theme';

export interface ButtonOptions {
  fill?: number;
  stroke?: number;
  fontSize?: number;
  textColor?: string;
  radius?: number;
}

/** 둥근 사각형 버튼. 클릭(탭) 시 onClick 호출. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private opts: Required<ButtonOptions>;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    text: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    this.opts = {
      fill: COLORS.panelLight,
      stroke: COLORS.line,
      fontSize: 28,
      textColor: COLORS.text,
      radius: 10,
      ...opts,
    };
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, textStyle(this.opts.fontSize, this.opts.textColor)).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.draw(this.opts.fill);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.draw(Phaser.Display.Color.ValueToColor(this.opts.fill).lighten(12).color));
    this.on('pointerout', () => {
      this.draw(this.opts.fill);
      this.setScale(1);
      this.pressed = false;
    });
    this.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.pressed = true;
      this.setScale(0.95);
    });
    this.on('pointerup', () => {
      this.setScale(1);
      // 이 버튼 위에서 눌렀다 뗀 경우에만 클릭으로 처리
      if (this.pressed) onClick();
      this.pressed = false;
    });
    scene.add.existing(this);
  }

  setFill(fill: number): this {
    this.opts.fill = fill;
    this.draw(fill);
    return this;
  }

  setText(t: string): this {
    this.label.setText(t);
    return this;
  }

  private draw(fill: number): void {
    const { w, h } = this;
    this.bg.clear();
    this.bg.fillStyle(fill, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, this.opts.radius);
    this.bg.lineStyle(2, this.opts.stroke, 1);
    this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, this.opts.radius);
  }
}
