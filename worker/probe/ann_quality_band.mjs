// Is an ABSOLUTE similarity threshold transferable across queries, and is the
// rank-wise ANN-vs-kNN score gap stable enough to be a gate criterion?
//
// For each (query, condition) it runs both rank modes over the same filter and
// the same vector, then reports the score band and the per-rank gap.
import { embeddingInput } from '../src/kinds.js';
import { compileRequest, tupfQueryBody, rowsOf }
  from '../src/search.js';
import { fireworksEmbed } from '../src/embed.js';

const NS = process.env.TPUF_NAMESPACE, REGION = 'aws-us-west-2';
const TPUF = process.env.TURBOPUFFER_API_KEY, FW = process.env.FIREWORKS_API_KEY;

// One shape held constant so that what varies is the QUERY, plus two other
// shapes at the end to see whether the gap depends on the filter instead.
const NO_LITERAL = { on: 'expr', polarity: 'contains', text: '[\\s\\S]{400,}' };
const NEGATION   = { on: 'expr', polarity: 'excludes', text: 'sorted' };
const LITERAL    = { on: 'expr', polarity: 'contains', text: 'list' };

const QUERIES = [
  'a long algebraic identity',
  'a sorted list stays sorted when an element is inserted',
  'a holomorphic function on an open set',
  'the cardinality of a finite union of sets',
  'a continuous map between topological spaces',
  'termination of a recursive function',
  'a probability measure on a sigma algebra',
  'matrix multiplication is associative',
];

async function tupf(body) {
  const r = await fetch(`https://${REGION}.turbopuffer.com/v2/namespaces/${NS}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TPUF}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  const t = await r.text();
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
const sim = (r) => (typeof r.$dist === 'number' ? 1 - r.$dist : NaN);

async function run(query, cond) {
  const { filters } = compileRequest({ query, conditions: [cond] });
  const vector = Array.from(await fireworksEmbed(embeddingInput(query),
    { apiKey: FW, model: 'fireworks/qwen3-embedding-8b' }));
  const A = rowsOf(await tupf(tupfQueryBody({ vector, filters, mode: 'ANN' })));
  const K = rowsOf(await tupf(tupfQueryBody({ vector, filters, mode: 'kNN' })));
  const sK = K.map(sim), sA = A.map(sim);
  const idA = new Set(A.map((r) => r.id));
  const gapAt = (d) => {
    let worst = 0;
    for (let i = 0; i < d && i < sK.length && i < sA.length; i += 1) {
      const g = sK[i] - sA[i]; if (g > worst) worst = g;
    }
    return worst;
  };
  return {
    top1: sK[0], top10: sK[9], top100: sK[99], top200: sK[sK.length - 1],
    overlap: K.filter((r) => idA.has(r.id)).length,
    gap10: gapAt(10), gap100: gapAt(100), gap200: gapAt(200),
    rows: K.length,
  };
}

console.log('=== the same no-literal shape, eight different queries ===');
console.log('query                                          top1    top10   top100  top200  | overlap | worst gap @10 @100 @200');
const bands = [];
for (const q of QUERIES) {
  const r = await run(q, NO_LITERAL);
  bands.push(r);
  console.log(`${q.slice(0, 44).padEnd(44)}  ${r.top1.toFixed(4)}  ${r.top10.toFixed(4)}  `
    + `${r.top100.toFixed(4)}  ${r.top200.toFixed(4)}  |  ${String(r.overlap).padStart(3)}/200 |  `
    + `${r.gap10.toFixed(4)} ${r.gap100.toFixed(4)} ${r.gap200.toFixed(4)}`);
}
const lo = Math.min(...bands.map((b) => b.top200)), hi = Math.max(...bands.map((b) => b.top1));
console.log(`\nabsolute score range across these queries: ${lo.toFixed(4)} .. ${hi.toFixed(4)}`);
console.log(`top-1 alone spans ${Math.min(...bands.map((b)=>b.top1)).toFixed(4)} .. ${Math.max(...bands.map((b)=>b.top1)).toFixed(4)}`);
console.log(`worst per-rank gap over all eight: @10 ${Math.max(...bands.map((b)=>b.gap10)).toFixed(4)}`
  + `  @100 ${Math.max(...bands.map((b)=>b.gap100)).toFixed(4)}`
  + `  @200 ${Math.max(...bands.map((b)=>b.gap200)).toFixed(4)}`);

console.log('\n=== does the gap depend on the SHAPE rather than the query? ===');
for (const [label, cond] of [['negation  expr !~ sorted', NEGATION],
                             ['literal   expr ~ list', LITERAL],
                             ['no-literal expr ~ {400,}', NO_LITERAL]]) {
  const r = await run(QUERIES[1], cond);
  console.log(`${label.padEnd(26)} band ${r.top1.toFixed(4)}..${r.top200.toFixed(4)}`
    + `  overlap ${String(r.overlap).padStart(3)}/200`
    + `  worst gap @10 ${r.gap10.toFixed(4)} @100 ${r.gap100.toFixed(4)} @200 ${r.gap200.toFixed(4)}`);
}
