// The isasearch Worker (§12.2 step 5): the search API, the daily gate, and
// /source/* served from the R2 bucket.
//
// The edge 5-per-10-seconds rule (§11.1 layer 1) lives in the Cloudflare zone,
// scoped to /api/search, not here — its rejections never reach this code.
// Layer 3, the global gate, is specified in §11.1 and deliberately not built.

import { Tokenizer } from '../../site/tokenizer/isabelle_tokenizer.js';
import assetText from '../../site/tokenizer/asset.json';
import { embeddingInput } from './kinds.js';
import { compileRequest, tupfQueryBody, rowsOf, collapse, matchedTheories,
         RESULT_LIMIT, SearchError } from './search.js';
import { embedQuery } from './embed.js';
import { DailyGate } from './gate.js';

export { DailyGate };

// asset.json arrives as text (wrangler.toml's rule), so the digest below is the
// SHA-256 of the committed file's bytes — the same number the export records.
const tokenizer = new Tokenizer(JSON.parse(assetText));

const MAX_BODY_BYTES = 256 * 1024;        // attack-surface bound, not a ruled cap

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
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
    compiled = compileRequest(body, tokenizer);
  } catch (e) {
    if (e instanceof SearchError) {
      return json(400, { error: { code: e.code, ...e.params } });
    }
    throw e;
  }
  const { query, bm25, kinds, filters, theoryParts, parts } = compiled;

  let rows;
  try {
    await assertAssetMatches(env);
    const vector = await embedQuery(embeddingInput(query, kinds), env, ctx);
    rows = rowsOf(await tupfQuery(
      tupfQueryBody({ vector: Array.from(vector), query, filters, bm25 }), env));
  } catch (e) {
    console.log(JSON.stringify({ event: 'upstream_error', message: String(e) }));
    return json(502, { error: { code: 'upstream' } });
  }

  const cards = collapse(rows);
  matchedTheories(cards, theoryParts, tokenizer);

  return json(200, {
    results: cards,
    // §4.5's end-of-list copy branches on whether the fused cap was reached.
    limit_reached: rows.length >= RESULT_LIMIT,
    parts,
  });
}

async function tupfPost(namespace, body, env) {
  const resp = await fetch(
    `https://${env.TPUF_REGION}.turbopuffer.com/v2/namespaces/${namespace}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.TURBOPUFFER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    throw new Error(`turbopuffer ${namespace}: HTTP ${resp.status}: ${detail}`);
  }
  return resp.json();
}

const tupfQuery = (body, env) => tupfPost(env.TPUF_NAMESPACE, body, env);

// ---------------------------------------------------------------------------
// §8.2's asset sentinel (ruled 2026-08-25): the companion namespace
// `<namespace>.asset` holds one row naming the asset digest the index was
// built under.  Read once per instance; a mismatch means this Worker tokenises
// queries by one rule set against an index built by another — the failure
// §5.5 exists to prevent, which is silent in every other respect.
// ---------------------------------------------------------------------------

let assetCheck = null;

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function assertAssetMatches(env) {
  assetCheck ??= (async () => {
    const own = await sha256hex(assetText);
    const rows = (await tupfPost(`${env.TPUF_NAMESPACE}.asset`, {
      rank_by: ['id', 'asc'], top_k: 1, include_attributes: ['digest'],
    }, env)).rows;
    const recorded = rows?.[0]?.digest;
    if (recorded !== own) {
      throw new Error(
        `asset digest mismatch: the index was built under ${recorded ?? 'no recorded '
        }digest, this Worker carries ${own}`);
    }
  })().catch((e) => { assetCheck = null; throw e; });
  return assetCheck;
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
  const gate = env.DAILY_GATE.get(env.DAILY_GATE.idFromName('site'));
  const { allowed } = await gate.admit({
    day, ipHash, country: request.cf?.country, asn: request.cf?.asn });
  if (allowed) return null;
  const retryAfter = secondsToUtcMidnight(now);
  console.log(JSON.stringify({ event: '429', layer: 'daily', day, ipHash }));
  return json(429,
    { error: { code: 'daily_limit', layer: 'daily', retry_after: retryAfter } },
    { 'Retry-After': String(retryAfter) });
}

function secondsToUtcMidnight(now) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                            now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}
