// The kind filter's vocabulary, and the {kinds} slot of the query instruction.
//
// One table carries both: the eleven stored `kind` values of the live namespace
// (§16.8's census — nothing else exists; they are EntityKind.label on the
// collection side) and the noun phrase each contributes to the instruction.
// Being one table, a kind without a phrase cannot exist.  The interface's button
// labels ("Theorem", "Named theorems", …) are the front end's concern; the API
// speaks stored values only.
//
// The phrases and the instruction text below are a snapshot (2026-08-24) of the
// DB library's defaults — render_kinds in semantics.py, and the query template
// and task_description of embedding_config_template.yaml.  Documents were
// embedded raw, so a divergence changes how the site's ranking aligns with the
// library's, not which rows are correct.
const KIND_PHRASE = new Map([
  ['lemma', 'theorems'],
  ['constant', 'constants'],
  ['type', 'types'],
  ['typeclass', 'type classes'],
  ['locale', 'locales'],
  ['named theorem bundles', 'theorem collections'],
  ['proof method', 'proof methods'],
  // The four rule kinds share one phrase, so a selection of several collapses.
  ['introduction rule', 'inference rules'],
  ['elimination rule', 'inference rules'],
  ['induction rule', 'inference rules'],
  ['case-split rule', 'inference rules'],
]);

// Insertion order above is the canonical order of a kind selection.
export const KINDS = [...KIND_PHRASE.keys()];

export const DEFAULT_KINDS_PHRASE = 'constructs';

/** `kinds` in canonical form, so that the phrase, the filter and the embedding
 * cache key cannot depend on click order: deduplicated, in KINDS order, and a
 * selection covering every kind reduced to the empty selection — the two
 * restrict nothing alike, and the library's own convention is that "all" takes
 * the default phrase (D29 as amended: the two are behaviourally identical). */
export function canonicalKinds(kinds) {
  const chosen = KINDS.filter((k) => kinds.includes(k));
  return chosen.length === KINDS.length ? [] : chosen;
}

export function kindsPhrase(kinds) {
  if (!kinds.length) return DEFAULT_KINDS_PHRASE;
  const phrases = [...new Set(kinds.map((k) => KIND_PHRASE.get(k)))];
  if (phrases.length === 1) return phrases[0];
  return phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1];
}

const TASK =
  'Given a natural-language description, retrieve the most relevant Isabelle/HOL {kinds}';

/** The exact text sent to Fireworks for a query.  It is also the embedding
 * cache's key material: two searches share a vector iff this text is
 * byte-identical — kinds phrase included, since it changes the vector. */
export function embeddingInput(query, kinds) {
  return `Instruct: ${TASK.replace('{kinds}', kindsPhrase(kinds))}\nQuery: ${query}`;
}
