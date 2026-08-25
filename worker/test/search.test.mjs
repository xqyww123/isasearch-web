// Unit tests for the Worker's pure core: kinds, request compilation, query-body
// construction, response reading, D5 collapse, D26 marking.  Run with:
//   node --test worker/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Tokenizer } from '../../site/tokenizer/isabelle_tokenizer.js';
import { KINDS, canonicalKinds, embeddingInput } from '../src/kinds.js';
import { compileRequest, normalizeQuery, tupfQueryBody, rowsOf, collapse, entityOf,
         matchedTheories, SearchError, RESULT_LIMIT } from '../src/search.js';

const asset = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../site/tokenizer/asset.json', import.meta.url)), 'utf8'));
const tokenizer = new Tokenizer(asset);

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

const compile = (body) => compileRequest(body, tokenizer);
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

test('a separators-only condition is rejected, with its index', () => {
  const e = failsWith({
    query: 'q',
    conditions: [
      { on: 'expr', polarity: 'contains', text: 'sorted' },
      { on: 'expr', polarity: 'contains', text: '_ . _' },
    ],
  }, 'condition_empty');
  assert.equal(e.params.index, 1);
});

test('kinds: unknown rejected; empty sends no condition; canonicalised', () => {
  failsWith({ query: 'q', kinds: ['Theorem'] }, 'kind_unknown');  // UI label, not stored value
  assert.equal(compile({ query: 'q', kinds: [] }).filters, null);
  assert.equal(compile({ query: 'q', kinds: [...KINDS] }).filters, null);
  assert.deepEqual(compile({ query: 'q', kinds: ['constant', 'lemma'] }).filters,
                   ['kind', 'In', ['lemma', 'constant']]);
});

test('§6.3: the compiled filter forms', () => {
  const one = compile({
    query: 'q',
    conditions: [{ on: 'expr', polarity: 'contains', text: 'sorted_wrt' }],
  });
  assert.deepEqual(one.filters,
    ['expr_subtokens', 'ContainsTokenSequence', ['sorted', 'wrt']]);
  assert.deepEqual(one.parts, [['sorted', 'wrt']]);

  const ex = compile({
    query: 'q',
    conditions: [{ on: 'name', polarity: 'excludes', text: 'induct' }],
  });
  assert.deepEqual(ex.filters,
    ['Not', ['name_subtokens', 'ContainsTokenSequence', ['induct']]]);

  // excludes(all) is Not(Or(...)) — "appears in none of the three".
  const all = compile({
    query: 'q',
    conditions: [{ on: 'all', polarity: 'excludes', text: 'List' }],
  });
  assert.deepEqual(all.filters, ['Not', ['Or', [
    ['name_subtokens', 'ContainsTokenSequence', ['List']],
    ['expr_subtokens', 'ContainsTokenSequence', ['List']],
    ['theory_subtokens', 'ContainsTokenSequence', ['List']],
  ]]]);

  const combined = compile({
    query: 'q',
    kinds: ['lemma', 'constant'],
    conditions: [{ on: 'theory', polarity: 'contains', text: 'HOL-Library' }],
  });
  // D21 keeps operator tokens: the hyphen survives as its own subtoken.
  assert.deepEqual(combined.filters, ['And', [
    ['theory_subtokens', 'ContainsTokenSequence', ['HOL', '-', 'Library']],
    ['kind', 'In', ['lemma', 'constant']],
  ]]);
});

test('D26 marking parts: Theory Name and All contains-conditions, nothing else', () => {
  const { theoryParts } = compile({
    query: 'q',
    conditions: [
      { on: 'theory', polarity: 'contains', text: 'HOL-Library' },
      { on: 'all', polarity: 'contains', text: 'Multiset' },
      { on: 'theory', polarity: 'excludes', text: 'Nominal' },
      { on: 'expr', polarity: 'contains', text: 'sorted' },
    ],
  });
  assert.deepEqual(theoryParts, [['HOL', '-', 'Library'], ['Multiset']]);
});

test('the tokenizer resolves ASCII escapes in a condition', () => {
  const { parts } = compile({
    query: 'q',
    conditions: [{ on: 'expr', polarity: 'contains', text: '\\<Longrightarrow>' }],
  });
  assert.deepEqual(parts, [['⟹']]);
});

// ---- tupfQueryBody / rowsOf -------------------------------------------------

test('the request body: the vector leg alone, filters on it, no fusion', () => {
  const vector = [0.1, 0.2];
  const filters = ['kind', 'In', ['lemma']];

  const single = tupfQueryBody({ vector, filters });
  assert.equal(single.queries.length, 1);
  assert.deepEqual(single.queries[0].rank_by, ['vector', 'ANN', vector]);
  assert.deepEqual(single.queries[0].filters, filters);
  assert.equal(single.queries[0].top_k, RESULT_LIMIT);
  assert.ok(!('rerank_by' in single));

  const unfiltered = tupfQueryBody({ vector, filters: null });
  assert.ok(!('filters' in unfiltered.queries[0]));
});

test('rowsOf accepts exactly one results entry and refuses the unfused shape', () => {
  assert.deepEqual(rowsOf({ results: [{ rows: [{ id: 1 }] }] }), [{ id: 1 }]);
  assert.throws(() => rowsOf({ results: [{ rows: [] }, { rows: [] }] }), /expected one/);
  assert.throws(() => rowsOf({ rows: [] }), /expected one/);
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
  id: 'u', key: KEY_THM, name: 'n', expr: 'e', theories: [], kind: 'lemma',
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
      'name', 'position', 'similarity', 'source_link', 'theories']);
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
  assert.deepEqual(card.theories, []);
  assert.equal(card.source_link, '');
});

test('D26: theories matching an active Theory Name condition are marked', () => {
  const cards = collapse([
    row({ key: KEY_THM,
          theories: ['HOL.List', 'HOL-Library.Multiset', 'Affine_Arithmetic.Foo'] }),
  ]);
  matchedTheories(cards, [tokenizer.run('HOL-Library')], tokenizer);
  assert.deepEqual(cards[0].matched_theories, ['HOL-Library.Multiset']);

  // No active condition: the field is absent, not empty.
  const bare = collapse([row({ key: KEY_OTHER_PREFIX, theories: ['HOL.List'] })]);
  matchedTheories(bare, [], tokenizer);
  assert.ok(!('matched_theories' in bare[0]));
});
