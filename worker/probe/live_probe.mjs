// Live integration probe: runs the Worker's OWN builders (kinds.js, search.js,
// embed.js) against the real Fireworks endpoint and a regex-era namespace,
// read-only.  Not a unit test — needs keys in the environment:
//   source ~/Current/MLML/secret.sh
//   TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY" FIREWORKS_API_KEY="$EMBEDDING_API_KEY" \
//     TPUF_NAMESPACE=<namespace> node worker/probe/live_probe.mjs
// Optionally SITE_URL=https://… adds the deployed-page checks of RELEASE
// step 10 (/about shows the configured facts).
//
// What it proves (§6.3c): the count body is accepted and the count arrives at
// results[0].aggregations.n; both rank modes are accepted; every kNN result
// satisfies the one certificate `rows == min(count, top_k)` (the old checks
// asserted fullness ⇒ completeness, an inference §13 Q14 disproved);
// `excludes` = Not(Regex) is the exact complement; a broken pattern 400s with
// the engine's message where engineMessageOf finds it; rows carry `$dist`.
// It also asserts wrangler.toml's ROWS is within 1 % of the namespace's
// approx_row_count (a tolerance check, never the source).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { embeddingInput } from '../src/kinds.js';
import { compileRequest, tupfQueryBody, tupfCountBody, rowsOf, countOf,
         routeOf, certified, RESULT_LIMIT } from '../src/search.js';
import { fireworksEmbed, DIMENSION } from '../src/embed.js';
import { thin } from '../../site/app/public/render.js';

const NAMESPACE = process.env.TPUF_NAMESPACE;
const REGION = process.env.TPUF_REGION ?? 'aws-us-west-2';
const TPUF_KEY = process.env.TURBOPUFFER_API_KEY;
const FW_KEY = process.env.FIREWORKS_API_KEY;
if (!NAMESPACE || !TPUF_KEY || !FW_KEY) {
  console.error('set TPUF_NAMESPACE, TURBOPUFFER_API_KEY and FIREWORKS_API_KEY (see the header)');
  process.exit(2);
}

