// Rendering shared by the browser (app.js, the result list) and the Worker
// (the entity page): one place that turns a card into markup, so the two never
// disagree.  Every visitor-facing string here is copied from site/COPY.md — the
// section is named beside it — and none may be paraphrased (§12.1 of the plan).
// The module has no dependencies and touches no DOM: it returns strings.

// ---- the eleven kinds (COPY §3.6 order; stored value -> visible label) ------
export const KIND_LABEL = new Map([
  ['lemma', 'Theorem'],
  ['named theorem bundles', 'Named theorems'],
  ['constant', 'Constant'],
  ['type', 'Type'],
  ['typeclass', 'Class'],
  ['locale', 'Locale'],
  ['proof method', 'Proof method'],
  ['introduction rule', 'Introduction rule'],
  ['elimination rule', 'Elimination rule'],
  ['induction rule', 'Induction rule'],
  ['case-split rule', 'Case split'],
]);
export const KINDS = [...KIND_LABEL.keys()];

// The mockup's hues, one per kind; the four rule kinds share one.
const KIND_HUE = new Map([
  ['lemma', 250], ['constant', 150], ['type', 70], ['typeclass', 330],
  ['locale', 25], ['proof method', 200], ['named theorem bundles', 110],
  ['introduction rule', 290], ['elimination rule', 290],
  ['induction rule', 290], ['case-split rule', 290],
]);
export const kindColor = (kind) => `oklch(0.55 0.10 ${KIND_HUE.get(kind) ?? 0})`;

// COPY §1: a derived rule is one of the four; theorem-alike = Theorem or a
// derived rule.  Such a record shows no theory line (D26) unless a condition
// reached Theory Name.
export const THEOREM_ALIKE = new Set([
  'lemma', 'introduction rule', 'elimination rule', 'induction rule', 'case-split rule']);

// COPY §3.6 hovers on two kind buttons; the others have none.
export const KIND_HOVER = new Map([
  ['named theorem bundles', 'A `named_theorems` declaration, such as `approximation_preproc`.'],
  ['case-split rule', 'A case rule: one case for each constructor of a datatype, or for each '
    + 'introduction rule of an inductive definition. A rule whose name ends in `.split`, '
    + 'such as `option.split`, has the kind Theorem here.'],
]);

// ---- strings ------------------------------------------------------------------
export const COPY = {
  // §4.1
  copy: 'Copy the expression',
  copied: 'Copied',
  copyFailed: 'Could not copy. Select the expression and copy it yourself.',
  showAll: (n) => `${thin(n)} characters — show all`,
  collapseExpr: 'collapse expression',
  // §4.2 — the machine-generated disclosure, locked by D30 and D40
  disclosure: 'Written by a language model from the formal statement, not by the theory\'s '
    + 'authors. It may be imprecise or wrong. Where the explanation and the statement '
    + 'disagree, the statement is the correct one. Isasearch searches this text as well, '
    + 'so an entity with a poor explanation may rank lower than it deserves.',
  noExplanation: 'No explanation was generated for this entity. Its name and its expression '
    + 'still place it in the results, but the search box works best against an '
    + 'explanation, so this entity is harder to reach by describing it.',
  // §4.3
  theoryLine: 'a constant in this statement comes from',
  theoryHover: (n) => `Your condition matched this theory. It is one of the ${thin(n)} theories `
    + 'that declare the constants in this statement. The theory where the theorem was '
    + 'proved is usually in that set too, because a statement normally uses constants '
    + 'from its own theory — but Isasearch does not mark which one it is, so a match '
    + `here does not tell you where the theorem was proved. The entity page lists all ${thin(n)}.`,
  // §4.4
  sourceHover: 'The command that produced this entity. Many entities come from a command '
    + 'such as `datatype` or `fun` rather than from an explicit declaration, so the line '
    + 'number refers to that command.',
  sourceAbsent: 'source position not recorded',
  sourceAbsentHover: 'Some commands do not report a position, so Isasearch cannot provide a link.',
  // §8
  associatedTheories: 'Associated theories',
  associatedTheoriesNote: 'These are the theories that declare the constants appearing in '
    + 'this statement. About five times in six the theory where the theorem was proved is '
    + 'among them, because a statement normally uses constants from its own theory; the '
    + 'rest of the time it is absent. Isasearch does not mark it either way. Its name is at '
    + 'the start of the entity name above, up to the first dot.',
  source: 'Source',
  sourceNone: 'No source position was recorded for this entity. Some commands do not report one.',
  nearest: 'Nearest entities',
  nearestNote: 'The ten entities closest to this one, compared with each other by the same '
    + 'measure that compares a query with an entity on the result cards. There is no query '
    + 'here, so keyword matching is not used.',
  nearestNone: 'Nearest entities are not available for this entity.',
  entityMissing: 'No entity was found at this web address. The entity may have been removed '
    + 'when the index was rebuilt.',
  entityMissingLink: 'Search instead',
};

// COPY §1: four digits or more are grouped with a non-breaking thin space.
export function thin(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// §6.1: a member of a dynamic fact collection is shown as `<collection>(_)`.
export const displayName = (card) =>
  card.from_collection ? `${card.from_collection}(_)` : card.name;

// D9: the entity page address is the universal key, base64url without padding.
export const entityHref = (card) =>
  `/entity/${card.key.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

// §4.4's link text: the file's base name and the line, from `position`
// (`~~/src/HOL/List.thy:1204` or `$AFP/Entry/File.thy:31`).
export function sourceText(position) {
  const m = /([^/]+):(\d+)$/.exec(position ?? '');
  return m ? `${m[1]}:${m[2]}` : position ?? '';
}

// ---- fragments ------------------------------------------------------------------

export const kindBadge = (kind, big = false) =>
  `<span class="kind${big ? ' kind-big' : ''}"${KIND_HOVER.has(kind) ? ` title="${esc(KIND_HOVER.get(kind))}"` : ''}>`
  + `<span class="kind-dot" style="background: ${kindColor(kind)}"></span>${esc(KIND_LABEL.get(kind) ?? kind)}</span>`;

export function sourceLink(card, verbose = false) {
  if (card.source_link) {
    const a = `<a class="mono" href="${esc(card.source_link)}" title="${esc(COPY.sourceHover)}">${esc(sourceText(card.position))}</a>`;
    return verbose ? `This entity was produced by the command at ${a}.` : a;   // §8 / §4.4
  }
  return verbose
    ? esc(COPY.sourceNone)
    : `<span class="source-absent" title="${esc(COPY.sourceAbsentHover)}">${esc(COPY.sourceAbsent)}</span>`;
}

// §4.3.  A name-addressed entity: its one theory.  Theorem-alike: nothing,
// unless a contains-condition reached Theory Name (then `matched_theories` is
// set by the Worker) — the first matched theory, with the hover.
export function theoryLine(card) {
  const thmAlike = card.kinds.every((k) => THEOREM_ALIKE.has(k));
  if (!thmAlike) {
    return `<div class="theory-line mono">${esc(card.theories[0] ?? '')}</div>`;
  }
  const matched = card.matched_theories?.[0];
  if (!matched) return '';
  return `<div class="theory-line mono" title="${esc(COPY.theoryHover(card.theories.length))}">`
    + `<span class="theory-lead">${esc(COPY.theoryLine)}</span> ${esc(matched)}</div>`;
}

export const explanation = (card) => card.interpretation
  ? `<div class="expl-text">${esc(card.interpretation)}</div>`
    + `<div class="expl-disclosure">${esc(COPY.disclosure)}</div>`
  : `<div class="expl-text expl-none">${esc(COPY.noExplanation)}</div>`;
