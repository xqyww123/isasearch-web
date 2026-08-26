// The isasearch Worker (§12.2 step 5): the search API, the daily gate, and
// /source/* served from the R2 bucket.
//
// The edge 5-per-10-seconds rule (§11.1 layer 1) lives in the Cloudflare zone,
// scoped to /api/search, not here — its rejections never reach this code.
// Layer 3, the global gate, is specified in §11.1 and deliberately not built.

import { embeddingInput } from './kinds.js';
import { compileRequest, tupfQueryBody, tupfCountBody, rowsOf, countOf,
         routeOf, certified, collapse, SearchError, UpstreamError } from './search.js';
import { embedQuery } from './embed.js';
import { DailyGate } from './gate.js';
import { documentIdOf, keyBytesOf } from './blake2b.js';
import { searchPage, aboutPageOf, entityPageOf, missingPage } from './pages.js';
import { thin } from '../../site/app/public/render.js';

export { DailyGate };

const MAX_BODY_BYTES = 256 * 1024;        // attack-surface bound, not a ruled cap

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

const html = (body, status = 200, cacheSeconds = 3600) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8',
               'Cache-Control': `public, max-age=${cacheSeconds}` },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/source' || url.pathname.startsWith('/source/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json(405, { error: { code: 'method_not_allowed' } });
      }
      return serveSource(request, url, env, ctx);
    }
    if (url.pathname === '/api/search') {
      if (request.method !== 'POST') {
        return json(405, { error: { code: 'method_not_allowed' } });
      }
      return search(request, env, ctx);
    }
    // The pages (§9.5).  Static files — /style.css, /app.js, /render.js,
    // /symbols.json, /vendor/* — are served by the assets binding before
    // this runs.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(405, { error: { code: 'method_not_allowed' } });
    }
    if (url.pathname.startsWith('/entity/')) return entity(request, url, env, ctx);
    if (url.pathname === '/about') {
      return html(aboutPageOf({ ...siteOf(env), ...await usageOf(env) }));
    }
    if (url.pathname === '/') return html(searchPage(siteOf(env)));
    return json(404, { error: { code: 'not_found' } });
  },
};

// ---------------------------------------------------------------------------
// /source/* — the published tree, straight off R2 with edge caching.  The
// object key is the URL path minus the leading slash (§17.8), undecoded: no
// published name needs decoding.  The browser TTL is four hours because the
// URLs survive a republish (§8.2 moves the namespace, not the pages), so a
// browser must re-ask within a working day; the zone cache rule, purged on
// republish, carries the long TTL.  HEAD is GET without the body, served from
// the same cache entry.
// ---------------------------------------------------------------------------

// §17.2's published classes, plus the publish report the user ruled public.
const CONTENT_TYPES = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['css', 'text/css; charset=utf-8'],
  ['ttf', 'font/ttf'],
  ['json', 'application/json; charset=utf-8'],
]);

