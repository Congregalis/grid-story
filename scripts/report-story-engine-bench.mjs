#!/usr/bin/env node
// 聚合 storage/benchmarks/story-engine-*.json，输出每个 op 的 P50 / P95 / 平均 / 样本数

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'storage/benchmarks';

function quantile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

const files = (await readdir(DIR)).filter((f) => f.startsWith('story-engine-') && f.endsWith('.json'));
if (files.length === 0) {
  console.error(`未找到 ${DIR}/story-engine-*.json，先跑 bash scripts/smoke-story-engine.sh`);
  process.exit(1);
}

/** @type {Record<string, { latencies: number[]; tokens: number[] }>} */
const byOp = {};
for (const file of files) {
  const data = JSON.parse(await readFile(join(DIR, file), 'utf-8'));
  for (const entry of data.entries ?? []) {
    if (!byOp[entry.op]) byOp[entry.op] = { latencies: [], tokens: [] };
    byOp[entry.op].latencies.push(entry.latencyMs);
    byOp[entry.op].tokens.push(entry.tokens);
  }
}

console.log(`聚合自 ${files.length} 个 run`);
console.log('OP                                      n  latency(ms) P50/P95/max  tokens P50/P95/max');
for (const [op, { latencies, tokens }] of Object.entries(byOp)) {
  const lat = [...latencies].sort((a, b) => a - b);
  const tok = [...tokens].sort((a, b) => a - b);
  const row = [
    op.padEnd(40),
    String(lat.length).padStart(2),
    `${quantile(lat, 0.5)}/${quantile(lat, 0.95)}/${lat[lat.length - 1]}`.padStart(20),
    `${quantile(tok, 0.5)}/${quantile(tok, 0.95)}/${tok[tok.length - 1]}`.padStart(18),
  ];
  console.log(row.join('  '));
}
