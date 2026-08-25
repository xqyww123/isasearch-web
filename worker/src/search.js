// The search request: validation, §6.3's filter compilation, the turbopuffer
// query body, and D5's response collapse.  Everything here is pure — the
// tokenizer comes in as an argument — so the tests and the live probe exercise
// exactly what the Worker runs.

import { KINDS, canonicalKinds } from './kinds.js';

// D29's caps, in code points (the plan's "characters"; a UTF-16 count would
// shortchange the 4.15 % of expressions above U+FFFF).
export const QUERY_CAP = 8000;
export const CONDITION_CAP = 512;
// Not a ruled number: a bound on request size only, far above any real use.
export const MAX_CONDITIONS = 64;

// Fetch depth and fused cap (D29/D36): each leg 200, fused list truncated to
// 200, no second request.
export const RESULT_LIMIT = 200;
// §6.6's ruled RRF constant.  Stated in the request rather than inherited from
// the service default, which can move with no error and (D48) no symptom.
export const RRF_CONSTANT = 60;

const FIELD_OF = {
  name: 'name_subtokens',
  expr: 'expr_subtokens',
  theory: 'theory_subtokens',
};
const PANELS = ['name', 'expr', 'theory', 'all'];
const POLARITIES = ['contains', 'excludes'];

// What a result card needs and nothing else: no vector, no subtoken arrays.
const INCLUDE_ATTRIBUTES = [
  'key', 'name', 'expr', 'theories', 'kind', 'position',
  'source_link', 'from_collection', 'interpretation',
];

export class SearchError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

const codePoints = (s) => Array.from(s).length;

/** §11.1's "normalised query string", defined here and nowhere else: NFC,
 * trimmed, inner whitespace runs folded to one space.  Nothing more — case
 * folding or punctuation stripping would change retrieval.  The embedding
 * input, the BM25 leg and the cache key all see this one string. */