// The deployed configuration this namespace must agree with.
const toml = readFileSync(
  fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8');
const varOf = (name) => toml.match(new RegExp(`^${name} = "([^"]*)"`, 'm'))?.[1];
const CONFIGURED = { rows: Number(varOf('ROWS')), entities: Number(varOf('ENTITIES')),
                     built: varOf('BUILT'), fraction: Number(varOf('EXACT_FRACTION')) };

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function tupfRaw(body) {
  const resp = await fetch(
    `https://${REGION}.turbopuffer.com/v2/namespaces/${NAMESPACE}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TPUF_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { status: resp.status, text: await resp.text() };
}
async function tupf(body) {
  const { status, text } = await tupfRaw(body);
  if (status !== 200) throw new Error(`HTTP ${status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// 0. §8.1 step 7's schema acceptance: the three text columns carry regex: true.
const schema = await (await fetch(
  `https://${REGION}.turbopuffer.com/v1/namespaces/${NAMESPACE}/schema`,
  { headers: { 'Authorization': `Bearer ${TPUF_KEY}` } })).json();
check(['name', 'expr', 'theory'].every((c) => schema?.[c]?.regex === true),
      'name/expr/theory carry regex: true',
      JSON.stringify({ name: schema?.name, expr: schema?.expr, theory: schema?.theory }));
check(!('expr_subtokens' in (schema ?? {})),
      'the *_subtokens columns are gone');

// 1. The embedding path, template included.
const query = 'a sorted list stays sorted when an element is appended';
const vector = await fireworksEmbed(embeddingInput(query), {
  apiKey: FW_KEY, model: process.env.FIREWORKS_MODEL ?? 'fireworks/qwen3-embedding-8b',
});
check(vector.length === DIMENSION, `embedding has ${DIMENSION} dimensions`);
const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
check(Math.abs(norm - 1) < 1e-3, 'embedding is unit-normalized', `|v| = ${norm.toFixed(6)}`);

// 2. The count leg: the tree of a regex condition, no vector.
const compiled = compileRequest({
  query,
  conditions: [{ on: 'expr', polarity: 'contains', text: 'sorted' }],
});
const count = countOf(await tupf(tupfCountBody(compiled.filters)));
check(Number.isInteger(count) && count > 0,
      'the count body is accepted and the count arrives at aggregations.n',
      `${count} matches`);
const route = routeOf(count, CONFIGURED.rows, CONFIGURED.fraction);
console.log(`INFO  route for this condition: ${route} `
            + `(${(100 * count / CONFIGURED.rows).toFixed(2)} % of ${CONFIGURED.rows} rows)`);

// 3. The kNN rank mode under the same tree: the one certificate, never the
// fullness inference the old probe asserted.
const knnData = await tupf(tupfQueryBody({
  vector: Array.from(vector), filters: compiled.filters, mode: 'kNN' }));
const knn = rowsOf(knnData);
check(certified(knn.length, count),
      'kNN satisfies the certificate rows == min(count, top_k)',
      `${knn.length} rows, ${count} matches, top_k ${RESULT_LIMIT}`);
check(knn.every((r) => typeof r.$dist === 'number'), 'kNN rows carry $dist');
check(knn.every((r) => (r.expr ?? '').includes('sorted')),
      'every kNN row satisfies the literal condition');
const first = knn[0] ?? {};
check(typeof first.key === 'string' && typeof first.kind === 'string'
      && typeof first.expr === 'string' && 'source_link' in first,
      'include_attributes honoured on the rows');
console.log(`INFO  kNN performance: ${JSON.stringify(knnData.performance ?? null)}`);

// 4. The ANN rank mode under the same tree: accepted, $dist present, and its
// certificate outcome recorded (an under-fill here is §6.3c's fallback
// trigger, not a failure of this probe).
const ann = rowsOf(await tupf(tupfQueryBody({
  vector: Array.from(vector), filters: compiled.filters, mode: 'ANN' })));
check(ann.every((r) => typeof r.$dist === 'number'), 'ANN rows carry $dist');
const annOwed = Math.min(count, RESULT_LIMIT);
const knnIds = new Set(knn.map((r) => r.id));
const overlap = ann.filter((r) => knnIds.has(r.id)).length;
console.log(`INFO  ANN under the same tree: ${ann.length}/${annOwed} owed rows `
            + `(${certified(ann.length, count) ? 'full' : 'under-filled — the fallback trigger'}), `
            + `overlap with the kNN top: ${overlap}/${Math.min(knn.length, ann.length)}`);

// 5. excludes = Not(Regex) is the exact complement (measured 2026-08-26).
const excluded = compileRequest({
  query,
  conditions: [{ on: 'expr', polarity: 'excludes', text: 'sorted' }],
});
const complement = countOf(await tupf(tupfCountBody(excluded.filters)));
const total = countOf(await tupf(
  { queries: [{ aggregate_by: { n: ['Count', 'id'] } }] }));
check(count + complement === total,
      'Not(Regex) counts the exact complement',
      `${count} + ${complement} = ${count + complement}, namespace holds ${total}`);
check(Math.abs(total - CONFIGURED.rows) <= CONFIGURED.rows / 100,
      'wrangler.toml ROWS is within 1 % of the namespace row count',
      `configured ${CONFIGURED.rows}, counted ${total}`);

// 6. The dialect backstop: a pattern the engine rejects 400s, and the engine's
// message is where the Worker's engineMessageOf looks for it.
const bad = await tupfRaw(tupfQueryBody({
  vector: Array.from(vector), filters: ['expr', 'Regex', '(unclosed'], mode: 'kNN' }));
let engineLine = bad.text;
try { engineLine = String(JSON.parse(bad.text).error ?? bad.text); } catch { /* raw */ }
check(bad.status === 400 && engineLine.length > 0,
      'a broken pattern 400s with an engine message',
      `HTTP ${bad.status}: ${engineLine.slice(0, 120)}`);

// 7. The deployed pages, when SITE_URL is set (RELEASE step 10): /about must
// display exactly the configured ENTITIES and BUILT.
if (process.env.SITE_URL) {
  const about = await (await fetch(`${process.env.SITE_URL}/about`)).text();
  check(about.includes(thin(CONFIGURED.entities)),
        '/about displays the configured ENTITIES', thin(CONFIGURED.entities));
  check(about.includes(CONFIGURED.built),
        '/about displays the configured BUILT', CONFIGURED.built);
}

process.exit(failures ? 1 : 0);
