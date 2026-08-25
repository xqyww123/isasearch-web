// §11.1 layer 2 — the per-address daily counter, as one Durable Object
// (user-ruled 2026-08-25, replacing the Workers KV counter).  A single object
// serves the whole site: its requests execute one at a time, so the increment
// is atomic and the count exact — which is what lets COPY §7 promise "1 000".
// The same table yields the usage statistics the user asked for.
//
// Privacy: the address is stored only as SHA-256(salt | ip) under a fixed
// secret salt — the same client hashes alike on every day, so returning
// addresses can be counted, and no row can be turned back into an address.
// No query text is ever stored.

import { DurableObject } from 'cloudflare:workers';

export const DAILY_LIMIT = 1000;

export class DailyGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        day      TEXT    NOT NULL,
        ip_hash  TEXT    NOT NULL,
        count    INTEGER NOT NULL,
        country  TEXT,
        asn      INTEGER,
        PRIMARY KEY (day, ip_hash)
      );
      CREATE TABLE IF NOT EXISTS daily (
        day        TEXT PRIMARY KEY,
        searches   INTEGER NOT NULL DEFAULT 0,
        rejected   INTEGER NOT NULL DEFAULT 0,
        addresses  INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS daily_geo (
        day       TEXT    NOT NULL,
        country   TEXT    NOT NULL,
        asn       INTEGER NOT NULL,
        searches  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, country, asn)
      );
    `);
  }

  /** Count one search.  Returns { allowed, count }.  `day` is the UTC date
   * the caller computed, so the gate and its Retry-After agree on midnight. */
  admit({ day, ipHash, country, asn }) {
    const row = this.sql.exec(
      `INSERT INTO counters (day, ip_hash, count, country, asn)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT (day, ip_hash) DO UPDATE SET count = count + 1
         RETURNING count`,
      day, ipHash, country ?? null, asn ?? null).one();
    const count = row.count;
    const allowed = count <= DAILY_LIMIT;
    this.sql.exec(
      `INSERT INTO daily (day, searches, rejected, addresses) VALUES (?, ?, ?, ?)
         ON CONFLICT (day) DO UPDATE SET
           searches  = searches + excluded.searches,
           rejected  = rejected + excluded.rejected,
           addresses = addresses + excluded.addresses`,
      day, allowed ? 1 : 0, allowed ? 0 : 1, count === 1 ? 1 : 0);
    // Where the searches came from, kept for good (ruled 2026-08-25).  This is
    // a count and nothing else: no address, no hash, no query text — and it is
    // separate from `counters` precisely so that the day's pruning below cannot
    // take the statistics with it, which is what used to happen.  An unknown
    // country or AS is stored as '' / 0 rather than NULL, so the primary key
    // groups them instead of making every unknown a row of its own.
    if (allowed) {
      this.sql.exec(
        `INSERT INTO daily_geo (day, country, asn, searches) VALUES (?, ?, ?, 1)
           ON CONFLICT (day, country, asn) DO UPDATE SET searches = searches + 1`,
        day, country ?? '', asn ?? 0);
    }
    // Yesterday's rows are the rollback of a clock skew; anything older is not.
    this.sql.exec(`DELETE FROM counters WHERE day < ?`, previousDay(day));
    return { allowed, count };
  }

  /** The usage statistics, newest day first. */
  stats() {
    return this.sql.exec(`SELECT * FROM daily ORDER BY day DESC`).toArray();
  }

  /** Searches by country and AS, newest day first — the permanent record that
   * `counters` never was.  Nothing reads it yet; §11.1's statistics endpoint is
   * still unbuilt. */
  geo() {
    return this.sql.exec(
      `SELECT * FROM daily_geo ORDER BY day DESC, searches DESC`).toArray();
  }

  /** What the about page prints: searches answered in all, and since `sinceDay`
   * (a UTC date the caller computed).  Refused searches are not counted — the
   * page says "answered".  The `daily` table is never pruned, so "in all" means
   * since the site opened.  No address and no query text is involved. */
  usage({ sinceDay }) {
    const all = this.sql.exec(
      `SELECT COALESCE(SUM(searches), 0) AS n FROM daily`).one();
    const recent = this.sql.exec(
      `SELECT COALESCE(SUM(searches), 0) AS n FROM daily WHERE day >= ?`,
      sinceDay).one();
    return { total: all.n, recent: recent.n };
  }
}

function previousDay(day) {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}
