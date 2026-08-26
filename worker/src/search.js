// The search request: validation, §6.3's filter compilation, the turbopuffer
// query bodies, and D5's response collapse.  Everything here is pure, so the
// tests and the live probe exercise exactly what the Worker runs.

import { KINDS, canonicalKinds } from './kinds.js';

// D29's caps, in code points (the plan's "characters"; a UTF-16 count would
// shortchange the 4.15 % of expressions above U+FFFF).
export const QUERY_CAP = 8000;
export const CONDITION_CAP = 512;
// Not a ruled number: a bound on request size only, far above any real use.
export const MAX_CONDITIONS = 64;

// Fetch depth (D29): the top 200 of the vector leg, no second request.
export const RESULT_LIMIT = 200;

// A condition names one raw text column (§6.3 as amended: `on: 'all'` was
// deleted from the API 2026-08-26, user-ruled).
const PANELS = ['name', 'expr', 'theory'];
const POLARITIES = ['contains', 'excludes'];

// What a result card needs and nothing else: no vector, no subtoken arrays.
const INCLUDE_ATTRIBUTES = [
  'key', 'name', 'expr', 'theory', 'kind', 'position',
  'source_link', 'from_collection', 'interpretation',
];

export class SearchError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/** A backend request that failed with an HTTP status.  The body is kept in
 * full up to 4 KiB (§6.3c: turbopuffer's regex parse errors can be multi-line,
 * and the client renders the engine's message verbatim — COPY §5.8). */
export class UpstreamError extends Error {
  constructor(service, status, body) {
    super(`${service}: HTTP ${status}: ${String(body).slice(0, 200)}`);
    this.status = status;
    this.body = String(body).slice(0, 4096);
  }
}

const codePoints = (s) => Array.from(s).length;

/** §11.1's "normalised query string", defined here and nowhere else: NFC,
 * trimmed, inner whitespace runs folded to one space.  Nothing more — case
 * folding or punctuation stripping would change retrieval.  The embedding
 * input and the cache key both see this one string. */
