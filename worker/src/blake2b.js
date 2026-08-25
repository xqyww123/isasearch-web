// BLAKE2b (RFC 7693), unkeyed, for one use: turning a universal key into its
// document id — §6.2's `_hash128` — so that `/entity/<key>` (D9 as amended
// 2026-08-25) can fetch the row by primary key.  Workers' WebCrypto has no
// BLAKE2, hence this port.  Checked byte for byte against Python's hashlib on
// test/blake2b.vectors.json.  64-bit words are held as (high, low) uint32 pairs
// since JavaScript has no native 64-bit integer arithmetic worth the cost.

const IV = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372,
  0x5f1d36f1, 0xa54ff53a, 0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c,
  0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
]);

const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];

// v: 32 uint32 (16 words, low then high); m: 32 uint32 likewise.
function G(v, m, a, b, c, d, ix, iy) {
  const add = (x, y) => {
    let lo = v[x] + v[y];
    let hi = v[x + 1] + v[y + 1] + (lo >= 0x100000000 ? 1 : 0);
    v[x] = lo >>> 0; v[x + 1] = hi >>> 0;
  };
  const addm = (x, i) => {
    let lo = v[x] + m[i];
    let hi = v[x + 1] + m[i + 1] + (lo >= 0x100000000 ? 1 : 0);
    v[x] = lo >>> 0; v[x + 1] = hi >>> 0;
  };
  const xorrot = (x, y, r) => {
    const lo = v[x] ^ v[y], hi = v[x + 1] ^ v[y + 1];
    if (r === 32) { v[x] = hi; v[x + 1] = lo; }
    else if (r === 24 || r === 16) {
      v[x] = ((lo >>> r) | (hi << (32 - r))) >>> 0;
      v[x + 1] = ((hi >>> r) | (lo << (32 - r))) >>> 0;
    } else { // 63: a right rotation by 63 is a left rotation by 1
      v[x] = ((lo << 1) | (hi >>> 31)) >>> 0;
      v[x + 1] = ((hi << 1) | (lo >>> 31)) >>> 0;
    }
  };
  add(a, b); addm(a, ix); xorrot(d, a, 32);
  add(c, d); xorrot(b, c, 24);
  add(a, b); addm(a, iy); xorrot(d, a, 16);
  add(c, d); xorrot(b, c, 63);
}

function compress(h, block, t, last) {
  const v = new Uint32Array(32);
  v.set(h, 0); v.set(IV, 16);
  v[24] ^= t >>> 0; v[25] ^= Math.floor(t / 0x100000000) >>> 0;
  if (last) { v[28] = ~v[28] >>> 0; v[29] = ~v[29] >>> 0; }
  const m = new Uint32Array(32);
  for (let i = 0; i < 32; i += 1) {
    m[i] = block[i * 4] | (block[i * 4 + 1] << 8) | (block[i * 4 + 2] << 16) | (block[i * 4 + 3] << 24);
  }
  for (let r = 0; r < 12; r += 1) {
    const s = SIGMA[r];
    G(v, m, 0, 8, 16, 24, s[0] * 2, s[1] * 2);
    G(v, m, 2, 10, 18, 26, s[2] * 2, s[3] * 2);
    G(v, m, 4, 12, 20, 28, s[4] * 2, s[5] * 2);
    G(v, m, 6, 14, 22, 30, s[6] * 2, s[7] * 2);
    G(v, m, 0, 10, 20, 30, s[8] * 2, s[9] * 2);
    G(v, m, 2, 12, 22, 24, s[10] * 2, s[11] * 2);
    G(v, m, 4, 14, 16, 26, s[12] * 2, s[13] * 2);
    G(v, m, 6, 8, 18, 28, s[14] * 2, s[15] * 2);
  }
  for (let i = 0; i < 16; i += 1) h[i] ^= v[i] ^ v[i + 16];
}

/** Unkeyed BLAKE2b of `data` (Uint8Array) with a digest of `outlen` bytes. */
export function blake2b(data, outlen) {
  const h = new Uint32Array(IV);
  h[0] ^= 0x01010000 ^ outlen;         // parameter block: digest length, fanout 1, depth 1
  const block = new Uint8Array(128);
  let t = 0, i = 0;
  while (data.length - i > 128) {
    block.set(data.subarray(i, i + 128)); i += 128; t += 128;
    compress(h, block, t, false);
  }
  block.fill(0); block.set(data.subarray(i)); t += data.length - i;
  compress(h, block, t, true);
  const out = new Uint8Array(outlen);
  for (let j = 0; j < outlen; j += 1) out[j] = (h[j >> 2] >>> ((j & 3) * 8)) & 0xff;
  return out;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** §6.2: the document id of a universal key — BLAKE2b-128 over the key with an
 * 8-byte big-endian length prefix (`site_export._hash128`), as a UUID string. */
export function documentIdOf(keyBytes) {
  const buf = new Uint8Array(8 + keyBytes.length);
  new DataView(buf.buffer).setBigUint64(0, BigInt(keyBytes.length));
  buf.set(keyBytes, 8);
  const d = hex(blake2b(buf, 16));
  return `${d.slice(0, 8)}-${d.slice(8, 12)}-${d.slice(12, 16)}-${d.slice(16, 20)}-${d.slice(20)}`;
}

/** The universal key as the URL carries it: base64url, unpadded. */
export function keyBytesOf(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
