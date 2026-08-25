// Unit tests for the Worker's pure core: kinds, request compilation, query-body
// construction, response reading, D5 collapse, D26 marking.  Run with:
//   node --test worker/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Tokenizer } from '../../site/tokenizer/isabelle_tokenizer.js';
import { KINDS, canonicalKinds, kindsPhrase, embeddingInput,
         DEFAULT_KINDS_PHRASE } from '../src/kinds.js';
import { compileRequest, normalizeQuery, tupfQueryBody, rowsOf, collapse, entityOf,
         matchedTheories, SearchError, RESULT_LIMIT, RRF_CONSTANT } from '../src/search.js';

const asset = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../site/tokenizer/asset.json', import.meta.url)), 'utf8'));
const tokenizer = new Tokenizer(asset);

// ---- kinds ----------------------------------------------------------------

test('the eleven stored kind values, exactly (§16.8 census)', () => {
  assert.deepEqual([...KINDS].sort(), [
    'case-split rule', 'constant', 'elimination rule', 'induction rule',
    'introduction rule', 'lemma', 'locale', 'named theorem bundles',
    'proof method', 'type', 'typeclass'].sort());
  // Every kind has a phrase: a lone selection never falls back to the default.
  for (const k of KINDS) assert.notEqual(kindsPhrase([k]), DEFAULT_KINDS_PHRASE);
});

test('canonical kinds: order-free, deduplicated, all-eleven is empty', () => {
  assert.deepEqual(canonicalKinds(['constant', 'lemma']), ['lemma', 'constant']);
  assert.deepEqual(canonicalKinds(['lemma', 'constant', 'lemma']), ['lemma', 'constant']);
  assert.deepEqual(canonicalKinds([...KINDS].reverse()), []);
  assert.deepEqual(canonicalKinds([]), []);
});

test('kinds phrase: empty, single, join, rule collapse', () => {
  assert.equal(kindsPhrase([]), DEFAULT_KINDS_PHRASE);
  assert.equal(kindsPhrase(['constant']), 'constants');
  assert.equal(kindsPhrase(['lemma', 'constant']), 'theorems and constants');
  assert.equal(kindsPhrase(['lemma', 'constant', 'type']),
               'theorems, constants and types');
  // The four rule kinds collapse to ONE "inference rules".
  assert.equal(kindsPhrase(['introduction rule', 'elimination rule']),
               'inference rules');
  assert.equal(kindsPhrase(['lemma', 'induction rule', 'case-split rule']),
               'theorems and inference rules');
});

test('embedding input reproduces the library template', () => {
  assert.equal(
    embeddingInput('sorted lists', []),
    'Instruct: Given a natural-language description, retrieve the most relevant '
    + 'Isabelle/HOL constructs\nQuery: sorted lists');
  assert.equal(
    embeddingInput('q', ['lemma']),
    'Instruct: Given a natural-language description, retrieve the most relevant '
    + 'Isabelle/HOL theorems\nQuery: q');
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

test('the compiled query is the normalised one, and the same string feeds both legs', () => {
  const { query, bm25 } = compile({ query: '  sorted   lists ' });
  assert.equal(query, 'sorted lists');
  assert.equal(bm25, true);
  const body = tupfQueryBody({ vector: [0], query, filters: null, bm25 });
  assert.deepEqual(body.queries[1].rank_by, ['interpretation', 'BM25', 'sorted lists']);
});

test('D29 caps: 8000-code-point query, 512-code-point condition', () => {
  assert.ok(compile({ query: '𝔍'.repeat(8000) }));   // astral: 8000 points, 16000 units
  failsWith({ query: 'q'.repeat(8001) }, 'query_too_long');
  const long = { on: 'expr', polarity: 'contains', text: 'a'.repeat(513) };
  failsWith({ query: 'q', conditions: [long] }, 'condition_too_long');
});

test('bm25 must be a boolean when present', () => {
  assert.equal(compile({ query: 'q', bm25: false }).bm25, false);
  for (const bad of ['false', 0, null]) failsWith({ query: 'q', bm25: bad }, 'bad_request');
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

test('two retrieval states, one request shape: hybrid RRF vs the vector leg alone', () => {
  const vector = [0.1, 0.2];
  const filters = ['kind', 'In', ['lemma']];

  const hybrid = tupfQueryBody({ vector, query: 'sorted', filters, bm25: true });
  assert.deepEqual(hybrid.rerank_by, ['RRF', { rank_constant: RRF_CONSTANT }]);
  assert.equal(hybrid.limit, RESULT_LIMIT);
  assert.equal(hybrid.queries.length, 2);
  assert.deepEqual(hybrid.queries[0].rank_by, ['vector', 'ANN', vector]);
  assert.deepEqual(hybrid.queries[1].rank_by, ['interpretation', 'BM25', 'sorted']);
  // §6.6: the filter tree is attached to BOTH legs.
  assert.deepEqual(hybrid.queries[0].filters, filters);
  assert.deepEqual(hybrid.queries[1].filters, filters);
  assert.equal(hybrid.queries[0].top_k, RESULT_LIMIT);

  const single = tupfQueryBody({ vector, query: 'sorted', filters, bm25: false });
  assert.equal(single.queries.length, 1);
  assert.deepEqual(single.queries[0].rank_by, ['vector', 'ANN', vector]);
  assert.deepEqual(single.queries[0].filters, filters);
  assert.ok(!('rerank_by' in single));

  const unfiltered = tupfQueryBody({ vector, query: 'q', filters: null, bm25: false });
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

test('D5: rows of one entity become one card, kinds unioned, rank kept; D48: no score', () => {
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
      'name', 'position', 'source_link', 'theories']);
  }
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
