// The search page.  State lives here; markup comes from render.js and the
// fragments in index.html; every string is site/COPY.md's (section named).
import { KINDS, KIND_LABEL, KIND_HOVER, COPY, thin, esc,
         displayName, entityHref, kindBadge, kindColor, sourceLink,
         explanation, similarityText } from '/render.js';

const PAGE = 20;
// The All panel was removed from the interface 2026-08-25 (the API still
// accepts on: 'all'); a condition now names exactly one field.
const PANELS = [['name', 'Entity Name'], ['expr', 'Expression'],
                ['theory', 'Theory Name']];
const PANEL_LABEL = new Map(PANELS);

const state = {
  kinds: new Set(),
  conditions: { name: [], expr: [], theory: [] },   // {polarity, text}
  sent: null,        // the request that produced `response`
  response: null,
  page: 0,
  open: { expl: new Set(), expr: new Set() },
};

const $ = (id) => document.getElementById(id);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---- the condition box's aids (§3.2, ruled 2026-08-26) ------------------------
// Live `\<symbol>` replacement (table: the exported symbols.json; an unknown
// name stays as typed, deliberately with no warning), the newline paste
// handler, and live validation by a WASM build of the SAME Rust regex dialect
// the server matches with — JavaScript's RegExp must never validate: it is a
// different dialect, giving false reds and false greens.  Until the table or
// the validator arrives (or if it never does), typing is unimpeded and the
// Worker's 4xx is the backstop (§5.8).  Abbreviation expansion is retired
// (user-ruled: "完全放弃缩写").
let symbols = new Map();
fetch('/symbols.json').then((r) => r.json()).then((table) => {
  symbols = new Map(Object.entries(table));
}).catch(() => {});

let RRegex = null;
import('/vendor/rregex/rregex.js')
  .then(async (m) => { await m.default(); RRegex = m.RRegex; })
  .catch(() => {});

// A completed `\<name>` becomes its character the moment `>` is typed.
function replaceSymbol(input) {
  const caret = input.selectionStart;
  const before = input.value.slice(0, caret);
  if (!before.endsWith('>')) return;
  const m = /\\<[^<>\\]+>$/.exec(before);
  const symbol = m && symbols.get(m[0]);
  if (!symbol) return;
  const start = caret - m[0].length;
  input.value = input.value.slice(0, start) + symbol + input.value.slice(caret);
  input.setSelectionRange(start + symbol.length, start + symbol.length);
}

/** The engine's verdict on a pattern: null when valid (or not yet checkable),
 * the engine's own message otherwise (§3.2: the message is rendered verbatim). */
function patternError(text) {
  if (!RRegex || text === '') return null;
  try {
    const compiled = new RRegex(text);
    compiled.free?.();
    return null;
  } catch (e) {
    return String(e.message ?? e);
  }
}

// §5.6, shown inline; also the reason an empty box blocks the search.
const EMPTY_CONDITION =
  'This condition is empty. Write a regular expression, or remove the condition.';

