// The kind filter's vocabulary, and the query instruction.
//
// The instruction is FIXED (ruled 2026-08-25): the kind selection no longer
// reaches it, so selecting kinds filters and nothing else.  It used to name the
// selected kinds, which changed the query vector and therefore the order of the
// results — a second, invisible effect nobody asked a filter to have.  A fixed
// instruction also means one vector per query text, whatever the selection, so
// the embedding cache is hit far more often.
//
// The instruction text is a snapshot (2026-08-24) of the DB library's default —
// the query template and task_description of embedding_config_template.yaml,
// with render_kinds's default phrase.  Documents were embedded raw, so a
// divergence changes how the site's ranking aligns with the library's, not
// which rows are correct.

// The eleven stored `kind` values of the live namespace (§16.8's census —
// nothing else exists; they are EntityKind.label on the collection side).  The
// interface's button labels ("Theorem", "Named theorems", …) are the front
// end's concern; the API speaks stored values only.
const KIND_VALUES = [
  'lemma',
  'constant',
  'type',
  'typeclass',
  'locale',
  'named theorem bundles',
  'proof method',
  'introduction rule',
  'elimination rule',
  'induction rule',
  'case-split rule',
];

// Insertion order above is the canonical order of a kind selection.
export const KINDS = [...KIND_VALUES];

/** `kinds` in canonical form, so that the filter cannot depend on click order:
 * deduplicated, in KINDS order, and a selection covering every kind reduced to
 * the empty selection — the two restrict nothing alike (D29 as amended). */
export function canonicalKinds(kinds) {
  const chosen = KINDS.filter((k) => kinds.includes(k));
  return chosen.length === KINDS.length ? [] : chosen;
}

const TASK =
  'Given a natural-language description, retrieve the most relevant Isabelle/HOL constructs';

/** The exact text sent to Fireworks for a query.  It is also the embedding
 * cache's key material: two searches share a vector iff the query text is
 * byte-identical.  Nothing else enters it — see the note at the top. */
export function embeddingInput(query) {
  return `Instruct: ${TASK}\nQuery: ${query}`;
}
