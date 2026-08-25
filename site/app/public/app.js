// The search page.  State lives here; markup comes from render.js and the
// fragments in index.html; every string is site/COPY.md's (section named).
import { KINDS, KIND_LABEL, KIND_HOVER, THEOREM_ALIKE, COPY, thin, esc,
         displayName, entityHref, kindBadge, kindColor, sourceLink, theoryLine,
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

// ---- abbreviations (§9.3): replaced in the condition box while typing ---------
let abbrevs = new Map();
fetch('/abbrevs.json').then((r) => r.json()).then((table) => {
  abbrevs = new Map(Object.entries(table).sort((a, b) => b[0].length - a[0].length));
}).catch(() => {});

function replaceAbbrev(input) {
  const caret = input.selectionStart;
  const before = input.value.slice(0, caret);
  for (const [abbrev, symbol] of abbrevs) {
    if (before.endsWith(abbrev)) {
      const start = caret - abbrev.length;
      input.value = input.value.slice(0, start) + symbol + input.value.slice(caret);
      input.setSelectionRange(start + symbol.length, start + symbol.length);
      return;
    }
  }
}

// ---- the Filters panel group (§3) ----------------------------------------------
function renderConditions(panel) {
  const host = document.querySelector(`.conditions[data-panel="${panel}"]`);
  host.replaceChildren();
  state.conditions[panel].forEach((c, i) => {
    const row = el(`<div class="condition">
      <button type="button" class="polarity" data-polarity="${c.polarity}" title="click to switch to ${c.polarity === 'contains' ? 'excludes' : 'contains'}"><span>${c.polarity}</span><span class="swap">⇄</span></button>
      <input class="condition-box" autocomplete="off" spellcheck="false">
      <button type="button" class="remove" title="remove condition">&times;</button>
    </div>`);
    const input = row.querySelector('input');
    input.value = c.text;
    input.addEventListener('input', () => { replaceAbbrev(input); c.text = input.value; c.error = null; refreshFilters(); });
    row.querySelector('.polarity').addEventListener('click', () => {
      c.polarity = c.polarity === 'contains' ? 'excludes' : 'contains'; renderConditions(panel); refreshFilters();
    });
    row.querySelector('.remove').addEventListener('click', () => {
      state.conditions[panel].splice(i, 1); renderConditions(panel); refreshFilters();
    });
    host.append(row);
    if (c.error) host.append(el(`<div class="condition-error">${esc(c.error)}</div>`));
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

const activeConditions = () => PANELS.flatMap(([p]) =>
  state.conditions[p].filter((c) => c.text.trim()).map((c) => ({ on: p, polarity: c.polarity, text: c.text })));

// §3: the collapsed summary — the two parts appear independently.
function refreshFilters() {
  const n = activeConditions().length;
  const parts = [];
  if (n) parts.push(`${n} ${n === 1 ? 'condition' : 'conditions'}`);
  if (state.kinds.size) parts.push(`${state.kinds.size} of 11 kinds`);
  $('filters-summary').textContent = parts.join(' · ');
  // §3.4: Theorem or a derived rule in play (an empty selection is every kind)
  // AND a condition reaching Theory Name, directly or through All.
  const thmAlike = state.kinds.size === 0 || [...state.kinds].some((k) => THEOREM_ALIKE.has(k));
  const reaches = state.conditions.theory.some((c) => c.text.trim());
  const show = thmAlike && reaches;
  $('theory-caveat').hidden = !show;
  $('theory-caveat-spacer').hidden = !show;
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
  }[error.code];
  if (error.code === 'condition_empty' || error.code === 'condition_too_long') {
    // §5.6 / §7: under the condition itself.
    const sent = body.conditions[error.index];
    const c = sent && state.conditions[sent.on].find((x) => x.text === sent.text && x.polarity === sent.polarity);
    if (c) {
      c.error = error.code === 'condition_empty'
        ? 'Nothing in this condition can be matched. `_`, `.`, the question mark and the subscript and superscript marks divide a name into parts and are not matched themselves, so a condition made only of them has no text remaining. Add a name or an operator, or remove the condition.'
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
  const { results, limit_reached } = state.response;
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
    // §4.5.  `limit_reached` is "the retrieval came back full" (200 rows), which
    // is why the capped sentence says others exist rather than proving it.
    $('list-end').textContent = limit_reached
      ? `Isasearch returned the ${thin(results.length)} most relevant entities for this search. Others also satisfy your conditions but were not returned. If what you are looking for is not among them, add a condition to narrow the search.`
      : `These are all ${thin(results.length)} entities that satisfy your conditions.`;
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
      ${theoryLine(card)}
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
  const sent = state.sent.conditions, parts = state.response.parts;
  const kindsLine = state.sent.kinds.length
    ? `<p>${state.sent.kinds.length} of the 11 kinds are selected, and that also restricts the results.</p>` : '';   // §5.2
  let html, actions = [];
  if (sent.length === 0) {                                                           // §5.4
    html = `<div class="empty-box"><p>No entity of the kinds you selected is eligible. Selecting more kinds returns more results; clearing the selection removes the kind restriction entirely.</p></div>`;
  } else if (sent.length === 1 && sent[0].on === 'expr') {                           // §5.1
    const c = sent[0], p = parts[0];
    const yours = c.polarity === 'contains'
      ? `<div class="empty-cell"><span class="label label-your">Your condition</span><pre>${esc(c.text)}</pre><span>Isasearch removes the question marks — from your condition and from the text it searches — and then looks for ${p.length} ${p.length === 1 ? 'part' : 'parts'}, one directly after another, in this order: <code>${p.map(esc).join('</code> <code>')}</code></span></div>`
      : `<div class="empty-cell"><span class="label label-your">Your condition</span><pre>excludes ${esc(c.text)}</pre><span>Every entity that satisfies your other conditions contains it, so none is left.</span></div>`;
    const why = c.polarity === 'contains'
      ? `<div class="empty-cell"><span class="label label-why">Why this usually happens</span><p>A condition fixes the variable names, but a statement is displayed with the variable names that its own author chose. <code>?n + ?m = ?m + ?n</code> finds nothing, even though the theorem that it describes is in the index: <code>Groups.ab_semigroup_add_class.add.commute</code> is printed as <code>?a + ?b = ?b + ?a</code>. The variable names are the only difference.</p></div>`
      : `<div class="empty-cell"><span class="label label-why">Why this usually happens</span><p>Operators are common. <code>⟹</code> alone appears in 45 % of all statements, and your other conditions have already narrowed the results to a set in which every remaining entity uses it.</p></div>`;
    const instead = c.polarity === 'contains'
      ? `Describe the statement in the search box — <em>addition is commutative</em> — and use an Expression condition only for a name that must appear, such as <code>sorted_wrt</code> or <code>continuous_on</code>.`
      : `Exclude a name rather than an operator. Excluding an operator removes a large part of the index at once, and it cannot be undone by the search box: the query orders results, it cannot remove them.`;
    html = `<div class="empty-box">
      ${c.polarity === 'contains' ? '<p>An <strong>Expression</strong> condition matches text, not patterns. It has no variables: <code>?n</code> searches for the name <code>n</code>.</p>' : ''}
      <div class="empty-grid">${yours}${why}</div>
      <div class="empty-actions"><span class="lead">What to do instead</span><span>${instead}</span></div>
    </div>${REFERENCE}`;
    actions = [['Remove this condition and search again', () => removeAndSearch(c)]];
  } else if (sent.length === 1) {                                                    // §5.3
    const c = sent[0];
    html = `<div class="empty-box">
      <p><code>${esc(PANEL_LABEL.get(c.on))} ${c.polarity} ${esc(c.text)}</code></p>
      <p>A condition matches whole parts of a name, in the order you typed them, and upper and lower case are different. Check the spelling and the capitals. If you are unsure of the whole name, type <strong>fewer parts</strong> of it — <code>Path</code> rather than <code>Path_Connectd</code>. Typing a shorter piece of one part does not help, because only whole parts are matched.</p>
    </div>`;
    actions = [['Remove this condition and search again', () => removeAndSearch(c)]];
  } else {                                                                            // §5.2
    html = `<div class="empty-box">
      <p>A result must satisfy every condition. These are active:</p>
      <ul class="empty-list">${sent.map((c, i) => `<li>${esc(PANEL_LABEL.get(c.on))} ${c.polarity} <code>${esc(c.text)}</code> <button type="button" data-i="${i}">remove</button></li>`).join('')}</ul>
      <p>Try removing one. Your query is not the cause: the conditions decide which entities are eligible, and none is. The query only puts eligible entities in order.</p>
      ${kindsLine}
    </div>`;
  }
  const title = sent.length === 0 ? ''
    : sent.length === 1 && sent[0].on === 'expr'
      ? (sent[0].polarity === 'contains' ? 'Nothing contains that text' : 'Everything that remains contains that text')
      : sent.length === 1 ? 'Nothing satisfies this condition' : 'No entity satisfies all of these conditions';
  const node = el(`<div class="empty"><div class="empty-col">
    ${title ? `<div class="empty-title"><span class="count">0 results</span><span class="text">${esc(title)}</span></div>` : ''}
    ${html}
  </div></div>`);
  node.querySelectorAll('.empty-list button').forEach((b) => b.addEventListener('click', () => removeAndSearch(sent[Number(b.dataset.i)])));
  const box = node.querySelector('.empty-actions') ?? node.querySelector('.empty-box');
  for (const [label, fn] of actions) box.append(button(label, fn));
  $('empty').append(node);
}

// §5.1's reference block, on both variants.
const REFERENCE = `<div class="reference">
  <span class="label">What an Expression condition matches</span>
  <ul>
    <li class="yes"><span>Names and operators, as the card displays them: <code>continuous_on</code>, <code>sorted_wrt</code>, <code>⟦</code></span></li>
    <li class="no"><span>Patterns of any kind. <strong>These are not rejected — they are reduced</strong>, which is worse, because the search then succeeds and returns the wrong entities:
      <ul>
        <li><code>_</code> and <code>.</code> are separators, so <code>_ + _</code> becomes the single part <code>+</code> and matches every statement that contains a plus sign;</li>
        <li><code>.*</code> becomes <code>*</code> and matches a literal multiplication sign;</li>
        <li><code>cont*</code> loses nothing, but it is read as the two parts <code>cont</code> <code>*</code>, which almost nothing contains: a star is an ordinary character here, not a wildcard.</li>
      </ul></span></li>
    <li class="yes"><span>Whole parts of a name, in the order you typed them: <code>sorted</code> matches <code>sorted_wrt</code>; <code>sort</code> matches nothing, because only whole parts are matched, never a fragment of one</span></li>
    <li class="no"><span>Question marks, <code>_</code>, <code>.</code> and the subscript and superscript marks are separators and are never matched themselves. A subscripted name such as <code>f⇩1</code> is therefore found by <code>f</code>, and <strong>not</strong> by <code>f1</code>.</span></li>
    <li class="yes"><span>Isabelle's ASCII form, for every symbol that Isabelle displays as a character: <code>\\&lt;Longrightarrow&gt;</code> is understood as <code>⟹</code>. Abbreviations such as <code>==&gt;</code> are converted inside the condition box while you type; an abbreviation that has more than one meaning is not converted, so type the <code>\\&lt;…&gt;</code> form for those. A few markup escapes, such as <code>\\&lt;^named_theorems&gt;</code>, have no character of their own and are matched exactly as you typed them.</span></li>
  </ul>
  <div class="reference-foot">To search by the structure of a term, use Isabelle: <code>find_theorems</code> and <code>find_consts</code> search structurally inside a session. The search box here ranks by meaning, not by shape, so describing the term will find related statements but cannot match a pattern.</div>
</div>`;

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
