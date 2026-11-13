#!/usr/bin/env node
/**
 * 일반 캐릭터 그림(스탠딩 일러스트) 가져오기: AI 배경 제거 → 여백 자르기 → 크기 맞추기 → manifest 등록
 * 배경이 복잡한 일러스트도 인물만 분리한다 (@imgly/background-removal-node 모델, scripts/rmbg-worker.mjs 에서 실행).
 *
 *   node scripts/art-import.mjs <그림> <멤버id> [--facing left|right] [--model small|medium] [--keep-bg]
 *     --erase "x0,y0,x1,y1,#rrggbb,허용치;..."   결과 그림 기준(0~1) 영역 안에서 그 색에 가까운 픽셀을 지움
 *                                                (모델이 남긴 배경 조각 정리용)
 *
 * 결과: public/assets/sd/<id>-art.png, manifest.json 의 <id>.art
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('사용법: node scripts/art-import.mjs <그림> <멤버id> [--facing left]');
  process.exit(1);
}
const [input, id] = args;
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const facing = opt('facing', 'right');
const model = opt('model', 'medium');
const keepBg = args.includes('--keep-bg');
const OUT_DIR = path.resolve('public/assets/sd');
const MAX_H = 1600;

const t0 = Date.now();
let png = await sharp(input).ensureAlpha().png().toBuffer();
const meta = await sharp(png).metadata();
const corners = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const a = (x, y) => corners.data[(y * corners.info.width + x) * 4 + 3];
const alreadyTransparent = [a(0, 0), a(meta.width - 1, 0), a(0, meta.height - 1), a(meta.width - 1, meta.height - 1)].every((v) => v < 16);

if (!keepBg && !alreadyTransparent) {
  console.log(`배경 제거 중... (모델: ${model})`);
  // 배경 제거 모델은 별도 프로세스에서 실행 (sharp 버전 충돌 방지)
  fs.mkdirSync('.sd-raw', { recursive: true });
  const tmpIn = path.resolve('.sd-raw', `_rmbg-in-${id}.png`);
  const tmpOut = path.resolve('.sd-raw', `_rmbg-out-${id}.png`);
  fs.writeFileSync(tmpIn, png);
  execFileSync('node', [path.resolve('scripts/rmbg-worker.mjs'), tmpIn, tmpOut, model], { stdio: 'inherit' });
  png = fs.readFileSync(tmpOut);
  fs.rmSync(tmpIn);
  fs.rmSync(tmpOut);
}

// 인물과 떨어진 작은 배경 조각 제거 (가장 큰 덩어리의 3% 미만인 덩어리)
const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
{
  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  for (let st = 0; st < W * H; st++) {
    if (label[st] !== -1 || data[st * 4 + 3] <= 40) continue;
    const id2 = sizes.length;
    let n = 0;
    const stack = [st];
    label[st] = id2;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % W;
      const y = (i - x) / W;
      for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < H ? i + W : -1, y > 0 ? i - W : -1]) {
        if (j >= 0 && label[j] === -1 && data[j * 4 + 3] > 40) {
          label[j] = id2;
          stack.push(j);
        }
      }
    }
    sizes.push(n);
  }
  const main = Math.max(...sizes);
  let removed = 0;
  for (let i = 0; i < W * H; i++) {
    const l = label[i];
    if (l >= 0 && sizes[l] < main * 0.03) {
      data[i * 4 + 3] = 0;
      removed++;
    } else if (l < 0 && data[i * 4 + 3] > 0) {
      data[i * 4 + 3] = 0; // 아주 옅은 잔여물
    }
  }
  if (removed) console.log(`  떨어진 조각 ${removed}px 제거`);
  png = await sharp(Buffer.from(data.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// 지정 영역의 남은 배경색 지우기 (--erase, 좌표는 잘라낸 결과 기준이라 먼저 bbox를 구해서 적용)
const erases = (opt('erase', '') || '')
  .split(';')
  .filter(Boolean)
  .map((e) => {
    const p = e.split(',');
    const hex = p[4].replace('#', '');
    return { box: p.slice(0, 4).map(Number), rgb: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), tol: Number(p[5] ?? 60) };
  });

// 여백 자르기 (거의 투명한 픽셀은 무시)
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (data[(y * W + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
if (x1 < 0) {
  console.error('인물을 찾지 못했습니다.');
  process.exit(1);
}
const cw = x1 - x0 + 1;
const ch = y1 - y0 + 1;
if (erases.length) {
  let n = 0;
  for (const { box, rgb, tol } of erases) {
    for (let y = Math.floor(y0 + box[1] * ch); y <= Math.min(y1, y0 + box[3] * ch); y++)
      for (let x = Math.floor(x0 + box[0] * cw); x <= Math.min(x1, x0 + box[2] * cw); x++) {
        const k = (y * W + x) * 4;
        if (data[k + 3] === 0) continue;
        if (Math.hypot(data[k] - rgb[0], data[k + 1] - rgb[1], data[k + 2] - rgb[2]) <= tol) {
          data[k + 3] = 0;
          n++;
        }
      }
  }
  console.log(`  지정 영역 배경색 ${n}px 제거`);
  png = await sharp(Buffer.from(data.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
// 그림 아래가 잘린 일러스트(허벅지까지 등)인지: 아래쪽 가장자리에 그림이 닿아 있으면 true
let bottomTouch = 0;
for (let x = x0; x <= x1; x++) if (data[((H - 1) * W + x) * 4 + 3] > 40) bottomTouch++;
const croppedBottom = y1 >= H - 2 && bottomTouch > cw * 0.1;

fs.mkdirSync(OUT_DIR, { recursive: true });
const file = `${id}-art.png`;
await sharp(png)
  .extract({ left: x0, top: y0, width: cw, height: ch })
  .resize({ height: Math.min(MAX_H, ch), kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT_DIR, file));

const manifestPath = path.join(OUT_DIR, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
if (!manifest[id]) {
  console.error(`먼저 SD 그림을 가져와야 합니다: npm run sd:import -- <SD 그림> ${id}`);
  process.exit(1);
}
manifest[id].art = { file, facing, croppedBottom };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✔ ${id} 일반 그림: ${cw}×${ch} → ${file} (${((Date.now() - t0) / 1000).toFixed(0)}초${croppedBottom ? ', 아래가 잘린 구도' : ''})`);
