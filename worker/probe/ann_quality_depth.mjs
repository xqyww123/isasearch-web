// How much do ANN and kNN actually disagree, by depth, for one condition?
// Read-only. Same query vector for both legs, same filter tree, same top_k.
import { embeddingInput } from '../src/kinds.js';
import { compileRequest, tupfQueryBody, rowsOf }
  from '../src/search.js';
import { fireworksEmbed } from '../src/embed.js';

const NS = process.env.TPUF_NAMESPACE;
const REGION = 'aws-us-west-2';
const TPUF = process.env.TURBOPUFFER_API_KEY;
const FW = process.env.FIREWORKS_API_KEY;

const CASE = {
  query: 'a long algebraic identity',
  on: 'expr', polarity: 'contains', text: '[\\s\\S]{400,}',
};

async function tupf(body) {
  const t0 = Date.now();
  const r = await fetch(`https://${REGION}.turbopuffer.com/v2/namespaces/${NS}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TPUF}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  return { data: JSON.parse(text), ms: Date.now() - t0 };
}

const { filters } = compileRequest({
  query: CASE.query,
  conditions: [{ on: CASE.on, polarity: CASE.polarity, text: CASE.text }],
});
const vector = Array.from(await fireworksEmbed(embeddingInput(CASE.query), {
  apiKey: FW, model: 'fireworks/qwen3-embedding-8b' }));

const ann = await tupf(tupfQueryBody({ vector, filters, mode: 'ANN' }));
const knn = await tupf(tupfQueryBody({ vector, filters, mode: 'kNN' }));
const A = rowsOf(ann.data), K = rowsOf(knn.data);
console.log(`condition: ${CASE.on} ~ /${CASE.text}/   ANN ${ann.ms} ms, kNN ${knn.ms} ms`);
console.log(`rows: ANN ${A.length}, kNN ${K.length}\n`);

const idA = A.map((r) => r.id), idK = K.map((r) => r.id);
const posA = new Map(idA.map((id, i) => [id, i]));

console.log('overlap by depth — |ANN top-d ∩ kNN top-d| :');
for (const d of [1, 5, 10, 25, 50, 100, 150, 200]) {
  const a = new Set(idA.slice(0, d)), k = idK.slice(0, d).filter((id) => a.has(id)).length;
  console.log(`  top-${String(d).padStart(3)}   ${String(k).padStart(3)}/${d}   ${(100 * k / d).toFixed(0)} %`);
}

// Where do the true top-100 end up in the ANN ordering?
const found = [], missing = [];
idK.slice(0, 100).forEach((id, rank) => {
  const p = posA.get(id);
  if (p === undefined) missing.push(rank); else found.push({ rank, annRank: p });
});
console.log(`\nof the TRUE top-100 (kNN): ${found.length} appear anywhere in ANN's 200, ${missing.length} are absent entirely`);
if (found.length) {
  const drift = found.map((f) => Math.abs(f.annRank - f.rank));
  drift.sort((x, y) => x - y);
  console.log(`  rank drift for those found: median ${drift[drift.length >> 1]}, max ${drift[drift.length - 1]}`);
}
if (missing.length) {
  console.log(`  true ranks of the missing ones: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? ' …' : ''}`);
}

// Does the miss cost similarity?  Compare the two lists' $dist profiles.
const sim = (r) => (typeof r.$dist === 'number' ? 1 - r.$dist : null);
const show = (label, rows) => {
  const s = rows.map(sim).filter((x) => x !== null);
  const at = (i) => (s[i] === undefined ? '  —  ' : s[i].toFixed(4));
  console.log(`  ${label}: #1 ${at(0)}  #10 ${at(9)}  #50 ${at(49)}  #100 ${at(99)}  #200 ${at(199)}`);
};
console.log('\nsimilarity profile (cosine, higher is better):');
show('kNN (truth)', K);
show('ANN        ', A);

const sK = K.map(sim), sA = A.map(sim);
const worstLoss = Math.max(...Array.from({ length: Math.min(100, sK.length) },
  (_, i) => (sK[i] ?? 0) - (sA[i] ?? 0)));
console.log(`\nworst per-rank similarity loss within the top 100: ${worstLoss.toFixed(4)}`);
console.log(`mean similarity, top 100 — kNN ${(sK.slice(0,100).reduce((a,b)=>a+b,0)/100).toFixed(4)}`
          + `  ANN ${(sA.slice(0,100).reduce((a,b)=>a+b,0)/100).toFixed(4)}`);
