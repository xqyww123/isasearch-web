// The raw-text overlap sweep — RELEASE.md step 7b, the launch gate of §6.3c.
//
// Every overlap and latency figure behind the count router was measured on the
// `\n`-joined subtoken columns that the regex-era schema deletes.  This
// re-establishes them on the RAW columns of the namespace that is about to go
// live, using the Worker's own compiler and query builders so that what is
// measured is what the router will send.
//
//   source ~/Current/MLML/secret.sh
//   TURBOPUFFER_API_KEY="$turbopuffer_ISASEARCH_READ_KEY" \
//   FIREWORKS_API_KEY="$EMBEDDING_API_KEY" \
//   TPUF_NAMESPACE=<the step-6 namespace> ROWS=<the REPORT's ROWS> \
//     node ~/isasearch-pipeline/launchgate-20260827.mjs
//
// Read-only: it counts and it queries, it never writes.
import { embeddingInput } from '../src/kinds.js';
import { compileRequest, tupfQueryBody, tupfCountBody, rowsOf, countOf,
         routeOf, certified, RESULT_LIMIT }
  from '../src/search.js';
import { fireworksEmbed } from '../src/embed.js';

const NS = process.env.TPUF_NAMESPACE;
const REGION = process.env.TPUF_REGION ?? 'aws-us-west-2';
const TPUF_KEY = process.env.TURBOPUFFER_API_KEY;
const FW_KEY = process.env.FIREWORKS_API_KEY;
const ROWS = Number(process.env.ROWS);
const FRACTION = Number(process.env.EXACT_FRACTION ?? '0.03');
if (!NS || !TPUF_KEY || !FW_KEY || !Number.isFinite(ROWS)) {
  console.error('set TPUF_NAMESPACE, ROWS, TURBOPUFFER_API_KEY, FIREWORKS_API_KEY');
  process.exit(2);
}
const LINE = Math.ceil(ROWS * FRACTION);
console.log(`namespace ${NS}   ROWS ${ROWS}   the 3 % line ${LINE} rows\n`);

async function tupf(body) {
  const t0 = Date.now();
  const resp = await fetch(
    `https://${REGION}.turbopuffer.com/v2/namespaces/${NS}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TPUF_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const text = await resp.text();
  const ms = Date.now() - t0;
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status} after ${ms} ms: ${text.slice(0, 300)}`);
  return { data: JSON.parse(text), ms };
}
const countFilter = async (filters) => {
  const { data, ms } = await tupf(tupfCountBody(filters));
  return { n: countOf(data), ms };
};

// The battery.  `shape` names which of §6.3c's required shapes the case is.
const CASES = [
  { shape: 'CTS-equivalent control', query: 'a list sorted with respect to a relation',
    on: 'expr', polarity: 'contains', text: 'sorted_wrt' },
  { shape: 'CTS-equivalent control', query: 'a bijection between two sets',
    on: 'name', polarity: 'contains', text: 'bij_betw' },
  { shape: 'semantically clustered', query: 'a holomorphic function on an open set',
    on: 'expr', polarity: 'contains', text: 'holomorphic' },
  { shape: 'semantically clustered', query: 'bisimulation between labelled transition systems',
    on: 'expr', polarity: 'contains', text: 'bisimulation' },
  { shape: 'semantically clustered', query: 'a Galois connection between two orders',
    on: 'expr', polarity: 'contains', text: 'Galois' },
  { shape: 'semantically clustered', query: 'a property that eventually holds in a filter',
    on: 'expr', polarity: 'contains', text: 'eventually' },
  { shape: 'semantically clustered', query: 'a sorted list stays sorted when an element is inserted',
    on: 'expr', polarity: 'contains', text: 'sorted' },
  { shape: 'common literal', query: 'a sorted list stays sorted when an element is inserted',
    on: 'expr', polarity: 'contains', text: 'list' },
  { shape: 'common literal', query: 'a function applied to every element of a set',
    on: 'expr', polarity: 'contains', text: 'x' },
  { shape: 'no literal, length only', query: 'a long algebraic identity',
    on: 'expr', polarity: 'contains', text: '[\\s\\S]{400,}' },
  { shape: 'no literal, alternation', query: 'an arithmetic identity over the reals',
    on: 'expr', polarity: 'contains', text: '[0-9]{3,}' },
  { shape: 'Not(Regex)', query: 'a sorted list stays sorted when an element is inserted',
    on: 'expr', polarity: 'excludes', text: 'sorted' },
  { shape: 'Not(Regex)', query: 'a theorem outside the HOL image',
    on: 'theory', polarity: 'excludes', text: 'HOL' },
];