async function serveSource(request, url, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const headOf = (r) => request.method === 'HEAD'
    ? new Response(null, { status: r.status, headers: r.headers }) : r;

  const cached = await cache.match(cacheKey);
  if (cached) return headOf(cached);

  // The bare directory forms land on the generated index (D49 ruling 5).
  const path = (url.pathname === '/source' || url.pathname === '/source/')
    ? '/source/index.html' : url.pathname;
  const object = await env.SOURCE_BUCKET.get(path.slice(1));
  if (object === null) {
    return json(404, { error: { code: 'not_found' } });
  }
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const response = new Response(object.body, {
    headers: {
      'Content-Type': CONTENT_TYPES.get(ext) ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'public, max-age=14400',
      'ETag': object.httpEtag,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return headOf(response);
}

// ---------------------------------------------------------------------------
// /api/search
// ---------------------------------------------------------------------------

/** §6.3c's knobs and the namespace facts, from wrangler [vars]: `ROWS` (the
 * record count the export printed — the 3 % line's denominator; `ENTITIES` is
 * the D5-collapsed display number, never the denominator), `EXACT_FRACTION`
 * (the line itself) and `DEADLINES_MS` (the deadline table, JSON keyed by
 * leg).  A bad value fails every search loudly rather than misrouting
 * silently; RELEASE step 10's probe asserts the deployed values. */
function configOf(env) {
  const cfg = {
    rows: Number(env.ROWS),
    fraction: Number(env.EXACT_FRACTION),
    deadlines: JSON.parse(env.DEADLINES_MS),
  };
  if (!Number.isInteger(cfg.rows) || cfg.rows <= 0 || !(cfg.fraction > 0)) {
    throw new Error(`bad router config: ROWS=${env.ROWS}, EXACT_FRACTION=${env.EXACT_FRACTION}`);
  }
  return cfg;
}

async function search(request, env, ctx) {
  const gate = await dailyGate(request, env);
  if (gate) return gate;

  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) {
    return json(413, { error: { code: 'bad_request' } });
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json(400, { error: { code: 'bad_request' } });
  }

  let compiled;
  try {
    compiled = compileRequest(body);
  } catch (e) {
    if (e instanceof SearchError) {
      return json(400, { error: { code: e.code, ...e.params } });
    }
    throw e;
  }
  const { query, filters, hasRegex } = compiled;

  // §6.3c's per-search state: the single retry, and the one log line.
  const s = { retries: 1, log: { event: 'search', retried: [], performance: [] } };
  const tupfLeg = (name, tupfBody, deadlineMs, retryOnTimeout) =>
    runLeg(s, name, deadlineMs, retryOnTimeout, async (signal) => {
      const data = await tupfPost(env.TPUF_NAMESPACE, tupfBody, env, signal);
      s.log.performance.push({ leg: name, ...(data.performance ?? {}) });
      return data;
    });

  try {
    const cfg = configOf(env);

    // 1. The query embedding and the tree's exact count run concurrently; a
    //    null tree has no count query, and its `count` is the namespace's rows.
    const [vector, count] = await Promise.all([
      runLeg(s, 'embed', cfg.deadlines.embed, true,
             (signal) => embedQuery(embeddingInput(query), env, ctx, signal)),
      filters
        ? tupfLeg('count', tupfCountBody(filters),
                  hasRegex ? cfg.deadlines.count_regex : cfg.deadlines.count,
                  // A regex count's work is deterministic: a timeout there is
                  // not anomalous, and a retry would double the scan.
                  !hasRegex).then(countOf)
        : cfg.rows,
    ]);

    // 2.–4. The route, then one ranked query (plus, on an under-filled ANN
    // result, the one fallback kNN).  `mode` is set at the single point where
    // rows are chosen: kNN rows (and the empty case) are exact; a full ANN
    // result is approximate — fullness is not exactness.
    const route = filters ? routeOf(count, cfg.rows, cfg.fraction) : 'ann';
    s.log.route = route;
    const rankedBody = (mode) =>
      tupfQueryBody({ vector: Array.from(vector), filters, mode });
    const assertCertificate = (leg, got) => {
      const ok = certified(got, count);
      s.log.certificate = ok ? 'ok' : 'violated';
      if (!ok) {
        throw new Error(`certificate violated on ${leg}: `
          + `${got} rows of ${count} matches — never served`);
      }
    };

    let mode = 'exact';
    let rows = [];
    if (route === 'knn') {
      rows = rowsOf(await tupfLeg('knn', rankedBody('kNN'), cfg.deadlines.knn, false));
      assertCertificate('knn', rows.length);
    } else if (route === 'ann') {
      rows = rowsOf(await tupfLeg('ann', rankedBody('ANN'), cfg.deadlines.ann, false));
      if (filters && !certified(rows.length, count)) {
        // Provably incomplete under ANN → redo exactly.  (A null tree cannot
        // fall back — kNN requires a filter — and cannot under-fill either.)
        s.log.fallback = true;
        rows = rowsOf(await tupfLeg('knn_fallback', rankedBody('kNN'),
                                    cfg.deadlines.knn_fallback, false));
        assertCertificate('knn_fallback', rows.length);
      } else {
        s.log.certificate = 'full';   // for ANN, full is all it certifies
        mode = 'approximate';
      }
    }

    const complete = count === rows.length;   // record counts, both (§6.3c)
    Object.assign(s.log, { count, rows: rows.length, mode, complete });
    console.log(JSON.stringify(s.log));
    return json(200, { mode, count, rows: rows.length, complete,
                       results: collapse(rows) });
  } catch (e) {
    s.log.error = `${e.leg ?? 'worker'}: ${String(e).slice(0, 300)}`;
    console.log(JSON.stringify(s.log));
    return errorResponse(e, hasRegex);
  }
}

// ---------------------------------------------------------------------------
// §6.3c's legs.  Every backend request runs under the deadline table, and its
// retry rule is decided before it is sent: a timeout is retried only where a
// timeout would be anomalous (the ≤ 8 s legs); a transport error or a 5xx is
// retried on any leg; a 4xx never is.  At most one retry per search.
// ---------------------------------------------------------------------------

async function runLeg(s, name, deadlineMs, retryOnTimeout, send) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send(AbortSignal.timeout(deadlineMs));
    } catch (e) {
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      const retriable = timedOut
        ? retryOnTimeout
        : !(e instanceof UpstreamError && e.status < 500);
      if (attempt > 0 || s.retries === 0 || !retriable) {
        e.leg = name;
        e.timedOut = timedOut;
        throw e;
      }
      s.retries -= 1;
      s.log.retried.push({ leg: name, error: String(e).slice(0, 200) });
    }
  }
}

