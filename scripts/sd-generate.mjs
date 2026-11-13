#!/usr/bin/env node
/**
 * 이미지 생성 API(Gemini 기본 / OpenAI)로 SD 스프라이트 생성 → 자동으로 게임에 가져오기
 *
 *   node scripts/sd-generate.mjs <멤버id> [옵션]
 *     --photo a.png,b.jpg   캐릭터 사진/일러스트 (여러 장 가능)
 *     --desc "..."          추가 설명 (사진이 없으면 이 설명으로 생성)
 *     --class guard         클래스 (무기 기본값 결정)
 *     --weapon "katana"     무기 직접 지정
 *     --n 2                 후보 개수
 *     --quality high        low | medium | high
 *     --no-import           생성만 하고 게임에 넣지 않음
 *     --provider gemini     gemini(기본) | openai
 *     --model <이름>        모델 직접 지정 (기본: 사용 가능한 최신 이미지 모델 자동 선택)
 *
 * 레퍼런스 그림체: .sd-ref/style-sheet.png (git 제외)
 * 생성 원본: .sd-raw/ (git 제외)
 * API 키: 환경변수 GEMINI_API_KEY / OPENAI_API_KEY, 또는 클라우드 환경의 네트워크 프록시 주입
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
const provider = opt('provider', 'gemini');
const modelOpt = opt('model', '');
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

const readImage = (p) => {
  const buf = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg');
  return { buf, mime: `image/${ext}`, name: path.basename(p) };
};
const inputs = [...photos, REF].map(readImage);
const t0 = Date.now();
/** @type {Buffer[]} */
let images = [];

function fail(status, msg) {
  if (/credit|quota|billing|exhausted|free tier/i.test(msg)) {
    console.error(`결제/크레딧 설정이 필요합니다: ${msg}`);
    process.exit(2);
  }
  if (status === 401 || status === 403) {
    console.error(`API 키가 없거나 거부되었습니다 (${status}): ${msg}`);
    process.exit(3);
  }
  console.error('API 오류:', status, msg);
  process.exit(1);
}

/** 응답 JSON 어디에 있든 base64 이미지를 찾아낸다 (호환 API는 응답 형식이 모델마다 다를 수 있음) */
function findImages(obj, out = []) {
  if (typeof obj === 'string') {
    const m = obj.match(/data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)/g);
    if (m) m.forEach((d) => out.push(Buffer.from(d.split(',')[1], 'base64')));
    else if (obj.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(obj)) out.push(Buffer.from(obj, 'base64'));
  } else if (Array.isArray(obj)) obj.forEach((v) => findImages(v, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((v) => findImages(v, out));
  return out;
}

if (provider === 'gemini') {
  // Gemini의 OpenAI 호환 주소: 키를 Authorization: Bearer 로 받는다 (클라우드 환경 프록시가 주입)
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
  const headers = { Authorization: `Bearer ${process.env.GEMINI_API_KEY || 'proxy-injected'}`, 'Content-Type': 'application/json' };
  const unwrap = (j) => (Array.isArray(j) ? j[0] : j);
  let model = modelOpt;
  if (!model) {
    const r = await fetch(`${BASE}/models`, { headers });
    const j = unwrap(await r.json());
    if (!r.ok) fail(r.status, j.error?.message ?? JSON.stringify(j));
    const names = (j.data ?? []).map((m) => m.id.replace('models/', '')).filter((n) => /gemini.*image/.test(n) && !/lite/.test(n));
    const score = (n) => (/pro/.test(n) ? 100 : 0) + parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) ?? [0, 0])[1]) * 10 - (/preview|exp/.test(n) ? 1 : 0);
    names.sort((x, y) => score(y) - score(x));
    if (!names.length) fail(404, '이미지 생성이 가능한 Gemini 모델을 찾지 못했습니다.');
    model = names[0];
    console.log('사용 가능한 이미지 모델:', names.join(', '));
  }
  const geminiPrompt = prompt.replace('transparent background', 'plain pure white background');
  console.log(`생성 중... (Gemini ${model}, ${n}장)`);
  for (let i = 0; i < n; i++) {
    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            ...inputs.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.buf.toString('base64')}` } })),
            { type: 'text', text: geminiPrompt },
          ],
        },
      ],
    };
    const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = unwrap(await r.json());
    if (!r.ok) fail(r.status, j.error?.message ?? JSON.stringify(j));
    const found = findImages(j.choices ?? j);
    if (!found.length) {
      fs.mkdirSync('.sd-raw', { recursive: true });
      fs.writeFileSync('.sd-raw/last-response.json', JSON.stringify(j, null, 2));
      fail(500, '응답에서 이미지를 찾지 못했습니다 (.sd-raw/last-response.json 확인)');
    }
    images.push(found[0]);
    if (j.usage) console.log('  사용량:', JSON.stringify(j.usage));
  }
} else {
  const model = modelOpt || 'gpt-image-2';
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('n', String(n));
  form.append('size', '1024x1024');
  form.append('quality', quality);
  form.append('background', 'transparent');
  form.append('output_format', 'png');
  for (const im of inputs) form.append('image[]', new Blob([im.buf], { type: im.mime }), im.name);
  console.log(`생성 중... (OpenAI ${model}, ${n}장, ${quality})`);
  const call = (body) =>
    fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'proxy-injected'}` },
      body,
    });
  let res = await call(form);
  let json = await res.json();
  if (!res.ok && /background|transparen/i.test(json.error?.message ?? '')) {
    console.log('투명 배경 미지원 → 흰 배경으로 재시도');
    form.delete('background');
    form.set('prompt', prompt.replace('transparent background', 'plain pure white background'));
    res = await call(form);
    json = await res.json();
  }
  if (!res.ok) fail(res.status, json.error?.message ?? JSON.stringify(json));
  images = json.data.map((d) => Buffer.from(d.b64_json, 'base64'));
}

fs.mkdirSync('.sd-raw', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outs = images.map((buf, i) => {
  const p = path.resolve('.sd-raw', `${id}-${stamp}-${i + 1}.png`);
  fs.writeFileSync(p, buf);
  return p;
});
console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
outs.forEach((p) => console.log('  원본:', path.relative(process.cwd(), p)));

if (doImport) {
  execFileSync('node', ['scripts/sd-import.mjs', outs[0], id], { stdio: 'inherit' });
  if (outs.length > 1) console.log('다른 후보를 쓰려면: npm run sd:import -- <원본 경로> ' + id);
}
