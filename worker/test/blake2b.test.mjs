// The BLAKE2b port against Python's hashlib (test/blake2b.vectors.json, generated
// by the reference implementation) and RFC 7693's own vector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blake2b, documentIdOf, keyBytesOf } from '../src/blake2b.js';

const vectors = JSON.parse(readFileSync(new URL('./blake2b.vectors.json', import.meta.url)));
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

test('RFC 7693 appendix A: BLAKE2b-512 of "abc"', () => {
  assert.equal(hex(blake2b(new TextEncoder().encode('abc'), 64)),
    'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1'
    + '7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
});

test('primitive: BLAKE2b-128 agrees with hashlib on every length class', () => {
  for (const { bytes_hex, hex: want } of vectors.primitive) {
    assert.equal(hex(blake2b(fromHex(bytes_hex), 16)), want, `len ${bytes_hex.length / 2}`);
  }
});

test('document id: length-prefixed hash of the key, as site_export._hash128', () => {
  for (const { key_b64url, id_hex } of vectors.documents) {
    const bytes = keyBytesOf(key_b64url);
    assert.equal(documentIdOf(bytes).replace(/-/g, ''), id_hex, `key of ${bytes.length} bytes`);
  }
});