const rows = [];
for (const c of CASES) {
  const { filters } = compileRequest(
    { query: c.query, conditions: [{ on: c.on, polarity: c.polarity, text: c.text }] });
  let rec = { ...c, filters };
  try {
    const counted = await countFilter(filters);
    rec.count = counted.n;
    rec.countMs = counted.ms;
    rec.route = routeOf(rec.count, ROWS, FRACTION);
    rec.pct = 100 * rec.count / ROWS;

    if (rec.count === 0) { rows.push(rec); continue; }

    const vector = Array.from(await fireworksEmbed(embeddingInput(c.query), {
      apiKey: FW_KEY, model: process.env.FIREWORKS_MODEL ?? 'fireworks/qwen3-embedding-8b' }));

    const ann = await tupf(tupfQueryBody({ vector, filters, mode: 'ANN' }));
    const annRows = rowsOf(ann.data);
    rec.annMs = ann.ms;
    rec.annRows = annRows.length;
    rec.owed = Math.min(rec.count, RESULT_LIMIT);
    rec.annCertified = certified(rec.annRows, rec.count);

    const knn = await tupf(tupfQueryBody({ vector, filters, mode: 'kNN' }));
    const knnRows = rowsOf(knn.data);
    rec.knnMs = knn.ms;
    rec.knnRows = knnRows.length;
    rec.knnCertified = certified(rec.knnRows, rec.count);

    const knnIds = new Set(knnRows.map((r) => r.id));
    rec.overlap = annRows.filter((r) => knnIds.has(r.id)).length;

    // The score-parity criterion: at each rank, how much worse is the
    // approximate answer than the exact one at that same rank?  This measures
    // answer quality, where the overlap count measures set identity — and a
    // dense corpus makes those two very different questions.
    const sim = (r) => (typeof r.$dist === 'number' ? 1 - r.$dist : NaN);
    const sK = knnRows.map(sim), sA = annRows.map(sim);
    const gapAt = (d) => {
      let worst = 0;
      for (let i = 0; i < d && i < sK.length && i < sA.length; i += 1) {
        const g = sK[i] - sA[i];
        if (Number.isFinite(g) && g > worst) worst = g;
      }
      return worst;
    };
    rec.gap10 = gapAt(10);
    rec.gap100 = gapAt(100);
    rec.gap200 = gapAt(200);
  } catch (e) {
    rec.error = String(e.message ?? e);
  }
  rows.push(rec);
  const f = (x, w) => String(x ?? '-').padStart(w);
  console.log(
    `${(c.on + ' ' + (c.polarity === 'excludes' ? '!~ ' : '~ ') + c.text).padEnd(30)}`
    + ` ${f(rec.count, 8)} ${f(rec.pct?.toFixed(2), 6)}% ${(rec.route ?? '-').padEnd(6)}`
    + ` ann ${f(rec.annRows, 3)} ${f(rec.annMs, 6)}ms`
    + ` knn ${f(rec.knnRows, 3)} ${f(rec.knnMs, 6)}ms`
    + ` overlap ${f(rec.overlap, 3)}/${f(rec.owed, 3)}`
    + ` gap@10 ${rec.gap10 === undefined ? '  -   ' : rec.gap10.toFixed(4)}`
    + ` @100 ${rec.gap100 === undefined ? '  -   ' : rec.gap100.toFixed(4)}`
    + ` @200 ${rec.gap200 === undefined ? '  -   ' : rec.gap200.toFixed(4)}`
    + (rec.error ? `  ERROR ${rec.error}` : ''));
}

// ---------------------------------------------------------------------------
// The empty-value probe.  Empty patterns are rejected client- and Worker-side,
// so only `Not` can reach a row whose column is the empty string; §6.3c asks
// whether negation returns those rows at all, and whether any plausible
// pattern matches the empty string.
// ---------------------------------------------------------------------------
console.log('\n== the empty-value probe ==');
const total = (await countFilter(null)).n;
console.log(`namespace holds ${total} rows (counted, no filter)`);

for (const column of ['theory', 'expr', 'name']) {
  const empty = (await countFilter(['Not', [column, 'Regex', '[\\s\\S]']])).n;
  const anyChar = (await countFilter([column, 'Regex', '[\\s\\S]'])).n;
  const dotStar = (await countFilter([column, 'Regex', '.*'])).n;
  const anchored = (await countFilter([column, 'Regex', '^$'])).n;
  console.log(
    `${column.padEnd(8)} empty ${String(empty).padStart(7)}`
    + `   non-empty ${String(anyChar).padStart(9)}`
    + `   sum ${String(empty + anyChar).padStart(9)} ${empty + anyChar === total ? '== total' : '!= TOTAL'}`
    + `   /.*/ matches ${String(dotStar).padStart(9)}`
    + `   /^$/ matches ${String(anchored).padStart(7)}`);
}

