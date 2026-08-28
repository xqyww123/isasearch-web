// The pages the Worker assembles (§9.5): the shell around a fragment, with the
// sentinel row's entity count and build date in every header and footer, and
// the entity page (§9.4, D9 as amended 2026-08-25) built from one record.
// Markup comes from site/app/pages/*.html and site/app/public/render.js; no
// string here is visitor-facing except through those.

import shell from '../../site/app/pages/shell.html';
import indexPage from '../../site/app/pages/index.html';
import aboutPage from '../../site/app/pages/about.html';
import entityPage from '../../site/app/pages/entity.html';
import { esc, thin, displayName, entityHref, kindBadge, kindColor, KIND_LABEL,
         sourceLink, definedIn, explanation, COPY,
         theoryHref } from '../../site/app/public/render.js';

const fill = (template, slots) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => slots[k] ?? '');

/** `site` is what the sentinel row and wrangler vars say: entities, built,
 * release, snapshot, model — every page prints them. */
export function page(fragment, site, { title, head = '', ...slots }) {
  const common = { ...site, entities: thin(site.entities), title, head };
  return fill(shell, { ...common, main: fill(fragment, { ...common, ...slots }) });
}

export const searchPage = (site) => page(indexPage, site, {
  title: 'IsaFinder', head: '<script type="module" src="/app.js"></script>' });

export const aboutPageOf = (site) => page(aboutPage, site, { title: 'About IsaFinder' });

export function entityPageOf(card, nearest, site) {
  // Each theory links to its published source page (ruled 2026-08-25).
  const chip = (t) =>
    `<a class="theory-chip" href="${esc(theoryHref(t))}">${esc(t)}</a>`;
  // COPY §8: the section is ABSENT, not empty, on anything that is not a
  // theorem — and no rule makes it so, the column simply has nothing in it for a
  // name-addressed record.  What a constant used to show here, `definedIn` now
  // says in a sentence under Source.
  const constituents = card.constituent_theories ?? [];
  const theories = constituents.length
    ? `<div class="section">`
      + `<span class="section-label">${esc(COPY.constituentTheories)}</span>`
      + `<span class="section-note">${esc(COPY.constituentTheoriesNote)}</span>`
      + `<div class="theory-chips">${constituents.map(chip).join('')}</div></div>`
    : '';
  const list = nearest.length
    ? nearest.map((n) => `<a href="${esc(entityHref(n))}"><span class="name">${esc(displayName(n))}</span>`
        + `<span class="meta"><span class="kind-dot" style="background: ${kindColor(n.kinds[0])}"></span>${esc(KIND_LABEL.get(n.kinds[0]) ?? n.kinds[0])}`
        + (n.theory ? `<span class="sep">·</span><span class="mono">${esc(n.theory)}</span>` : '')
        + `</span></a>`).join('')
    : `<span class="section-note">${esc(COPY.nearestNone)}</span>`;
  return page(entityPage, site, {
    title: `${displayName(card)} — IsaFinder`,
    name: esc(displayName(card)),
    kind: kindBadge(card.kinds[0], true),
    expr: esc(card.expr),
    explanation: explanation(card),
    definedIn: definedIn(card),
    theories,
    source: sourceLink(card, true),
    nearest: list,
  });
}

export const missingPage = (site) => page(
  `<div class="message">${esc(COPY.entityMissing)} <a href="/">${esc(COPY.entityMissingLink)}</a></div>`,
  site, { title: 'IsaFinder' });