// ---- the Filters panel group (§3) ----------------------------------------------
function renderConditions(panel) {
  const host = document.querySelector(`.conditions[data-panel="${panel}"]`);
  host.replaceChildren();
  state.conditions[panel].forEach((c, i) => {
    const row = el(`<div class="condition">
      <button type="button" class="polarity" data-polarity="${c.polarity}" title="click to switch to ${c.polarity === 'contains' ? 'excludes' : 'contains'}"><span>${c.polarity}</span><span class="swap">⇄</span></button>
      <input class="condition-box" placeholder="a regular expression (Rust regex syntax)" title="The condition is a regular expression, matched against the text as shown. Isabelle's \\<symbol> forms are understood; abbreviations such as ==> are not — paste the symbol itself instead." autocomplete="off" spellcheck="false">
      <button type="button" class="remove" title="remove condition">&times;</button>
    </div>`);
    const input = row.querySelector('input');
    input.value = c.text;
    const errorLine = el('<div class="condition-error" hidden></div>');
    const setError = (text) => {
      c.error = text || null;
      input.classList.toggle('invalid', Boolean(text));
      errorLine.textContent = text ?? '';
      // The engine's multi-line messages keep their caret art (§3.2: the
      // engine's own message); the one-line prose strings are unaffected.
      errorLine.classList.toggle('engine', Boolean(text && text.includes('\n')));
      errorLine.hidden = !text;
    };
    input.addEventListener('input', () => {
      replaceSymbol(input);
      c.text = input.value;
      setError(patternError(c.text));
      refreshFilters();
    });
    input.addEventListener('paste', (e) => {
      const pasted = e.clipboardData?.getData('text/plain') ?? '';
      if (!/[\r\n]/.test(pasted)) return;
      // §3.2: the box cannot hold a line break while `expr` holds real ones,
      // so a whitespace run containing one becomes \s+ — without this a
      // pasted two-line statement silently matches nothing.
      e.preventDefault();
      const cooked = pasted.replace(/\s+/g, (run) => /[\r\n]/.test(run) ? '\\s+' : run);
      const { selectionStart: from, selectionEnd: to } = input;
      input.value = input.value.slice(0, from) + cooked + input.value.slice(to);
      input.setSelectionRange(from + cooked.length, from + cooked.length);
      input.dispatchEvent(new Event('input'));
    });
    row.querySelector('.polarity').addEventListener('click', () => {
      c.polarity = c.polarity === 'contains' ? 'excludes' : 'contains'; renderConditions(panel); refreshFilters();
    });
    row.querySelector('.remove').addEventListener('click', () => {
      state.conditions[panel].splice(i, 1); renderConditions(panel); refreshFilters();
    });
    host.append(row, errorLine);
    if (c.error) setError(c.error);
  });
  const add = el('<button type="button" class="add-condition">+ add condition</button>');   // §3.2
  add.addEventListener('click', () => {
    state.conditions[panel].push({ polarity: 'contains', text: '' });
    renderConditions(panel);
    host.querySelector('.condition:last-of-type input').focus();
  });
  host.append(add);
}

function renderKinds() {
  const host = $('kinds');
  host.replaceChildren(...KINDS.map((k) => {
    const b = el(`<button type="button" class="kind-button" aria-pressed="${state.kinds.has(k)}"${KIND_HOVER.has(k) ? ` title="${esc(KIND_HOVER.get(k))}"` : ''}><span class="kind-dot" style="background: ${kindColor(k)}"></span>${esc(KIND_LABEL.get(k))}</button>`);
    b.addEventListener('click', () => { state.kinds.has(k) ? state.kinds.delete(k) : state.kinds.add(k); renderKinds(); refreshFilters(); });
    return b;
  }));
}

// Every box, the empty ones included: an empty box is flagged at search time
// (§5.6), never silently dropped, and whitespace-only text is a legal pattern.
const activeConditions = () => PANELS.flatMap(([p]) =>
  state.conditions[p].map((c) => ({ on: p, polarity: c.polarity, text: c.text })));

// §3: the collapsed summary — the two parts appear independently.
function refreshFilters() {
  const n = activeConditions().filter((c) => c.text !== '').length;
  const parts = [];
  if (n) parts.push(`${n} ${n === 1 ? 'condition' : 'conditions'}`);
  if (state.kinds.size) parts.push(`${state.kinds.size} of 11 kinds`);
  $('filters-summary').textContent = parts.join(' · ');
  // §3.4's caveat, and the rule that decided when to show it, were deleted
  // 2026-08-26: a Theory Name condition means one thing for every kind now.
}

function setFiltersOpen(open) {
  $('filters').dataset.open = String(open);
  $('filters-body').hidden = !open;
  $('filters-foot').hidden = !open;
  $('filters-bar').querySelector('.caret').innerHTML = open ? '&#9662;' : '&#9656;';
}

function initFilters() {
  for (const [p] of PANELS) renderConditions(p);
  renderKinds();
  $('filters-bar').addEventListener('click', () => setFiltersOpen($('filters').dataset.open !== 'true'));
  $('clear-all').addEventListener('click', () => {
    for (const [p] of PANELS) state.conditions[p] = [];
    state.kinds.clear();
    for (const [p] of PANELS) renderConditions(p);
    renderKinds(); refreshFilters();
  });
  moveShared('home');
  refreshFilters();
}

