// Live integration probe: runs the Worker's OWN builders (kinds.js, search.js,
// embed.js) against the real Fireworks endpoint and the live namespace,
// read-only.  Not a unit test — needs keys in the environment:
//   source ~/Current/MLML/secret.sh
//   TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY" FIREWORKS_API_KEY="$EMBEDDING_API_KEY" \
//     node worker/probe/live_probe.mjs
//
// What it proves: the multi_query body shape is what turbopuffer accepts; the
// filter tree rides both legs; a selective filter still fills top_k (the §6.6
// guarantee, first measured 2026-08-21); the embedding path returns 4096 dims.
// It also prints billing.billable_logical_bytes_queried off the multi_query
// (§6.6: billed once per leg, measured 2026-08-24).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Tokenizer } from '../../site/tokenizer/isabelle_tokenizer.js';
import { embeddingInput } from '../src/kinds.js';
import { compileRequest, tupfQueryBody, rowsOf, collapse, RESULT_LIMIT } from '../src/search.js';
import { fireworksEmbed, DIMENSION } from '../src/embed.js';

const NAMESPACE = process.env.TPUF_NAMESPACE ?? 'isasearch-2025-2-afp-2026-05-13';
const REGION = process.env.TPUF_REGION ?? 'aws-us-west-2';
const TPUF_KEY = process.env.TURBOPUFFER_API_KEY;
const FW_KEY = process.env.FIREWORKS_API_KEY;
if (!TPUF_KEY || !FW_KEY) {
  console.error('set TURBOPUFFER_API_KEY and FIREWORKS_API_KEY (see the header)');
  process.exit(2);
}

const asset = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../site/tokenizer/asset.json', import.meta.url)), 'utf8'));
const tokenizer = new Tokenizer(asset);

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function tupf(body) {
  const resp = await fetch(
    `https://${REGION}.turbopuffer.com/v2/namespaces/${NAMESPACE}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TPUF_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  return { ...data, rows: rowsOf(data) };
}

// 1. The embedding path, template included.
const query = 'a sorted list stays sorted when an element is appended';
const vector = await fireworksEmbed(embeddingInput(query, []), {
  apiKey: FW_KEY, model: process.env.FIREWORKS_MODEL ?? 'fireworks/qwen3-embedding-8b',
});
check(vector.length === DIMENSION, `embedding has ${DIMENSION} dimensions`);
const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
check(Math.abs(norm - 1) < 1e-3, 'embedding is unit-normalized', `|v| = ${norm.toFixed(6)}`);

// 2. The hybrid state: one multi_query, RRF-fused, filters on both legs.
const compiled = compileRequest({
  query,
  conditions: [{ on: 'expr', polarity: 'contains', text: 'sorted' }],
}, tokenizer);
const hybridBody = tupfQueryBody({
  vector: Array.from(vector), query, filters: compiled.filters, bm25: true });
const hybrid = await tupf(hybridBody);
check(Array.isArray(hybrid.rows), 'multi_query body accepted (rows came back)');
check(hybrid.rows.length === RESULT_LIMIT,
      `fused list is capped at root-level limit`, `${hybrid.rows.length} rows`);
const first = hybrid.rows[0] ?? {};
check(typeof first.key === 'string' && typeof first.kind === 'string'
      && typeof first.expr === 'string' && 'source_link' in first,
      'include_attributes honoured on the fused rows');
const sortedEverywhere = hybrid.rows.every((r) =>
  tokenizer.run(r.expr ?? '').includes('sorted'));
check(sortedEverywhere, 'the filter rode BOTH legs (every fused row satisfies it)');
console.log(`INFO  billing off the multi_query: `
            + JSON.stringify(hybrid.billing ?? null));
console.log(`INFO  top card: ${JSON.stringify({
  name: first.name, kind: first.kind }, null, 0)}`);
const cards = collapse(hybrid.rows);
console.log(`INFO  ${hybrid.rows.length} rows collapse to ${cards.length} cards (D5)`);

// 3. The semantic-only state: the vector leg alone.
const single = await tupf(tupfQueryBody({
  vector: Array.from(vector), query, filters: compiled.filters, bm25: false }));
check(single.rows.length === RESULT_LIMIT,
      'vector leg alone returns the full 200', `${single.rows.length} rows`);

// 4. §6.6's guarantee through this builder: the narrowest kind (proof method,
// 832 rows, ~0.06 % selectivity) still fills top_k under ANN.
const narrow = compileRequest({ query, kinds: ['proof method'] }, tokenizer);
const narrowGot = await tupf(tupfQueryBody({
  vector: Array.from(vector), query, filters: narrow.filters, bm25: true }));
check(narrowGot.rows.length === RESULT_LIMIT
      && narrowGot.rows.every((r) => r.kind === 'proof method'),
      'a ~0.06 %-selective kind filter still fills the fused 200',
      `${narrowGot.rows.length} rows, all proof method`);

// 5. excludes(all) = Not(Or(…)): the excluded word appears in none of the three.
const excl = compileRequest({
  query,
  conditions: [{ on: 'all', polarity: 'excludes', text: 'sorted' }],
}, tokenizer);
const exclGot = await tupf(tupfQueryBody({
  vector: Array.from(vector), query, filters: excl.filters, bm25: true }));
const leakage = exclGot.rows.filter((r) =>
  ['expr', 'name'].some((f) => tokenizer.run(r[f] ?? '').includes('sorted'))
  || (r.theories ?? []).some((t) => tokenizer.run(t).includes('sorted')));
check(exclGot.rows.length > 0 && leakage.length === 0,
      'excludes(all) admits no row carrying the word in any of the three fields',
      `${exclGot.rows.length} rows, ${leakage.length} leaked`);

process.exit(failures ? 1 : 0);