export function normalizeQuery(s) {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Validate the request body and compile §6.3's filter tree.
 *
 * Returns { query, bm25, kinds, filters, parts, theoryParts }:
 *   filters      the tree attached to every leg (null when nothing filters)
 *   parts        each condition's surviving subtokens, in request order — the
 *                §5.1 empty state prints them
 *   theoryParts  the subtoken lists of the conditions that reach the Theory
 *                Name field with `contains` — directly or through All (COPY
 *                §4.3) — which D26's marking consumes
 */
export function compileRequest(body, tokenizer) {
  if (typeof body !== 'object' || body === null) throw new SearchError('bad_request');
  if (typeof body.query !== 'string') throw new SearchError('query_missing');
  const query = normalizeQuery(body.query);
  if (query === '') throw new SearchError('query_missing');     // D7
  if (codePoints(query) > QUERY_CAP) {
    throw new SearchError('query_too_long', { cap: QUERY_CAP });
  }
  const bm25 = body.bm25 === undefined ? true : body.bm25;   // hybrid is the default (D29)
  if (typeof bm25 !== 'boolean') throw new SearchError('bad_request');
  const rawKinds = body.kinds ?? [];
  if (!Array.isArray(rawKinds)) throw new SearchError('bad_request');
  for (const k of rawKinds) {
    if (!KINDS.includes(k)) throw new SearchError('kind_unknown', { kind: k });
  }
  const kinds = canonicalKinds(rawKinds);
  const conditions = body.conditions ?? [];
  if (!Array.isArray(conditions) || conditions.length > MAX_CONDITIONS) {
    throw new SearchError('bad_request');
  }

  const clauses = [];
  const parts = [];
  const theoryParts = [];
  conditions.forEach((c, index) => {
    if (typeof c !== 'object' || c === null || typeof c.text !== 'string'
        || !POLARITIES.includes(c.polarity) || !PANELS.includes(c.on)) {
      throw new SearchError('bad_request', { index });
    }
    if (codePoints(c.text) > CONDITION_CAP) {
      throw new SearchError('condition_too_long', { index, cap: CONDITION_CAP });
    }
    const sub = tokenizer.run(c.text);
    parts.push(sub);
    if (sub.length === 0) {
      // §6.3: an empty subtoken list would match everything; reject it and say
      // which condition it was, never silently drop it.
      throw new SearchError('condition_empty', { index });
    }
    // D22 on the `All` panel: excludes means "appears in none of the three" —
    // Not(Or(…)), never Or(Not(…),…).
    const contains = c.on === 'all'
      ? ['Or', ['name', 'expr', 'theory'].map(
          (f) => [FIELD_OF[f], 'ContainsTokenSequence', sub])]
      : [FIELD_OF[c.on], 'ContainsTokenSequence', sub];
    clauses.push(c.polarity === 'contains' ? contains : ['Not', contains]);
    if (c.polarity === 'contains' && (c.on === 'theory' || c.on === 'all')) {
      theoryParts.push(sub);
    }
  });

  // D29 as amended: an empty kind selection sends no kind condition at all;
  // a non-empty one is D38's OR, a membership test on the single-valued kind.
  if (kinds.length > 0) clauses.push(['kind', 'In', kinds]);

  const filters =
    clauses.length === 0 ? null
    : clauses.length === 1 ? clauses[0]
    : ['And', clauses];
  return { query, bm25, kinds, filters, parts, theoryParts };
}


/** The turbopuffer request body for one search: always a `multi_query`, so
 * the response has one shape (`results[0].rows`) in both retrieval states.
 *
 * With `bm25` (D36 as amended 2026-08-24): the vector leg and the BM25 leg over
 * `interpretation`, fused by turbopuffer's RRF, root-level `limit` capping the
 * fused list (root-level `top_k` is silently ignored — measured, §16.8).
 * Without it: the vector leg alone, no `rerank_by` — measured 2026-08-25 to
 * return exactly the bare query's rows and to bill as one leg.  The filter
 * tree is attached to every leg: §6.6's correctness requirement, and the
 * filter runs first — the 200 are the top of what survives it.
 */
export function tupfQueryBody({ vector, query, filters, bm25 }) {
  const leg = (rank_by) => ({
    rank_by,
    top_k: RESULT_LIMIT,
    include_attributes: INCLUDE_ATTRIBUTES,
    ...(filters ? { filters } : {}),
  });
  const queries = [leg(['vector', 'ANN', vector])];
  if (!bm25) return { queries };
  queries.push(leg(['interpretation', 'BM25', query]));
  return { queries, rerank_by: ['RRF', { rank_constant: RRF_CONSTANT }], limit: RESULT_LIMIT };
}

/** The rows of a `multi_query` response.  Exactly one `results` entry is the
 * invariant both states share: a fused request that came back unfused would
 * carry one entry per leg, and that must be an error, not the vector leg
 * served as if fused. */
export function rowsOf(data) {
  const results = data?.results;
  if (!Array.isArray(results) || results.length !== 1 || !Array.isArray(results[0]?.rows)) {
    throw new Error(
      `turbopuffer query: expected one results entry with rows, got `
      + `${Array.isArray(results) ? results.length + ' entries' : typeof results}`);
  }
  return results[0].rows;
}

/** D5's collapse, after ranking, under the user's golden standard of
 * 2026-08-25: two rows are one entity iff both are theorem-alike (32-byte
 * universal key whose tag byte, the 17th, is one of Theorem 0x02 and the four
 * rule kinds 0x12/0x22/0x32/0x42) and their keys agree in every byte but the
 * tag.  A name-addressed record never merges.  The stored `group` column
 * (hash of name and expression) is NOT this relation — it merged the same
 * statement proved in two AFP entries and split the same fact under two
 * names — and is no longer read.
 *
 * The card's fields are the highest-ranked member's — the ranking picks the
 * representative — and `id` is that member's document id, where the card
 * links (D9 as amended: one entity page per record); `kinds` are the kinds of
 * the members that reached the result set.  Row order is rank order and the
 * cards keep it.  D48: no score of any kind is carried over; every field is
 * named here, so an attribute the row lacks becomes the empty value rather
 * than a missing key.
 */
const THEOREM_ALIKE_TAGS = new Set([0x02, 0x12, 0x22, 0x32, 0x42]);
const TAG_INDEX = 16;

/** The collapse class of a row: its universal key with the tag byte masked when
 * theorem-alike, the key itself otherwise (so it merges with nothing). */
export function entityOf(keyBase64url) {
  const bytes = Uint8Array.from(
    atob(keyBase64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  if (bytes.length === 32 && THEOREM_ALIKE_TAGS.has(bytes[TAG_INDEX])) bytes[TAG_INDEX] = 0;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function collapse(rows) {
  const byEntity = new Map();
  const cards = [];
  for (const row of rows) {
    const entity = entityOf(row.key ?? '');
    const seen = byEntity.get(entity);
    if (seen) {
      if (!seen.kinds.includes(row.kind)) seen.kinds.push(row.kind);
      continue;
    }
    const card = {
      id: row.id,
      key: row.key ?? '',
      name: row.name ?? '',
      from_collection: row.from_collection ?? '',
      kinds: [row.kind],
      expr: row.expr ?? '',
      theories: row.theories ?? [],
      position: row.position ?? '',
      source_link: row.source_link ?? '',   // '' is D42's absent form
      interpretation: row.interpretation ?? '',
    };
    byEntity.set(entity, card);
    cards.push(card);
  }
  return cards;
}

/** Is `needle` a contiguous run inside `hay`?  Exactly ContainsTokenSequence's
 * reading, used below to mark which theories matched. */
function containsSequence(hay, needle) {
  outer:
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** D26: when a contains-condition reaches the Theory Name field, a theorem
 * card shows the theories that matched it.  This marks them: for each card,
 * the theory long names whose own subtokens contain some such condition's
 * sequence.  With no such condition the field is absent from the response.
 */
export function matchedTheories(cards, theoryParts, tokenizer) {
  if (theoryParts.length === 0) return;
  const cache = new Map();
  const subtokensOf = (theory) => {
    let sub = cache.get(theory);
    if (!sub) cache.set(theory, sub = tokenizer.run(theory));
    return sub;
  };
  for (const card of cards) {
    card.matched_theories = card.theories.filter((theory) => {
      const sub = subtokensOf(theory);
      return theoryParts.some((p) => containsSequence(sub, p));
    });
  }
}
