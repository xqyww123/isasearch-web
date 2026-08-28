// Top-10 of both legs, side by side, with similarity scores.
import { embeddingInput } from '../src/kinds.js';
import { compileRequest, tupfQueryBody, rowsOf }
  from '../src/search.js';
import { fireworksEmbed } from '../src/embed.js';

const NS = process.env.TPUF_NAMESPACE, REGION = 'aws-us-west-2';
const TPUF = process.env.TURBOPUFFER_API_KEY, FW = process.env.FIREWORKS_API_KEY;

const CASE = { query: 'a long algebraic identity',
               on: 'expr', polarity: 'contains', text: '[\\s\\S]{400,}' };

async function tupf(body) {
  const r = await fetch(`https://${REGION}.turbopuffer.com/v2/namespaces/${NS}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TPUF}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  const t = await r.text();
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

const { filters } = compileRequest({ query: CASE.query,
  conditions: [{ on: CASE.on, polarity: CASE.polarity, text: CASE.text }] });
const vector = Array.from(await fireworksEmbed(embeddingInput(CASE.query),
  { apiKey: FW, model: 'fireworks/qwen3-embedding-8b' }));

const A = rowsOf(await tupf(tupfQueryBody({ vector, filters, mode: 'ANN' })));
const K = rowsOf(await tupf(tupfQueryBody({ vector, filters, mode: 'kNN' })));
const sim = (r) => (typeof r.$dist === 'number' ? 1 - r.$dist : NaN);
const nm = (r) => (r.name || r.key || '?').slice(0, 34).padEnd(34);
const idA = new Set(A.map((r) => r.id));
const idK = new Set(K.map((r) => r.id));

console.log('rank  kNN (exact truth)                    sim     | ANN                                  sim     same?');
for (let i = 0; i < 10; i += 1) {
  const k = K[i], a = A[i];
  const mark = k && a && k.id === a.id ? 'same row'
    : (k && idA.has(k.id) ? 'reordered' : 'ANN MISSES this row');
  console.log(`${String(i + 1).padStart(3)}   ${nm(k)} ${sim(k).toFixed(4)}  | ${nm(a)} ${sim(a).toFixed(4)}  ${mark}`);
}

console.log('\n--- how many rows sit at or above a given similarity, in each leg ---');
for (const t of [0.60, 0.58, 0.57, 0.56, 0.55, 0.54, 0.53, 0.50]) {
  const ka = K.filter((r) => sim(r) >= t), aa = A.filter((r) => sim(r) >= t);
  const inter = ka.filter((r) => idA.has(r.id)).length;
  console.log(`  sim >= ${t.toFixed(2)}   kNN ${String(ka.length).padStart(3)} rows   ANN ${String(aa.length).padStart(3)} rows`
    + `   of kNN's, ANN has ${inter}/${ka.length}`
    + (ka.length ? `  (${(100 * inter / ka.length).toFixed(0)} %)` : ''));
}

const sK = K.map(sim), sA = A.map(sim);
console.log('\n--- rank-wise score parity (what a score-based gate would measure) ---');
for (const d of [10, 25, 50, 100, 200]) {
  let worst = 0, sum = 0;
  for (let i = 0; i < d && i < sK.length; i += 1) { const g = sK[i] - sA[i]; sum += g; if (g > worst) worst = g; }
  console.log(`  top-${String(d).padStart(3)}  worst per-rank gap ${worst.toFixed(4)}   mean gap ${(sum / d).toFixed(4)}`);
}
console.log(`\nkNN range: ${sK[0].toFixed(4)} .. ${sK[sK.length - 1].toFixed(4)}`);
console.log(`ANN range: ${sA[0].toFixed(4)} .. ${sA[sA.length - 1].toFixed(4)}`);
console.log(`rows below 0.50 — kNN ${sK.filter((s) => s < 0.5).length}, ANN ${sA.filter((s) => s < 0.5).length}`);
