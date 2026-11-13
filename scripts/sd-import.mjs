#!/usr/bin/env node
/**
 * SD 이미지 가져오기: 배경 제거 → 여백 자르기 → 크기 맞추기 → 발 위치 계산 → manifest 등록
 *
 *   node scripts/sd-import.mjs <이미지> <멤버id> [옵션]
 *     --facing left|right   그림이 바라보는 방향 (기본 right)
 *     --scale 1.0           게임 안 크기 배율 (무기가 큰 캐릭터는 1.2 등)
 *     --tolerance 32        배경색 판정 허용치 (0~255)
 *     --crop x,y,w,h        시트에서 일부만 잘라 쓰기
 *     --keep-bg             배경 제거 안 함
 *
 *   공격 동작 시트 (여러 프레임이 한 장에 있는 그림):
 *     --attack --frames 4 --grid 2x2 [--durations 0.09,0.16,0.2,0.24]
 *       칸을 왼쪽→오른쪽, 위→아래 순서로 잘라서 프레임으로 쓴다.
 *       모든 프레임을 같은 기준(발 위치)으로 맞춰 public/assets/sd/<id>-attack.png 로 저장.
 *
 * 결과: public/assets/sd/<id>.png, public/assets/sd/manifest.json
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('사용법: node scripts/sd-import.mjs <이미지> <멤버id> [--facing left] [--scale 1.2] [--crop x,y,w,h]');
  process.exit(1);
}
const [input, id] = args;
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const facing = opt('facing', 'right');
const scale = Number(opt('scale', '1'));
const tol = Number(opt('tolerance', '32'));
const crop = opt('crop', null);
const keepBg = args.includes('--keep-bg');

const OUT_DIR = path.resolve('public/assets/sd');
const MAX_H = 720;

const attackMode = args.includes('--attack');
if (attackMode) {
  await importAttackSheet();
  process.exit(0);
}

/** RGBA 버퍼에서 테두리부터 배경을 지운다 */
function removeBg(px, W, H) {
  const at = (x, y) => (y * W + x) * 4;
  const cornerAlpha = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)].map((k) => px[k + 3]);
  if (cornerAlpha.every((a) => a < 16)) return;
  const samples = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  const bg = [0, 1, 2].map((c) => samples.reduce((s, k) => s + px[k + c], 0) / samples.length);
  const near = (k) => Math.hypot(px[k] - bg[0], px[k + 1] - bg[1], px[k + 2] - bg[2]) <= tol;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
  for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (seen[i]) continue;
    seen[i] = 1;
    const k = i * 4;
    if (px[k + 3] < 16 || near(k)) {
      px[k + 3] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = at(x, y);
      if (px[k + 3] === 0) continue;
      if (![at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].some((n) => px[n + 3] === 0)) continue;
      const d = Math.hypot(px[k] - bg[0], px[k + 1] - bg[1], px[k + 2] - bg[2]);
      if (d < tol * 2.5) px[k + 3] = Math.round(255 * Math.min(1, d / (tol * 2.5)));
    }
}

/**
 * 옆 칸에서 넘어온 조각 제거: 가장 큰 덩어리(캐릭터)는 남기고,
 * 칸 가장자리에 닿아 있는 다른 덩어리는 지운다 (칸 안에 떠 있는 반짝이는 유지).
 */
function dropEdgeFragments(px, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1 || px[start * 4 + 3] <= 24) continue;
    const id = comps.length;
    const c = { size: 0, edge: false, pixels: [] };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      c.size++;
      c.pixels.push(i);
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.edge = true;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (label[j] === -1 && px[j * 4 + 3] > 24) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    comps.push(c);
  }
  if (!comps.length) return;
  const main = comps.reduce((a, b) => (b.size > a.size ? b : a));
  let removed = 0;
  for (const c of comps) {
    if (c === main || !c.edge) continue;
    for (const i of c.pixels) px[i * 4 + 3] = 0;
    removed += c.size;
  }
  if (removed) console.log(`  가장자리 조각 ${removed}px 제거`);
}