// ---- searching (§6, §7) ----------------------------------------------------------
async function search(query, { fromAddress = false } = {}) {
  query = query.trim();
  if (!query) { showMessage('Enter a query. The syntactic filters only narrow the results; they cannot search by themselves.'); return; }   // §5.7
  // §3.2 / §5.6: a search carrying an empty or invalid pattern is blocked
  // client-side, each offending box flagged inline.
  let blocked = false;
  for (const [p] of PANELS) {
    for (const c of state.conditions[p]) {
      const error = c.text === '' ? EMPTY_CONDITION : patternError(c.text);
      if (error) { c.error = error; blocked = true; }
    }
  }
  if (blocked) {
    for (const [p] of PANELS) renderConditions(p);
    setFiltersOpen(true); clearResults(); return;
  }
  const body = { query, kinds: [...state.kinds], conditions: activeConditions() };
  if (!fromAddress) {
    const url = `/?q=${encodeURIComponent(query)}`;
    if (url !== location.pathname + location.search) history.pushState(null, '', url);
  }
  enterResults(query);
  showMessage('Searching…');
  let resp, data;
  try {
    resp = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    data = await resp.json();
  } catch {
    showMessage(resp ? 'The search did not finish. Try again. If it continues to fail, the problem is with the site and not with your query.' : 'No connection to the site.');
    return;
  }
  if (!resp.ok) { showError(data?.error ?? {}, body); return; }
  state.sent = body; state.response = data; state.page = 0;
  state.open.expl.clear(); state.open.expr.clear();
  renderResults();
}

// §7 and §6 — one message per error code.
function showError(error, body) {
  const text = {
    burst_limit: 'Too many searches from your network. Wait a few seconds and try again.',
    daily_limit: 'Your network has reached the limit of 1 000 searches for today. You can search again after 00:00 UTC. Turning a page of results does not count. This limit counts every search from an address, so an address shared by many people reaches it faster than one used by a single person.',
    query_too_long: 'The text in the search box is too long. The limit is 8 000 characters.',
    condition_too_long: 'This condition is too long. The limit is 512 characters.',
    query_missing: 'Enter a query. The syntactic filters only narrow the results; they cannot search by themselves.',
    // §5.8: the Worker's dialect backstop — the client validator saw the
    // pattern first, so reaching this means the two dialects drifted.
    regex_rejected: `This regular expression was rejected: ${error.message ?? ''}.`,
    // §6: for a timed-out regex condition the query is the cause and the
    // visitor has the remedy — never the site-fault sentence.
    regex_timeout: 'The search took too long. This pattern has to be checked against every entity; make it more specific.',
  }[error.code];
  if (error.code === 'condition_empty' || error.code === 'condition_too_long') {
    // §5.6 / §7: under the condition itself.
    const sent = body.conditions[error.index];
    const c = sent && state.conditions[sent.on].find((x) => x.text === sent.text && x.polarity === sent.polarity);
    if (c) {
      c.error = error.code === 'condition_empty'
        ? 'This condition is empty. Write a regular expression, or remove the condition.'
        : text;
      renderConditions(sent.on); setFiltersOpen(true); clearResults(); return;
    }
  }
  showMessage(text ?? 'The search did not finish. Try again. If it continues to fail, the problem is with the site and not with your query.');
}

// The panel group and the message element live in exactly one copy each; both
// states borrow them.  A message raised on the landing page (§5.7) must be
// visible there, so it moves with the state.
function moveShared(where) {
  for (const [id, home] of [['filters', `filters-${where}`], ['message', `message-${where}`]]) {
    if ($(id).parentElement !== $(home)) $(home).append($(id));
  }
}

function leaveResults() {
  $('landing').hidden = false;
  $('results').hidden = true;
  $('header-search').hidden = true;
  if ($('filters').parentElement !== $('filters-home')) setFiltersOpen(false);   // §2: collapsed on the landing page
  moveShared('home');
  $('message').hidden = true;      // leaving the results never carries a message back
}

function enterResults(query) {
  $('landing').hidden = true;
  $('results').hidden = false;
  $('header-search').hidden = false;
  $('q-header').value = query;
  if ($('filters').parentElement !== $('filters-results')) setFiltersOpen(false);
  moveShared('results');
}

function clearResults() {
  for (const id of ['list', 'empty']) $(id).replaceChildren();
  for (const id of ['status-line', 'pager', 'list-end']) $(id).hidden = true;
}

