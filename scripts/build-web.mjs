#!/usr/bin/env node
/**
 * 웹 배포용 빌드: dist/ 생성 후 .artifact/index.html (문서 뼈대를 뺀 본문) 과 파일 목록을 만든다.
 * Claude가 claude.ai 아티팩트(바로 실행 링크)로 올릴 때 사용.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

execSync('npm run build', { stdio: 'inherit' });
let html = fs.readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>.*?<\/title>/s)[0];
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head
  .split('\n')
  .filter((l) => /<link rel="(stylesheet|preconnect|icon)"|<style|<\/style>|^\s*[^<\s]|^\s*<\/?(style)|<script type="module"/.test(l) || /\{|\}|;/.test(l))
  .join('\n');
const out = `${title}
<meta name="claude:viewport-fit-sides" content="cover">
<style>:root{color-scheme:dark;background:#0b0c0e}body{background:#0b0c0e}</style>
${keep}
${body}`;
fs.mkdirSync('.artifact', { recursive: true });
fs.writeFileSync('.artifact/index.html', out);
const files = {};
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p !== path.join('dist', 'index.html')) files[path.relative('dist', p)] = p;
  }
};
walk('dist');
fs.writeFileSync('.artifact/files.json', JSON.stringify(files, null, 2));
console.log('✔ .artifact/index.html');
console.log(JSON.stringify(files, null, 2));
