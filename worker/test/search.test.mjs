// Unit tests for the Worker's pure core: kinds, request compilation, the query
// bodies, §6.3c's route and certificate, response reading, D5 collapse.  Run:
//   node --test worker/test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, canonicalKinds, embeddingInput } from '../src/kinds.js';
import { compileRequest, normalizeQuery, tupfQueryBody, tupfCountBody,
         rowsOf, countOf, routeOf, certified, collapse, entityOf,
         SearchError, RESULT_LIMIT } from '../src/search.js';

// ---- kinds ----------------------------------------------------------------

test('the eleven stored kind values, exactly (§16.8 census)', () => {
  assert.deepEqual([...KINDS].sort(), [
    'case-split rule', 'constant', 'elimination rule', 'induction rule',
    'introduction rule', 'lemma', 'locale', 'named theorem bundles',
    'proof method', 'type', 'typeclass'].sort());
});

test('canonical kinds: order-free, deduplicated, all-eleven is empty', () => {
  assert.deepEqual(canonicalKinds(['constant', 'lemma']), ['lemma', 'constant']);
  assert.deepEqual(canonicalKinds(['lemma', 'constant', 'lemma']), ['lemma', 'constant']);
  assert.deepEqual(canonicalKinds([...KINDS].reverse()), []);
  assert.deepEqual(canonicalKinds([]), []);
});

test('the embedding input is fixed: the kind selection never reaches it', () => {
  const expected = (q) =>
    'Instruct: Given a natural-language description, retrieve the most relevant '
    + `Isabelle/HOL constructs\nQuery: ${q}`;
  assert.equal(embeddingInput('sorted lists'), expected('sorted lists'));
  // Ruled 2026-08-25: selecting kinds filters and nothing else, so a second
  // argument — however it is passed — cannot change the text or the vector.
  assert.equal(embeddingInput('q', ['lemma']), expected('q'));
  assert.equal(embeddingInput('q', []), expected('q'));
});

// ---- normalisation and compileRequest -------------------------------------

test('§11.1 normalisation: NFC, trim, inner whitespace folded — nothing more', () => {
  assert.equal(normalizeQuery('  sorted \n\t lists  '), 'sorted lists');
  assert.equal(normalizeQuery('é'), 'é');            // NFC composes
  assert.equal(normalizeQuery('Sorted LISTS'), 'Sorted LISTS');   // no case folding
});

