// The query embedding: Fireworks Qwen3-Embedding-8B, fronted by a KV cache.
//
// The cache is a cost measure, not a latency one (§3.5: next to Fireworks a hit
// saves ~54 ms).  Its key is the SHA-256 of the exact text sent to Fireworks —
// the instruction-wrapped, normalised query, so a different kind selection
// embeds (and caches) separately, as it must: the {kinds} phrase changes the
// vector.

import { UpstreamError } from './search.js';

export const DIMENSION = 4096;

// Search traffic is Zipf-distributed; a month keeps the head warm and lets
// dead queries expire.  Not a ruled number.
const CACHE_TTL_SECONDS = 30 * 24 * 3600;

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function l2Normalize(vector) {
  let sum = 0;
  for (const x of vector) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

/** One embedding over the wire.  `input` is the finished instruction-wrapped
 * text (kinds.embeddingInput); the caller never passes a raw query here. */
export async function fireworksEmbed(input, { apiKey, model, signal, fetchImpl = fetch }) {
  const resp = await fetchImpl('https://api.fireworks.ai/inference/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: [input] }),
    signal,
  });
  if (!resp.ok) {
    throw new UpstreamError('Fireworks embeddings', resp.status, await resp.text());
  }
  const data = await resp.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== DIMENSION) {
    throw new Error(
      `Fireworks embeddings: expected a ${DIMENSION}-dimension vector, got `
      + `${Array.isArray(embedding) ? embedding.length : typeof embedding}`);
  }
  // The store's vectors are unit vectors (the library normalizes this model);
  // cosine distance would not care, but keep the two sides alike.
  return l2Normalize(Float32Array.from(embedding));
}

/** The cached embedding of one instruction-wrapped text.  The cache write is
 * a side effect handed to `ctx.waitUntil`: it neither delays the answer nor,
 * by failing, turns a computed search into an error. */
export async function embedQuery(input, env, ctx, signal) {
  const kvKey = `emb:${await sha256hex(input)}`;
  const hit = await env.EMBED_KV.get(kvKey, 'arrayBuffer');
  if (hit && hit.byteLength === DIMENSION * 4) return new Float32Array(hit);
  const vector = await fireworksEmbed(input, {
    apiKey: env.FIREWORKS_API_KEY,
    model: env.FIREWORKS_MODEL,
    signal,
  });
  ctx.waitUntil(env.EMBED_KV.put(kvKey, vector.buffer, { expirationTtl: CACHE_TTL_SECONDS }));
  return vector;
}
