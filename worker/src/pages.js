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
         sourceLink, explanation, THEOREM_ALIKE, COPY } from '../../site/app/public/render.js';

const fill = (template, slots) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => slots[k] ?? '');

/** `site` is what the sentinel row and wrangler vars say: entities, built,
 * release, snapshot — every page prints them. */
export function page(fragment, site, { title, head = '', ...slots }) {
  const common = { ...site, entities: thin(site.entities), title, head };
  return fill(shell, { ...common, main: fill(fragment, { ...common, ...slots }) });
}

export const searchPage = (site) => page(indexPage, site, {
  title: 'Isasearch', head: '<script type="module" src="/app.js"></script>' });

export const aboutPageOf = (site) => page(aboutPage, site, { title: 'About Isasearch' });

export function entityPageOf(card, nearest, site) {
  const thmAlike = THEOREM_ALIKE.has(card.kinds[0]);
  const theories = thmAlike
    ? `<span class="section-note">${esc(COPY.associatedTheoriesNote)}</span>`
      + `<div class="theory-chips">${card.theories.map((t) => `<span class="theory-chip">${esc(t)}</span>`).join('')}</div>`
    : `<div class="theory-chips"><span class="theory-chip">${esc(card.theories[0] ?? '')}</span></div>`;
  const list = nearest.length
    ? nearest.map((n) => `<a href="${esc(entityHref(n))}"><span class="name">${esc(displayName(n))}</span>`
        + `<span class="meta"><span class="kind-dot" style="background: ${kindColor(n.kinds[0])}"></span>${esc(KIND_LABEL.get(n.kinds[0]) ?? n.kinds[0])}`
        + (THEOREM_ALIKE.has(n.kinds[0]) ? '' : `<span class="sep">·</span><span class="mono">${esc(n.theories[0] ?? '')}</span>`)
        + `</span></a>`).join('')
    : `<span class="section-note">${esc(COPY.nearestNone)}</span>`;
  return page(entityPage, site, {
    title: `${displayName(card)} — Isasearch`,
    name: esc(displayName(card)),
    kind: kindBadge(card.kinds[0], true),
    expr: esc(card.expr),
    explanation: explanation(card),
    theories,
    source: sourceLink(card, true),
    nearest: list,
  });
}

export const missingPage = (site) => page(
  `<div class="message">${esc(COPY.entityMissing)} <a href="/">${esc(COPY.entityMissingLink)}</a></div>`,
  site, { title: 'Isasearch' });
