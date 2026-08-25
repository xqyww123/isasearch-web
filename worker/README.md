# The isasearch Worker

The Cloudflare Worker of plan §12.2 step 5: the search API, the §11.1
layer-2 daily gate, and `/source/*` served from the R2 bucket `isasearch`.
The governing design is `docs/SEMANTIC_SEARCH_SITE_PLAN.md` (§6 queries and
fusion, §8.2 the asset sentinel, §11.1 rate limits and statistics, §17.8
hosting); nothing here overrides it.

## Layout

| Path | What it is |
| --- | --- |
| `wrangler.toml` | Bindings and vars — the live namespace name lives here (§8.2: switching an export is editing `TPUF_NAMESPACE` and deploying). No credential, ever. |
| `src/index.js` | Entry: routing, `/source/*` off R2 with edge caching (HEAD derived from GET), the daily gate call, the asset-sentinel check, the search handler. |
| `src/search.js` | Pure core: §11.1's query normalisation, request validation, §6.3's filter compilation, the one `multi_query` body for both retrieval states, `rowsOf`, D5's collapse, D26's matched-theory marking. |
| `src/kinds.js` | One table: the eleven stored kind values with their instruction phrases; canonical kind order; the exact embedding input text (a snapshot of the DB library's defaults). |
| `src/embed.js` | Fireworks Qwen3-Embedding-8B with the KV cache (keyed on the SHA-256 of the exact text sent; the write rides `ctx.waitUntil`). |
| `src/gate.js` | The `DailyGate` Durable Object: exact per-address daily counts and the `daily` statistics table. |
| `test/` | Unit tests over the pure core: `node --test worker/test` (19). |
| `probe/live_probe.mjs` | Read-only integration probe against the real Fireworks endpoint and the live namespace (see its header). Nine checks, all passing 2026-08-25. |

The tokenizer is imported from `../site/tokenizer/` — the single
JavaScript implementation, never copied. `asset.json` is imported as text so
the Worker can hash the committed bytes for the sentinel check.

## The search API

`POST /api/search`, JSON body:

```jsonc
{
  "query": "a sorted list stays sorted when an element is appended",  // required, ≤8000 code points after normalisation (D7, D29)
  "bm25": true,                    // optional boolean; default true: hybrid RRF; false: the vector leg alone (D36 as amended)
  "kinds": ["lemma"],              // stored kind values, any order; [] (the default) or all eleven sends no kind condition (D29 as amended)
  "conditions": [                  // each ≤512 code points, at most 64
    { "on": "expr", "polarity": "contains", "text": "sorted_wrt" }
    // on ∈ name | expr | theory | all;  polarity ∈ contains | excludes
  ]
}
```

Response `{ results, limit_reached, parts }`: `results` are D5's collapsed
cards in rank order (`key`, `group`, `name`, `from_collection`, `kinds`,
`expr`, `theories`, `position`, `source_link`, `interpretation`, plus
`matched_theories` when a contains-condition reaches the Theory Name field
directly or through All); no relevance number anywhere (D48);
`limit_reached` says whether the fused 200-row cap was hit (§4.5's
end-of-list copy branches on it); `parts` is each condition's surviving
subtokens, for the §4.6 "was read as" notice.

Error codes (the visitor-facing strings stay in `site/COPY.md`):
`query_missing`, `query_too_long`, `condition_too_long`, `condition_empty`
(+`index`), `kind_unknown`, `bad_request` (400, or 413 for an oversized
body), `method_not_allowed` (405), `not_found` (404), `daily_limit` (429 +
`Retry-After`), `upstream` (502 — Fireworks, turbopuffer, or the asset
sentinel refusing: the index was built under a different tokenizer asset).

## Secrets — never in this repository

```
wrangler secret put TURBOPUFFER_API_KEY   # a READ-ONLY key in production (§12.1)
wrangler secret put FIREWORKS_API_KEY
wrangler secret put IP_HASH_SALT          # any long random string; FIXED for the site's life
```

Local dev: `npx wrangler dev --local` in this directory, with the three
values in a `worker/.dev.vars` file (git-ignored; delete it afterwards).

## What lands at deployment, not in code

- `wrangler kv namespace create EMBED_KV` and fill its id; the Durable
  Object migration `v1` runs with the first deploy.
- The custom domain `isabelle-semantics.qiyuan.me` (D17).
- §11.1 layer 1 — the edge rate-limiting rule, 5 per IP per 10 s, **scoped
  to the path `/api/search`** (a rule over the whole domain would 429
  visitors on their own fonts; ruled 2026-08-25). Its 429s never reach this
  code.
- The `/source/*` zone cache rule (long TTL, purged on republish); the
  Worker itself sends a four-hour browser TTL.
- The pre-launch click-through of live source links (D47's gate ran
  against the tree; the human click is still owed).
- Usage statistics live in the `DailyGate` object's `daily` table
  (`stats()`); no endpoint exposes them yet — read them with
  `wrangler` or add an authenticated route when wanted.
