#!/usr/bin/env node
/**
 * AI 배경 제거 작업자 (별도 프로세스).
 * @imgly/background-removal-node 가 내부적으로 다른 버전의 sharp를 써서, 같은 프로세스에서 섞으면 충돌하므로 분리.
 *   node scripts/rmbg-worker.mjs <입력> <출력.png> [model]
 */
import fs from 'node:fs';
import path from 'node:path';
import { removeBackground } from '@imgly/background-removal-node';

const [input, output, model = 'medium'] = process.argv.slice(2);
const ext = path.extname(input).slice(1).toLowerCase().replace('jpg', 'jpeg');
const blob = new Blob([fs.readFileSync(input)], { type: `image/${ext}` });
const out = await removeBackground(blob, { model, output: { format: 'image/png' } });
fs.writeFileSync(output, Buffer.from(await out.arrayBuffer()));