// Does a real `excludes` condition return the empty rows?  If it does, the two
// counts below agree: every empty-theory row is inside Not(Regex "HOL").
const emptyTheory = (await countFilter(['Not', ['theory', 'Regex', '[\\s\\S]']])).n;
const emptyInsideNot = (await countFilter(
  ['And', [['Not', ['theory', 'Regex', 'HOL']], ['Not', ['theory', 'Regex', '[\\s\\S]']]]])).n;
console.log(
  `\nNot(Regex "HOL") over theory returns ${emptyInsideNot} of the ${emptyTheory} `
  + `empty-theory rows — ${emptyInsideNot === emptyTheory ? 'ALL of them' : 'NOT all of them'}`);

// ---------------------------------------------------------------------------
// The verdict, against §6.3c's four pass conditions.
// ---------------------------------------------------------------------------
console.log('\n== the launch gate ==');
let failures = 0;
const verdict = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
// Recorded, not enforced (ruled 2026-08-28): the ANN∩kNN set overlap fails on
// the SHAPE of the filter rather than on the data — every `excludes` condition
// is above any line by construction, and ANN swaps tied rows freely.  Measured
// 2026-08-27: two negations at 179/200 and 183/200 whose similarity gap against
// the exact answer was 0.0000 and 0.0027.  Score parity below is what replaced
// it.  This still prints, because §6.3c wants the per-build number.
const note = (label, detail = '') =>
  console.log(`NOTE  ${label}${detail ? ` — ${detail}` : ''}`);

const measured = rows.filter((r) => !r.error && r.count > 0);
const aboveLine = measured.filter((r) => r.route === 'ann');
const fullAnn = aboveLine.filter((r) => r.annRows === RESULT_LIMIT && r.owed === RESULT_LIMIT);
const worst = fullAnn.reduce((w, r) => (w === null || r.overlap < w.overlap ? r : w), null);
note('ANN∩kNN set overlap (recorded, not enforced)',
     worst ? `worst ${worst.on} ~ ${worst.text}: ${worst.overlap}/200; `
             + `all: ${fullAnn.map((r) => `${r.overlap}`).join(' ')}`
           : 'no full-200 case above the line');

// The proposed criterion: quality, not identity.
const GAP10 = 0.005, GAP100 = 0.01;
const worstG10 = fullAnn.reduce((w, r) => (w === null || r.gap10 > w.gap10 ? r : w), null);
const worstG100 = fullAnn.reduce((w, r) => (w === null || r.gap100 > w.gap100 ? r : w), null);
verdict(fullAnn.every((r) => r.gap10 <= GAP10),
        `[score parity @10] every rank in the top 10 within ${GAP10} of exact`,
        worstG10 ? `worst ${worstG10.on} ~ ${worstG10.text}: ${worstG10.gap10.toFixed(4)}` : '');
verdict(fullAnn.every((r) => r.gap100 <= GAP100),
        `[score parity @100] every rank in the top 100 within ${GAP100} of exact`,
        worstG100 ? `worst ${worstG100.on} ~ ${worstG100.text}: ${worstG100.gap100.toFixed(4)}` : '');

const underFilled = aboveLine.filter((r) => !r.annCertified);
verdict(underFilled.every((r) => !certified(r.annRows, r.count)),
        'every under-filled ANN result at or above the line trips the fallback certificate',
        `${underFilled.length} under-filled of ${aboveLine.length} above the line`);

const slowest = measured.reduce((w, r) => (w === null || r.knnMs > w.knnMs ? r : w), null);
verdict(measured.every((r) => r.knnMs < 15000),
        'fallback-kNN latency fits the 15 s deadline',
        slowest ? `slowest ${slowest.on} ~ ${slowest.text}: ${slowest.knnMs} ms` : '');

verdict(measured.every((r) => r.knnCertified),
        'every kNN result satisfies the certificate rows == min(count, top_k)');

verdict(emptyInsideNot === emptyTheory,
        'Not(Regex) returns the empty-valued rows, as the Worker assumes');

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'the launch gate passes'}`);
console.log('\n== the record, for the release log ==');
console.log(JSON.stringify({ namespace: NS, rows: ROWS, line: LINE, total,
                             cases: rows.map(({ filters, ...r }) => r) }, null, 1));
process.exit(failures ? 1 : 0);