const compile = (body) => compileRequest(body);
const failsWith = (body, code) => {
  try {
    compile(body);
  } catch (e) {
    assert.ok(e instanceof SearchError, `expected SearchError, got ${e}`);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail(`expected ${code}, but compilation succeeded`);
};

test('D7: the query is required', () => {
  failsWith({}, 'query_missing');
  failsWith({ query: '   ' }, 'query_missing');
});

test('the compiled query is the normalised one', () => {
  const { query } = compile({ query: '  sorted   lists ' });
  assert.equal(query, 'sorted lists');
});

test('D29 caps: 8000-code-point query, 512-code-point condition', () => {
  assert.ok(compile({ query: '𝔍'.repeat(8000) }));   // astral: 8000 points, 16000 units
  failsWith({ query: 'q'.repeat(8001) }, 'query_too_long');
  const long = { on: 'expr', polarity: 'contains', text: 'a'.repeat(513) };
  failsWith({ query: 'q', conditions: [long] }, 'condition_too_long');
});

test('§6.3: an empty condition is rejected with its index; whitespace is not empty', () => {
  const e = failsWith({
    query: 'q',
    conditions: [
      { on: 'expr', polarity: 'contains', text: 'sorted' },
      { on: 'expr', polarity: 'contains', text: '' },
    ],
  }, 'condition_empty');
  assert.equal(e.params.index, 1);
  // A space is a meaningful pattern, never treated as empty.
  assert.ok(compile({
    query: 'q', conditions: [{ on: 'expr', polarity: 'contains', text: ' ' }] }));
});

test('kinds: unknown rejected; empty sends no condition; canonicalised', () => {
  failsWith({ query: 'q', kinds: ['Theorem'] }, 'kind_unknown');  // UI label, not stored value
  assert.equal(compile({ query: 'q', kinds: [] }).filters, null);
  assert.equal(compile({ query: 'q', kinds: [...KINDS] }).filters, null);
  assert.deepEqual(compile({ query: 'q', kinds: ['constant', 'lemma'] }).filters,
                   ['kind', 'In', ['lemma', 'constant']]);
});

test('§6.3: the compiled filter forms — a condition is a Regex over the raw column', () => {
  const one = compile({
    query: 'q',
    conditions: [{ on: 'expr', polarity: 'contains', text: 'sorted_wrt' }],
  });
  assert.deepEqual(one.filters, ['expr', 'Regex', 'sorted_wrt']);
  assert.equal(one.hasRegex, true);

  // excludes is the measured-exact complement, Not(Regex).
  const ex = compile({
    query: 'q',
    conditions: [{ on: 'name', polarity: 'excludes', text: 'induct' }],
  });
  assert.deepEqual(ex.filters, ['Not', ['name', 'Regex', 'induct']]);

  // The pattern reaches the filter as typed (after NFC), metacharacters and
  // anchors included — the box's content IS the pattern.
  const anchored = compile({
    query: 'q',
    conditions: [{ on: 'name', polarity: 'contains', text: '\\<sorted\\>|^List\\.' }],
  });
  assert.deepEqual(anchored.filters, ['name', 'Regex', '\\<sorted\\>|^List\\.']);

  const combined = compile({
    query: 'q',
    kinds: ['lemma', 'constant'],
    conditions: [{ on: 'theory', polarity: 'contains', text: 'HOL-Library' }],
  });
  assert.deepEqual(combined.filters, ['And', [
    ['theory', 'Regex', 'HOL-Library'],
    ['kind', 'In', ['lemma', 'constant']],
  ]]);
  // A kind-only tree routes like everything else, but carries no regex —
  // the count leg's deadline class and the timeout copy both read this.
  const kindOnly = compile({ query: 'q', kinds: ['lemma'] });
  assert.equal(kindOnly.hasRegex, false);
  assert.deepEqual(kindOnly.filters, ['kind', 'In', ['lemma']]);
});

test("on: 'all' was deleted from the API (user-ruled 2026-08-26)", () => {
  const e = failsWith({
    query: 'q',
    conditions: [{ on: 'all', polarity: 'excludes', text: 'List' }],
  }, 'bad_request');
  assert.equal(e.params.index, 0);
});

// ---- the query bodies / response readers -----------------------------------

test('the ranked body: one vector leg, filters on it, both rank modes', () => {
  const vector = [0.1, 0.2];
  const filters = ['kind', 'In', ['lemma']];

  const ann = tupfQueryBody({ vector, filters });
  assert.equal(ann.queries.length, 1);
  assert.deepEqual(ann.queries[0].rank_by, ['vector', 'ANN', vector]);
  assert.deepEqual(ann.queries[0].filters, filters);
  assert.equal(ann.queries[0].top_k, RESULT_LIMIT);
  assert.ok(!('rerank_by' in ann));

  // §6.3c: the exhaustive kNN rank mode differs in the rank_by spelling only.
  const knn = tupfQueryBody({ vector, filters, mode: 'kNN' });
  assert.deepEqual(knn.queries[0].rank_by, ['vector', 'kNN', vector]);
  assert.deepEqual({ ...knn.queries[0], rank_by: null },
                   { ...ann.queries[0], rank_by: null });

  const unfiltered = tupfQueryBody({ vector, filters: null });
  assert.ok(!('filters' in unfiltered.queries[0]));
});

test('the count body: the same tree, no vector, one Count aggregation', () => {
  const filters = ['expr', 'Regex', 'sorted'];
  assert.deepEqual(tupfCountBody(filters),
    { queries: [{ aggregate_by: { n: ['Count', 'id'] }, filters }] });
});

test('rowsOf accepts exactly one results entry and refuses anything else', () => {
  assert.deepEqual(rowsOf({ results: [{ rows: [{ id: 1 }] }] }), [{ id: 1 }]);
  assert.throws(() => rowsOf({ results: [{ rows: [] }, { rows: [] }] }), /expected one/);
  assert.throws(() => rowsOf({ rows: [] }), /expected one/);
});

test('countOf reads results[0].aggregations.n and refuses anything else', () => {
  assert.equal(countOf({ results: [{ aggregations: { n: 142 } }] }), 142);
  assert.equal(countOf({ results: [{ aggregations: { n: 0 } }] }), 0);
  assert.throws(() => countOf({ results: [{ aggregations: {} }] }), /non-negative integer/);
  assert.throws(() => countOf({ results: [{ aggregations: { n: -1 } }] }), /non-negative integer/);
  assert.throws(() => countOf({ results: [] }), /expected one/);
});

// ---- §6.3c: the route and the certificate ----------------------------------

test('the route: empty at 0, kNN under the line, ANN at and above it', () => {
  const ROWS = 1_337_009, LINE = 0.03;
  assert.equal(routeOf(0, ROWS, LINE), 'empty');
  assert.equal(routeOf(1, ROWS, LINE), 'knn');
  assert.equal(routeOf(Math.ceil(ROWS * LINE) - 1, ROWS, LINE), 'knn');
  assert.equal(routeOf(Math.ceil(ROWS * LINE), ROWS, LINE), 'ann');
  assert.equal(routeOf(ROWS, ROWS, LINE), 'ann');
});

test('the certificate: rows == min(count, top_k)', () => {
  assert.ok(certified(142, 142));            // fewer matches than top_k: all owed
  assert.ok(certified(200, 2831));           // more matches: exactly top_k owed
  assert.ok(!certified(74, 2831));           // the measured ANN loss shape
  assert.ok(!certified(141, 142));           // a kNN shortfall is a violation
  assert.ok(!certified(199, 200));
});

// ---- collapse and D26 marking ---------------------------------------------

// Universal keys as the export stores them (base64url of the bytes).  A
// theorem-alike key is 32 bytes: 16-byte theory prefix, tag, 15-byte digest.
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const thmKey = (prefix, tag, digest = 7) =>
  b64([...Array(16).fill(prefix), tag, ...Array(15).fill(digest)]);
const KEY_THM = thmKey(1, 0x02);          // Theorem
const KEY_INTRO = thmKey(1, 0x12);        // its Introduction-rule twin
const KEY_ELIM = thmKey(1, 0x22);         // its Elimination-rule twin
const KEY_OTHER_PREFIX = thmKey(9, 0x02); // same digest, proved under other theories
const KEY_CONST = b64([...Array(16).fill(1), 0x01, ...Buffer.from('List.sorted')]);
const KEY_LOCALE = b64([...Array(16).fill(1), 0x05, ...Buffer.from('List.sorted')]);

// A row as turbopuffer returns it, score and all — collapse must strip these.
const row = (over) => ({
  '$dist': 0.0328, vector: [0.1], expr_subtokens: ['e'],
  id: 'u', key: KEY_THM, name: 'n', expr: 'e', theory: 'HOL.List', kind: 'lemma',
  position: '', source_link: '', from_collection: '', interpretation: 'i',
  ...over,
});

test('golden standard: theorem-alike keys equal but for the tag byte are one entity', () => {
  assert.equal(entityOf(KEY_THM), entityOf(KEY_INTRO));
  assert.equal(entityOf(KEY_THM), entityOf(KEY_ELIM));
  assert.notEqual(entityOf(KEY_THM), entityOf(KEY_OTHER_PREFIX));  // Overapproximation.avars_aval ×2
  assert.notEqual(entityOf(KEY_CONST), entityOf(KEY_LOCALE));      // name-addressed never merge
});

test('D5: rows of one entity become one card, kinds unioned, rank kept', () => {
  const cards = collapse([
    row({ id: 'ua', key: KEY_THM, kind: 'lemma', interpretation: 'best' }),
    row({ id: 'ub', key: KEY_CONST, kind: 'constant' }),
    row({ id: 'uc', key: KEY_INTRO, name: 'n.intros(4)', kind: 'introduction rule',
          interpretation: 'worse' }),
    row({ id: 'ud', key: KEY_OTHER_PREFIX, kind: 'lemma' }),
    row({ id: 'ue', key: KEY_LOCALE, kind: 'locale' }),
  ]);
  assert.deepEqual(cards.map((c) => c.id), ['ua', 'ub', 'ud', 'ue']);
  assert.deepEqual(cards[0].kinds, ['lemma', 'introduction rule']);
  assert.equal(cards[0].interpretation, 'best');  // the ranking picks the representative
  assert.equal(cards[0].name, 'n');               // and its name, not the twin's
  for (const card of cards) {
    assert.deepEqual(Object.keys(card).sort(), [
      'expr', 'from_collection', 'id', 'interpretation', 'key', 'kinds',
      'name', 'position', 'similarity', 'source_link', 'theory']);
  }
});

// The card carries the cosine similarity (ruled 2026-08-25, reversing D48's "no
// relevance number": with the BM25 leg gone the ranking IS this number).  The
// namespace's metric is cosine_distance, so the card's value is 1 - $dist, and a
// row without one carries null rather than a wrong number.
test('the card carries the cosine similarity, and null when the row has none', () => {
  const [near, far, none] = collapse([
    { key: KEY_THM, kind: 'lemma', $dist: 0.115 },
    { key: KEY_CONST, kind: 'constant', $dist: 0.265 },
    { key: KEY_LOCALE, kind: 'locale' },
  ]);
  assert.ok(Math.abs(near.similarity - 0.885) < 1e-9);
  assert.ok(Math.abs(far.similarity - 0.735) < 1e-9);
  assert.ok(near.similarity > far.similarity);   // rank order is similarity order
  assert.equal(none.similarity, null);
});

test('collapse: an attribute the row lacks is the empty value, never a missing key', () => {
  const [card] = collapse([{ key: KEY_THM, kind: 'lemma' }]);
  assert.equal(card.expr, '');
  assert.equal(card.theory, '');
  assert.equal(card.source_link, '');
});

test('the card carries the one theory the entity is written in', () => {
  const [card] = collapse([row({ key: KEY_THM, theory: 'Query_Optimization.JoinTree' })]);
  assert.equal(card.theory, 'Query_Optimization.JoinTree');
  // Empty is the honest value for the records that have no defining theory; it
  // is a string either way, never a missing key.
  const [none] = collapse([row({ key: KEY_CONST, theory: '' })]);
  assert.equal(none.theory, '');
});