function bbox(px, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[(y * W + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 발 위치: 맨 아래 5% 줄의 가로 중심 (프레임 좌표) */
function footX(px, W, b) {
  const h = b.y1 - b.y0 + 1;
  let sx = 0, n = 0;
  for (let y = Math.floor(b.y1 - h * 0.05); y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++)
      if (px[(y * W + x) * 4 + 3] > 64) {
        sx += x;
        n++;
      }
  return n ? sx / n : (b.x0 + b.x1) / 2;
}

async function importAttackSheet() {
  const frames = Number(opt('frames', '4'));
  const [gc, gr] = (opt('grid', `${frames}x1`)).split('x').map(Number);
  const fps = Number(opt('fps', '10'));
  const durations = opt('durations', '0.09,0.16,0.2,0.24').split(',').map(Number);
  const meta = await sharp(input).metadata();
  const cw = Math.floor(meta.width / gc);
  const ch = Math.floor(meta.height / gr);
  const cells = [];
  for (let i = 0; i < frames; i++) {
    const cx = (i % gc) * cw;
    const cy = Math.floor(i / gc) * ch;
    const { data } = await sharp(input).ensureAlpha().extract({ left: cx, top: cy, width: cw, height: ch }).raw().toBuffer({ resolveWithObject: true });
    const px = new Uint8ClampedArray(data);
    removeBg(px, cw, ch);
    dropEdgeFragments(px, cw, ch);
    const b = bbox(px, cw, ch);
    if (!b) throw new Error(`${i + 1}번째 칸에서 그림을 찾지 못했습니다`);
    cells.push({ px, b, foot: footX(px, cw, b) });
  }
  // 모든 프레임을 "발 위치 + 바닥선" 기준으로 정렬한 공통 영역
  const left = Math.max(...cells.map((c) => c.foot - c.b.x0));
  const right = Math.max(...cells.map((c) => c.b.x1 - c.foot));
  const up = Math.max(...cells.map((c) => c.b.y1 - c.b.y0));
  const fw = Math.ceil(left + right + 2);
  const fh = Math.ceil(up + 2);
  const OUT_H = Math.min(MAX_H, Math.max(fh, 480));
  const k = OUT_H / fh;
  const outW = Math.round(fw * k);
  const composites = [];
  for (let i = 0; i < frames; i++) {
    const c = cells[i];
    const w = c.b.x1 - c.b.x0 + 1;
    const h = c.b.y1 - c.b.y0 + 1;
    const piece = await sharp(Buffer.from(c.px.buffer), { raw: { width: cw, height: ch, channels: 4 } })
      .extract({ left: c.b.x0, top: c.b.y0, width: w, height: h })
      .resize({ width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), kernel: 'lanczos3' })
      .png()
      .toBuffer();
    composites.push({ input: piece, left: i * outW + Math.round((left - (c.foot - c.b.x0)) * k), top: OUT_H - Math.round(h * k) });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = `${id}-attack.png`;
  await sharp({ create: { width: outW * frames, height: OUT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, file));
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  if (!manifest[id]) throw new Error(`먼저 대기 그림을 가져와야 합니다: npm run sd:import -- <그림> ${id}`);
  const body0 = cells[0].b.y1 - cells[0].b.y0 + 1;
  manifest[id].attack = {
    file,
    frames,
    fps,
    frameWidth: outW,
    frameHeight: OUT_H,
    anchorX: Number((left / fw).toFixed(3)),
    bodyRatio: Number((body0 / fh).toFixed(3)),
    durations,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✔ ${id} 공격 동작: ${frames}프레임 (${gc}×${gr}), 프레임 ${outW}×${OUT_H}, ${fps}fps → ${file}`);
}

let img = sharp(input).ensureAlpha();
if (crop) {
  const [left, top, width, height] = crop.split(',').map(Number);
  img = img.extract({ left, top, width, height });
}
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = new Uint8ClampedArray(data);
const at = (x, y) => (y * W + x) * 4;

// ── 1. 배경 제거: 테두리에서부터 배경색과 비슷한 픽셀을 지움 (flood fill)
const cornerAlpha = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)].map((k) => px[k + 3]);
const alreadyTransparent = cornerAlpha.every((a) => a < 16);
if (!keepBg && !alreadyTransparent) {
  const samples = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  const bg = [0, 1, 2].map((c) => samples.reduce((s, k) => s + px[k + c], 0) / samples.length);
  const near = (k) => Math.hypot(px[k] - bg[0], px[k + 1] - bg[1], px[k + 2] - bg[2]) <= tol;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
  for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (seen[i]) continue;
    seen[i] = 1;
    const k = i * 4;
    if (px[k + 3] < 16 || near(k)) {
      px[k + 3] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
  // 경계 부드럽게: 지워진 영역에 닿은 밝은 픽셀은 반투명 처리
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const k = at(x, y);
      if (px[k + 3] === 0) continue;
      const touching = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].some((n) => px[n + 3] === 0);
      if (!touching) continue;
      const d = Math.hypot(px[k] - bg[0], px[k + 1] - bg[1], px[k + 2] - bg[2]);
      if (d < tol * 2.5) px[k + 3] = Math.round(255 * Math.min(1, d / (tol * 2.5)));
    }
  }
}

// ── 2. 여백 자르기
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (px[at(x, y) + 3] > 24) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
if (x1 < 0) {
  console.error('그림을 찾지 못했습니다 (전부 배경으로 판정됨). --tolerance 값을 낮춰 보세요.');
  process.exit(1);
}
const cw = x1 - x0 + 1;
const ch = y1 - y0 + 1;

// ── 3. 발 위치: 맨 아래 5% 줄에 있는 픽셀들의 가로 중심
let sx = 0, n = 0;
for (let y = Math.floor(y1 - ch * 0.05); y <= y1; y++)
  for (let x = x0; x <= x1; x++)
    if (px[at(x, y) + 3] > 64) {
      sx += x - x0;
      n++;
    }
const anchorX = n ? sx / n / cw : 0.5;

// ── 4. 크기 맞추기 & 저장
fs.mkdirSync(OUT_DIR, { recursive: true });
const outH = Math.min(MAX_H, Math.max(ch, Math.min(ch * 2, 480)));
const file = `${id}.png`;
await sharp(Buffer.from(px.buffer), { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: x0, top: y0, width: cw, height: ch })
  .resize({ height: Math.round(outH), kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT_DIR, file));

const manifestPath = path.join(OUT_DIR, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
manifest[id] = { ...(manifest[id] ?? {}), file, anchorX: Number(anchorX.toFixed(3)), facing, scale };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✔ ${id}: ${cw}×${ch} → ${file} (발 위치 ${anchorX.toFixed(2)}, ${facing})`);