function showMessage(text) {
  clearResults();
  $('message').textContent = text; $('message').hidden = false;
}

// ---- results (§4) ------------------------------------------------------------------
function renderResults() {
  const { results, complete } = state.response;
  clearResults(); $('message').hidden = true;
  if (!results.length) { renderEmpty(); return; }
  const start = state.page * PAGE, end = Math.min(start + PAGE, results.length);
  $('status-line').hidden = false;
  $('status').textContent = results.length <= PAGE
    ? `Showing all ${thin(results.length)} results` : `Showing results ${start + 1} to ${end}`;   // §4.5
  $('list').replaceChildren(...results.slice(start, end).map((card, i) => renderCard(card, start + i)));
  const pager = $('pager'); pager.replaceChildren();
  if (results.length > PAGE) {
    pager.hidden = false;
    const pages = Math.ceil(results.length / PAGE);
    const turn = (to) => () => { state.page = to; renderResults(); window.scrollTo(0, 0); };
    // The buttons alone never say where you are; the middle does, and it holds
    // the row's shape whether or not both buttons exist.
    pager.append(state.page > 0
      ? button('previous 20', turn(state.page - 1))
      : el('<span class="pager-gap"></span>'));
    pager.append(el(`<span class="pager-where">${thin(start + 1)}&ndash;${thin(end)} of ${thin(results.length)}`
      + `<span class="pager-page">page ${state.page + 1} of ${pages}</span></span>`));
    pager.append(end < results.length
      ? button('next 20', turn(state.page + 1))
      : el('<span class="pager-gap"></span>'));
  }
  if (end === results.length) {   // §4.5, at the end of the results
    $('list-end').hidden = false;
    // §4.5.  `complete` is the Worker's `count === rows` — a proven fact, the
    // count exists because every search computes it to choose its rank mode
    // (§6.3c).  The printed number stays the card count.
    $('list-end').textContent = complete
      ? `These are all ${thin(results.length)} entities that satisfy your conditions.`
      : `Isasearch returned the ${thin(results.length)} most relevant entities for this search. Others also satisfy your conditions but were not returned. If what you are looking for is not among them, add a condition to narrow the search.`;
  }
}

const button = (label, onClick, cls = '') => {
  const b = el(`<button type="button"${cls ? ` class="${cls}"` : ''}>${esc(label)}</button>`);
  b.addEventListener('click', onClick); return b;
};

const isLong = (expr) => expr.length > 400 || (expr.match(/\n/g) ?? []).length >= 4;

function renderCard(card, index) {
  const key = card.id ?? String(index);
  const long = isLong(card.expr);
  const exprOpen = state.open.expr.has(key), explOpen = state.open.expl.has(key);
  const node = el(`<article class="card">
    <div class="card-main">
      <div class="card-head">
        <a class="card-name" href="${esc(entityHref(card))}">${esc(displayName(card))}</a>
        <div class="card-kinds">${card.kinds.map((k) => kindBadge(k)).join('')}</div>
        <div class="card-source">${sourceLink(card)}</div>
        <div class="card-score" title="Cosine similarity between your query and this entity">${esc(similarityText(card))}</div>
      </div>
      <div class="expr-wrap" data-clipped="${long && !exprOpen}"><pre class="expr">${esc(card.expr)}</pre></div>
      ${long ? `<button type="button" class="small-button expr-toggle">${esc(exprOpen ? COPY.collapseExpr : COPY.showAll(card.expr.length))}</button>` : ''}
      <button type="button" class="expl-toggle">${explOpen ? '&#9662; explanation &mdash; machine-generated' : '&#9656; explanation'}</button>
      ${explOpen ? `<div class="expl">${explanation(card)}</div>` : ''}
    </div>
  </article>`);
  const toggle = (set) => { set.has(key) ? set.delete(key) : set.add(key); renderResults(); };
  node.querySelector('.expr-toggle')?.addEventListener('click', () => toggle(state.open.expr));
  node.querySelector('.expl-toggle').addEventListener('click', () => toggle(state.open.expl));
  return node;
}

