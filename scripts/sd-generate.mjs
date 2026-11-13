#!/usr/bin/env node
/**
 * OpenAI 이미지 API로 SD 스프라이트 생성 → 자동으로 게임에 가져오기
 *
 *   node scripts/sd-generate.mjs <멤버id> [옵션]
 *     --photo a.png,b.jpg   캐릭터 사진/일러스트 (여러 장 가능)
 *     --desc "..."          추가 설명 (사진이 없으면 이 설명으로 생성)
 *     --class guard         클래스 (무기 기본값 결정)
 *     --weapon "katana"     무기 직접 지정
 *     --n 2                 후보 개수
 *     --quality high        low | medium | high
 *     --no-import           생성만 하고 게임에 넣지 않음
 *
 * 레퍼런스 그림체: .sd-ref/style-sheet.png (git 제외)
 * 생성 원본: .sd-raw/ (git 제외)
 * API 키: 환경변수 OPENAI_API_KEY 또는 프록시 주입
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const id = args[0];
if (!id || id.startsWith('--')) {
  console.error('사용법: node scripts/sd-generate.mjs <멤버id> --photo 사진.png --class guard');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const photos = (opt('photo', '') || '').split(',').filter(Boolean);
const desc = opt('desc', '');
const cls = opt('class', 'guard');
const n = Number(opt('n', '1'));
const quality = opt('quality', 'high');
const model = opt('model', 'gpt-image-2');
const doImport = !args.includes('--no-import');

const WEAPONS = {
  vanguard: 'spear with a small banner',
  guard: 'sword',
  defender: 'huge tower shield and a hammer',
  sniper: 'crossbow',
  caster: 'magic staff',
  medic: 'healing staff',
  supporter: 'spell book',
  specialist: 'hook chain',
};
const weapon = opt('weapon', WEAPONS[cls] ?? 'sword');

const REF = path.resolve('.sd-ref/style-sheet.png');
if (!fs.existsSync(REF)) {
  console.error('레퍼런스 그림체 파일이 없습니다: .sd-ref/style-sheet.png');
  process.exit(1);
}

const subject = photos.length
  ? `the character shown in the ${photos.length > 1 ? 'first images' : 'first image'}`
  : 'the following character';

const prompt = `Create a chibi battle sprite of ${subject}, drawn in exactly the same art style as the LAST image (a reference sheet of chibi sprites).
${desc ? `Character description: ${desc}\n` : ''}
Style (match the reference sheet closely):
- super-deformed chibi, about 2.5 heads tall: big wide head, compact body, short sturdy legs
- full body, wide combat-ready stance with knees slightly bent, 3/4 view facing right
- thick dark brown-black outlines with a slightly rough hand-drawn line quality
- two-tone cel shading, sharp glossy highlights on the hair
- muted, slightly desaturated palette with 1-2 saturated accent colors
- large vertical oval eyes with gradient irises and a small white highlight, calm serious face, tiny mouth

Character:
- keep the hairstyle, hair color, eye color, outfit colors and accessories of the character
- add techwear details: straps, buckles, pouches, belts, zippers, small tags
- holding an oversized, highly detailed ${weapon} (class: ${cls})

Output:
- exactly one character, centered, entire body visible including feet, with margin around it
- transparent background, no ground shadow, no text, no border, no other characters`;

const form = new FormData();
form.append('model', model);
form.append('prompt', prompt);
form.append('n', String(n));
form.append('size', '1024x1024');
form.append('quality', quality);
form.append('background', 'transparent');
form.append('output_format', 'png');
const addFile = (p) => {
  const buf = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg');
  form.append('image[]', new Blob([buf], { type: `image/${ext}` }), path.basename(p));
};
photos.forEach(addFile);
addFile(REF);

console.log(`생성 중... (${model}, ${n}장, ${quality})`);
const t0 = Date.now();
const call = (body) =>
  fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'proxy-injected'}` },
    body,
  });
let res = await call(form);
let json = await res.json();
// 모델이 투명 배경을 지원하지 않으면 흰 배경으로 다시 요청 (가져올 때 배경 자동 제거)
if (!res.ok && /background|transparen/i.test(json.error?.message ?? '')) {
  console.log('투명 배경 미지원 → 흰 배경으로 재시도');
  form.delete('background');
  form.set('prompt', prompt.replace('transparent background', 'plain pure white background'));
  res = await call(form);
  json = await res.json();
}
if (res.status === 429 && /credit|quota|billing/i.test(json.error?.message ?? '')) {
  console.error('OpenAI 크레딧이 없습니다. https://platform.openai.com/settings/organization/billing 에서 충전해 주세요.');
  process.exit(2);
}
if (!res.ok) {
  console.error('API 오류:', res.status, json.error?.message ?? JSON.stringify(json));
  process.exit(1);
}
fs.mkdirSync('.sd-raw', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outs = json.data.map((d, i) => {
  const p = path.resolve('.sd-raw', `${id}-${stamp}-${i + 1}.png`);
  fs.writeFileSync(p, Buffer.from(d.b64_json, 'base64'));
  return p;
});
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
outs.forEach((p) => console.log('  원본:', path.relative(process.cwd(), p)));
if (json.usage) console.log('  사용량:', JSON.stringify(json.usage));

if (doImport) {
  execFileSync('node', ['scripts/sd-import.mjs', outs[0], id], { stdio: 'inherit' });
  if (outs.length > 1) console.log('다른 후보를 쓰려면: npm run sd:import -- <원본 경로> ' + id);
}
