// Unit tests for the shared render module — the first ones it has had.  It runs
// in two places (the browser bundle and the Worker's entity page), so a mistake
// here is a mistake on both surfaces.  Run with:
//   node --test worker/test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sourceText, theoryHref } from '../../site/app/public/render.js';

// ---- the source link's text (COPY §4.4) -----------------------------------

test('a theory page prints the theory long name with the line', () => {
  assert.equal(
    sourceText({ source_link: '/source/HOL-Computational_Algebra.Primes.html#L525',
                 position: '~~/src/HOL/Computational_Algebra/Primes.thy:525' }),
    'HOL-Computational_Algebra.Primes.thy:525');
});

// The regression the `.ML` branch exists for: until 2026-08-26 these printed
// `_aux/AFP/AutoCorres2/utils.ML.thy:123`, leaking the published tree's internal
// `_aux/` directory and naming a theory that does not exist.  7,292 cards.
test('an Isabelle/ML position prints its symbolic path, not the published one', () => {
  assert.equal(
    sourceText({ source_link: '/source/_aux/AFP/AutoCorres2/utils.ML.html#L123',
                 position: '$AFP/AutoCorres2/utils.ML:123' }),
    '$AFP/AutoCorres2/utils.ML:123');
  assert.equal(
    sourceText({
      source_link: '/source/_aux/ISABELLE_HOME/src/HOL/Nominal/nominal_thmdecls.ML.html#L175',
      position: '~~/src/HOL/Nominal/nominal_thmdecls.ML:175' }),
    '~~/src/HOL/Nominal/nominal_thmdecls.ML:175');
});

test('the two `nominal_thmdecls.ML` files stay distinguishable', () => {
  const afp = sourceText({
    source_link: '/source/_aux/AFP/Nominal2/nominal_thmdecls.ML.html#L97',
    position: '$AFP/Nominal2/nominal_thmdecls.ML:97' });
  const dist = sourceText({
    source_link: '/source/_aux/ISABELLE_HOME/src/HOL/Nominal/nominal_thmdecls.ML.html#L175',
    position: '~~/src/HOL/Nominal/nominal_thmdecls.ML:175' });
  assert.notEqual(afp, dist);
});

test('an aux link with no position falls back rather than rendering blank', () => {
  // Unreachable on published data — every row without a position has no link
  // either — but a blank string would hide the anchor, which is worse than the
  // pre-2026-08-26 text.  Not reached means not silently empty.
  const got = sourceText({ source_link: '/source/_aux/AFP/AutoCorres2/utils.ML.html#L123',
                           position: '' });
  assert.notEqual(got, '');
});

test('a link with no line fragment, and the absent form', () => {
  assert.equal(sourceText({ source_link: '/source/HOL.List.html', position: '' }),
               'HOL.List.thy');
  assert.equal(sourceText({ source_link: '', position: '' }), '');
  assert.equal(sourceText({}), '');
});

// ---- the theory chip's address --------------------------------------------

// `serveSource` uses the undecoded URL path as the R2 key, so an escaped name
// looks up a key no object has.  `encodeURIComponent` was here until 2026-08-25
// and turned the `+` of the 29 `CoreC++.*` names into `%2B`, 404ing every one of
// their chips while the unescaped URL served 200.
test('a theory address is the theory name verbatim, unescaped', () => {
  assert.equal(theoryHref('HOL.Finite_Set'), '/source/HOL.Finite_Set.html');
  assert.equal(theoryHref('CoreC++.Annotate'), '/source/CoreC++.Annotate.html');
  assert.equal(theoryHref('Pure'), '/source/Pure.html');
});

test('every character published theory names use survives untouched', () => {
  // All 9,784 published long names are built from these six classes and nothing
  // else (counted 2026-08-26); each is a literal in a URL path segment.
  const name = 'CoreC++.Zeta-9_x.Y';
  assert.equal(theoryHref(name), `/source/${name}.html`);
});