function removeAndSearch(sent) {
  const list = state.conditions[sent.on];
  const i = list.findIndex((x) => x.text === sent.text && x.polarity === sent.polarity);
  if (i >= 0) list.splice(i, 1);
  renderConditions(sent.on); refreshFilters();
  search(state.sent.query);
}

// ---- empty states (§5) -------------------------------------------------------------
function renderEmpty() {
  const sent = state.sent.conditions;
  const kindsLine = state.sent.kinds.length
    ? `<p>${state.sent.kinds.length} of the 11 kinds are selected, and that also restricts the results.</p>` : '';   // §5.2
  let html, actions = [];
  if (sent.length === 0) {                                                           // §5.4
    html = `<div class="empty-box"><p>No entity of the kinds you selected is eligible. Selecting more kinds returns more results; clearing the selection removes the kind restriction entirely.</p></div>`;
  } else if (sent.length === 1) {                                                    // §5.1 / §5.3
    const c = sent[0];
    const body = c.polarity === 'excludes'
      // §5.1's inversion — the pattern is too broad, not mis-escaped.
      ? `<p>Every entity that satisfies your other conditions matches this pattern, so none is left. Make the exclusion narrower, or remove it.</p>`
      : c.on === 'expr'
      // §5.1: the escaping reminder is the bite point — Isabelle text is full
      // of regex metacharacters, and an unescaped + silently empties the result.
      ? `<p>The pattern is matched against the entity's text exactly as the site displays it. Characters that are regular-expression syntax — <code>+ * ( ) [ ] { } | . ? ^ $ \\</code> — must be backslash-escaped to be matched as text.</p>`
      // §5.3
      : `<p>The pattern is matched against the text as displayed. Check the spelling, escape regular-expression syntax meant as text, or remove the condition.</p>`;
    html = `<div class="empty-box">
      <p><code>${esc(PANEL_LABEL.get(c.on))} ${c.polarity} ${esc(c.text)}</code></p>
      ${body}
    </div>`;
    actions = [['Remove this condition and search again', () => removeAndSearch(c)]];
  } else {                                                                            // §5.2
    // The list prints the relation, not the toggle — "contains" misreads for
    // anchored patterns like ^List\. — while the controls keep D22's labels.
    html = `<div class="empty-box">
      <p>A result must satisfy every condition. These are active:</p>
      <ul class="empty-list">${sent.map((c, i) => `<li>${esc(PANEL_LABEL.get(c.on))} ${c.polarity === 'contains' ? 'matches' : 'does not match'} <code>${esc(c.text)}</code> <button type="button" data-i="${i}">remove</button></li>`).join('')}</ul>
      <p>Try removing one. Your query is not the cause: the conditions decide which entities are eligible, and none is. The query only puts eligible entities in order.</p>
      ${kindsLine}
    </div>`;
  }
  const title = sent.length === 0 ? ''
    : sent.length === 1
      ? (sent[0].polarity === 'excludes' ? 'Everything left matches this exclusion' : 'Nothing satisfies this condition')
      : 'No entity satisfies all of these conditions';
  const node = el(`<div class="empty"><div class="empty-col">
    ${title ? `<div class="empty-title"><span class="count">0 results</span><span class="text">${esc(title)}</span></div>` : ''}
    ${html}
  </div></div>`);
  node.querySelectorAll('.empty-list button').forEach((b) => b.addEventListener('click', () => removeAndSearch(sent[Number(b.dataset.i)])));
  const box = node.querySelector('.empty-actions') ?? node.querySelector('.empty-box');
  for (const [label, fn] of actions) box.append(button(label, fn));
  $('empty').append(node);
}

// ---- boot --------------------------------------------------------------------------
initFilters();
$('search-form').addEventListener('submit', (e) => { e.preventDefault(); search($('q').value); });
$('header-search').addEventListener('submit', (e) => { e.preventDefault(); search($('q-header').value); });
// The query lives in the address (`/?q=…`, ruled 2026-08-25): a search pushes
// it there, so the address bar is the share link, and opening such an address
// or moving through history runs the search.  Conditions and kinds are not in
// the address (COPY §10: filters do not persist).
function searchFromAddress() {
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('q').value = q; search(q, { fromAddress: true }); }
  else { leaveResults(); }
}
window.addEventListener('popstate', searchFromAddress);
searchFromAddress();