// §6.3c's error mapping.  A turbopuffer 4xx on a search carrying a regex
// condition is the dialect backstop (the client validated first): the engine's
// message travels verbatim for COPY §5.8.  A timed-out count or ranking leg on
// such a search is the visitor's to fix (`regex_timeout`, COPY §6's own
// sentence).  Everything else is the site's fault (`upstream`, COPY §6).
const TUPF_LEGS = new Set(['count', 'ann', 'knn', 'knn_fallback']);

function errorResponse(e, hasRegex) {
  if (e instanceof UpstreamError && e.status < 500 && TUPF_LEGS.has(e.leg)) {
    return hasRegex
      ? json(400, { error: { code: 'regex_rejected', message: engineMessageOf(e.body) } })
      : json(400, { error: { code: 'bad_request' } });
  }
  if (e.timedOut && hasRegex && TUPF_LEGS.has(e.leg)) {
    return json(504, { error: { code: 'regex_timeout' } });
  }
  return json(502, { error: { code: 'upstream' } });
}

/** The engine's own line out of turbopuffer's 400 body (measured 2026-08-26:
 * one clean line naming the column but never the pattern — attribution is the
 * client validator's job; the backstop renders page-level via COPY §5.8). */
function engineMessageOf(body) {
  try { return String(JSON.parse(body).error ?? body); } catch { return String(body); }
}