export function normalizeQuery(s) {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Validate the request body and compile §6.3's filter tree.
 *
 * A condition is a regular expression over the field's raw displayed text
 * (§13 Q14, the final ruling): NFC-normalised — the box's content IS the
 * pattern, nothing else is applied — and compiled to a `Regex` filter;
 * `excludes` is its measured-exact complement `Not(Regex)`.
 *
 * Returns { query, kinds, filters, hasRegex }:
 *   filters      the tree attached to every query (null when nothing filters)
 *   hasRegex     whether any condition is present — it decides the count leg's
 *                deadline class and the timeout copy (§6.3c)
 */
export function compileRequest(body) {
  if (typeof body !== 'object' || body === null) throw new SearchError('bad_request');
  if (typeof body.query !== 'string') throw new SearchError('query_missing');
  const query = normalizeQuery(body.query);
  if (query === '') throw new SearchError('query_missing');     // D7
  if (codePoints(query) > QUERY_CAP) {
    throw new SearchError('query_too_long', { cap: QUERY_CAP });
  }
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
  conditions.forEach((c, index) => {
    if (typeof c !== 'object' || c === null || typeof c.text !== 'string'
        || !POLARITIES.includes(c.polarity) || !PANELS.includes(c.on)) {
      throw new SearchError('bad_request', { index });
    }
    if (codePoints(c.text) > CONDITION_CAP) {
      throw new SearchError('condition_too_long', { index, cap: CONDITION_CAP });
    }
    const pattern = c.text.normalize('NFC');
    if (pattern === '') {
      // §6.3: an empty pattern is a valid regular expression that matches
      // every row (measured) — the outcome D7 forbids.  Whitespace-only text
      // is NOT empty: a space is a meaningful pattern.
      throw new SearchError('condition_empty', { index });
    }
    const contains = [c.on, 'Regex', pattern];
    clauses.push(c.polarity === 'contains' ? contains : ['Not', contains]);
  });

  // D29 as amended: an empty kind selection sends no kind condition at all;
  // a non-empty one is D38's OR, a membership test on the single-valued kind.
  if (kinds.length > 0) clauses.push(['kind', 'In', kinds]);

  const filters =
    clauses.length === 0 ? null
    : clauses.length === 1 ? clauses[0]
    : ['And', clauses];
  return { query, kinds, filters, hasRegex: conditions.length > 0 };
}


/** The turbopuffer request body for one ranked query: a `multi_query` with the
 * vector leg alone (the BM25 leg and RRF fusion were dropped 2026-08-25: the
 * user measured the hybrid results as worse).  The filter tree rides on the
 * leg and runs first — the 200 are the top of what survives it (§6.6).
 * `mode` is one of §6.3c's two rank modes: 'ANN' (fast, approximate) or 'kNN'
 * (exhaustive, exact; requires a filter). */
export function tupfQueryBody({ vector, filters, mode = 'ANN' }) {
  return {
    queries: [{
      rank_by: ['vector', mode, vector],
      top_k: RESULT_LIMIT,
      include_attributes: INCLUDE_ATTRIBUTES,
      ...(filters ? { filters } : {}),
    }],
  };
}

/** §6.3c's standalone exact count over the same tree, no vector. */
export function tupfCountBody(filters) {
  return { queries: [{ aggregate_by: { n: ['Count', 'id'] }, filters }] };
}

/** Exactly one `results` entry is the invariant of every `multi_query` this
 * Worker sends: anything else is an error, never a guess. */
function resultOf(data) {
  const results = data?.results;
  if (!Array.isArray(results) || results.length !== 1) {
    throw new Error(
      `turbopuffer query: expected one results entry, got `
      + `${Array.isArray(results) ? results.length + ' entries' : typeof results}`);
  }
  return results[0];
}

/** The rows of a ranked `multi_query` response. */
export function rowsOf(data) {
  const rows = resultOf(data).rows;
  if (!Array.isArray(rows)) throw new Error('turbopuffer query: no rows in the results entry');
  return rows;
}

/** The exact match count of a `tupfCountBody` response (§6.3c: it arrives at
 * `results[0].aggregations.n`). */
export function countOf(data) {
  const n = resultOf(data).aggregations?.n;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`turbopuffer count: expected a non-negative integer, got ${JSON.stringify(n)}`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// §6.3c's route and certificate, as pure functions of the numbers.
// ---------------------------------------------------------------------------

/** Which query the router issues, given the tree's exact match count and the
 * namespace's row count (`ROWS` from wrangler [vars]; the 3 % line is a
 * fraction of it).  A null filter tree never reaches this — a search with no
 * filter at all is plain ANN (kNN requires a filter). */
export function routeOf(count, rows, fraction) {
  return count === 0 ? 'empty' : count < rows * fraction ? 'knn' : 'ann';
}

/** The one certificate everywhere (§6.3c): an exact query returned every row
 * it owed, `rows == min(count, top_k)`.  Asserted on EVERY kNN result — a
 * shortfall is a vendor-contract violation and an error, never served — and
 * its failure on the ANN branch is the under-fill trigger. */
export const certified = (rowCount, count) =>
  rowCount === Math.min(count, RESULT_LIMIT);

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
      theory: row.theory ?? '',
      position: row.position ?? '',
      source_link: row.source_link ?? '',   // '' is D42's absent form
      interpretation: row.interpretation ?? '',
      // The namespace's metric is cosine_distance, so this is the cosine
      // similarity between the query vector and this record's (ruled
      // 2026-08-25; it is the whole ranking now that the BM25 leg is gone,
      // hence monotone down the list — the objection D48 was written against).
      similarity: typeof row.$dist === 'number' ? 1 - row.$dist : null,
    };
    byEntity.set(entity, card);
    cards.push(card);
  }
  return cards;
}

// D26's marking stood here until 2026-08-26, with `containsSequence` beneath it:
// when a contains-condition reached the Theory Name field, a theorem card marked
// which of its theories had matched, because a theorem carried around seven of
// them and the reader could not otherwise tell which one the condition had found.
// A record has one theory now — the one it is written in — so a Theory Name
// condition that matches has matched that, and there is nothing to pick out.