async function tupfPost(namespace, body, env, signal) {
  const resp = await fetch(
    `https://${env.TPUF_REGION}.turbopuffer.com/v2/namespaces/${namespace}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.TURBOPUFFER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  if (!resp.ok) {
    throw new UpstreamError(`turbopuffer ${namespace}`, resp.status, await resp.text());
  }
  return resp.json();
}

const tupfQuery = (body, env) => tupfPost(env.TPUF_NAMESPACE, body, env);

/** What every page prints: the entity count and build date from wrangler
 * [vars] — the export prints them, RELEASE step 8 pastes them beside
 * `TPUF_NAMESPACE` in the same commit, and step 10's probe asserts the
 * deployed pages match (the sentinel namespace this used to read was deleted
 * 2026-08-26, §8.2: a page render makes no upstream request) — the release
 * and snapshot the namespace name carries (§8.2's shape,
 * `isasearch-<release>-<snapshot>`), and the embedding model, read from the
 * deployed var and never written into a page, so the about page cannot claim
 * a model the Worker does not call. */
function siteOf(env) {
  const m = /^isasearch-(.+)-afp-(\d{4}-\d{2}-\d{2})/.exec(env.TPUF_NAMESPACE) ?? [];
  return {
    entities: Number(env.ENTITIES) || 0, built: env.BUILT ?? '',
    release: m[1] ?? '', snapshot: m[2] ?? '',
    model: env.FIREWORKS_MODEL ?? '',
  };
}

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// §11.1 layer 2 — the per-address daily counter, in the DailyGate Durable
// Object.  The address is hashed under a fixed secret salt before it leaves
// this function; the country and network number ride along for the usage
// statistics the same table keeps.
// ---------------------------------------------------------------------------

async function dailyGate(request, env) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipHash = (await sha256hex(`${env.IP_HASH_SALT}|${ip}`)).slice(0, 32);
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const gate = gateStub(env);
  const { allowed } = await gate.admit({
    day, ipHash, country: request.cf?.country, asn: request.cf?.asn });
  if (allowed) return null;
  const retryAfter = secondsToUtcMidnight(now);
  console.log(JSON.stringify({ event: '429', layer: 'daily', day, ipHash }));
  return json(429,
    { error: { code: 'daily_limit', layer: 'daily', retry_after: retryAfter } },
    { 'Retry-After': String(retryAfter) });
}

/** The one gate object.  D18: its home is fixed by its first access, so it is
 * created under a North-America hint rather than wherever the first visitor
 * was, and the name carries the region so that a wrongly-homed object cannot be
 * reused by accident (the first `site` object was homed in Singapore). */
const gateStub = (env) =>
  env.DAILY_GATE.get(env.DAILY_GATE.idFromName('site-wnam'), { locationHint: 'wnam' });

/** The two numbers the about page prints (ruled 2026-08-25: searches only, no
 * count of people — that would need addresses kept beyond the two days §14
 * promises).  A failure here must not cost the page: the about page is worth
 * more than its statistics, so both fall back to an em dash. */
const RECENT_DAYS = 30;

async function usageOf(env) {
  try {
    const since = new Date(Date.now() - (RECENT_DAYS - 1) * 86400000)
      .toISOString().slice(0, 10);
    const { total, recent } = await gateStub(env).usage({ sinceDay: since });
    return { searches_total: thin(total), searches_recent: thin(recent) };
  } catch (e) {
    console.log(JSON.stringify({ event: 'usage_unavailable', message: String(e) }));
    return { searches_total: '—', searches_recent: '—' };
  }
}

function secondsToUtcMidnight(now) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                            now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// /entity/<universal key, base64url> — one page per record (D9 as amended
// 2026-08-25).  The key becomes the document id (§6.2) and the row is fetched
// by primary key; the ten nearest come from the row's own vector (§9.4).
// Cached like /source/*: a page is immutable within a namespace.
// ---------------------------------------------------------------------------

const ENTITY_ATTRIBUTES = [
  'key', 'name', 'expr', 'theory', 'constituent_theories', 'kind', 'position',
  'source_link', 'from_collection', 'interpretation',
];

async function entity(request, url, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let id;
  try {
    const bytes = keyBytesOf(url.pathname.slice('/entity/'.length));
    if (bytes.length < 17 || bytes.length > 512) throw new Error('key length');
    id = documentIdOf(bytes);
  } catch {
    return json(404, { error: { code: 'not_found' } });
  }
  let site, row, nearest;
  try {
    site = await siteOf(env);
    row = (await tupfQuery({
      rank_by: ['id', 'asc'], top_k: 1, filters: ['id', 'Eq', id],
      include_attributes: [...ENTITY_ATTRIBUTES, 'vector'],
    }, env)).rows?.[0];
    if (row) {
      nearest = rowsOf(await tupfQuery({ queries: [{
        rank_by: ['vector', 'ANN', row.vector], top_k: 12,
        filters: ['id', 'NotEq', id], include_attributes: ENTITY_ATTRIBUTES,
      }] }, env));
    }
  } catch (e) {
    console.log(JSON.stringify({ event: 'upstream_error', message: String(e) }));
    return json(502, { error: { code: 'upstream' } });
  }
  if (!row) return html(missingPage(site), 404, 300);
  const [card] = collapse([row]);
  const response = html(entityPageOf(card, collapse(nearest).slice(0, 10), site), 200, 14400);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
