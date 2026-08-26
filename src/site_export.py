r"""The site export (SEMANTIC_SEARCH_SITE_PLAN.md §8): the semantic DB becomes a
turbopuffer namespace.

One run does §8.1's steps in their order, and each of the two guards below stops it
loudly rather than let it publish something wrong:

* **the completeness gate (§8.1 step 1)** — every shippable record must have a
  vector.  The vector store is a lazy cache and a missing vector is legal in normal
  operation, which is exactly why the export cannot treat it as normal;
* **the fresh-namespace guard (§8.2)** — a namespace that already exists is refused
  unless this run is continuing from its own checkpoint.  turbopuffer cannot drop
  what a batch omits, so an upsert into a live namespace leaves every deleted entity
  behind forever.

(Two more guards stood here until 2026-08-26 and retired with tokenization —
Q14's final ruling: a condition is a regular expression over the raw displayed
text, so there is no tokenizer asset for D46's component guard to compare and
no `theory_subtokens` separator for step 0b's probe to settle.)

The final report prints the three numbers RELEASE.md step 8 pastes into
`wrangler.toml [vars]` — ROWS, ENTITIES, BUILT — beside `TPUF_NAMESPACE`, in
the same commit.

Nothing here holds the corpus in memory: records stream out of the store in key
order and go up in batches, so a re-run resumes where the last one stopped.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import glob
import hashlib
import itertools
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Iterator

import numpy as np

from Isabelle_Semantic_Embedding._paths import semantic_DB_dir


class ExportError(RuntimeError):
    """Anything that must stop the export."""


def _log(msg: str) -> None:
    print(f"[site-export] {msg}", flush=True)


# ---------------------------------------------------------------------------
# §8.1 step 0 — scope (D24)
# ---------------------------------------------------------------------------

# Isabelle's four prefix-less base logics, which genuinely have no session and are
# members by D24's own clause.
BASE_LOGICS = frozenset({"Pure", "FOL", "IFOL", "ZF"})

# `session NAME …` or `session "NAME" …` opening a ROOT entry.  The quoted
# alternative is not decoration: `session "CoreC++"` is a real AFP session whose
# name contains a character an unquoted name cannot, and a reader that misses it
# puts 2,915 published records out of scope with no error anywhere.
_SESSION = re.compile(r'^\s*session\s+(?:"([^"]*)"|([^\s"(]+))')


def _uncommented(text: str) -> str:
    """ROOT text with `(* … *)` removed, nesting honoured.  A commented-out session
    is not a declared session; six of them sit in the two trees."""
    out, depth, i = [], 0, 0
    while i < len(text):
        if text.startswith("(*", i):
            depth += 1
            i += 2
        elif text.startswith("*)", i) and depth:
            depth -= 1
            i += 2
        else:
            if not depth:
                out.append(text[i])
            i += 1
    return "".join(out)


def declared_sessions(*trees: str) -> set[str]:
    """D24's declared-session set: every session declared by a ROOT file anywhere
    under these directory trees, plus the base logics.

    Read from the ROOT files rather than from `isabelle sessions`, which answers a
    different question: it enumerates what is *registered* on this machine, so it
    also returns this repository's own sessions — 861 of them here — and D24's scope
    is the two trees and nothing else."""
    found = set()
    for tree in trees:
        for root in glob.glob(os.path.join(tree, "**", "ROOT"), recursive=True):
            with open(root, encoding="utf-8", errors="replace") as f:
                text = _uncommented(f.read())
            for line in text.splitlines():
                m = _SESSION.match(line)
                if m:
                    found.add(m.group(1) or m.group(2))
    if not found:
        raise ExportError(f"no ROOT file under any of {trees} declares a session")
    return found | set(BASE_LOGICS)


def session_of(theory: str) -> str:
    """The session a theory long name belongs to.  A base logic has no prefix, so a
    name with no dot is its own session."""
    return theory.split(".", 1)[0]


# ---------------------------------------------------------------------------
# §8.1 steps 2 to 5 — one record becomes one document
# ---------------------------------------------------------------------------

# `THEORY_SEPARATOR` stood here until 2026-08-26: a whitespace-only element the
# tokenizer can never emit, injected between two theory names so a
# `ContainsTokenSequence` could not match across them (`[HOL.List,
# Affine_Arithmetic.Foo]` must not answer to `List Affine_Arithmetic`, which is
# no theory's name).  `theory_subtokens` now carries ONE name, so there is
# nothing to straddle and nothing to separate.  Its live probe,
# `check_theory_separator`, went with it.


def _hash128(*parts: bytes) -> bytes:
    """A deterministic 128-bit hash of a sequence of byte strings.  Each part is
    length-prefixed, so no two different sequences hash alike by running together."""
    h = hashlib.blake2b(digest_size=16)
    for part in parts:
        h.update(len(part).to_bytes(8, "big"))
        h.update(part)
    return h.digest()


def document_id(key: bytes) -> str:
    """§6.2.  The universal key runs to 308 bytes and 6.34 % of them exceed
    turbopuffer's 64-byte string-id limit once encoded, so the id is a 128-bit hash
    of the key rendered as a UUID and the key itself rides as an attribute.
    Deterministic, so a re-export upserts in place instead of duplicating."""
    return str(uuid.UUID(bytes=_hash128(key)))


# `group_of` stood here until 2026-08-26, filling a filterable `group` column with
# the hash of one `(name, expression)` pair.  It was the entity page's identity and
# D5's collapse key; D9 as amended made the page one-per-record and addressed it by
# document id, and D5's collapse became the universal key with the tag byte masked
# (`group` merged the same statement proved in two AFP entries and split the same
# fact under two names).  Nothing had read the column since; it is gone, and with it
# an index the namespace was carrying for no reader.


def clean_for_display(expr: str) -> str:
    r"""§8.3.  What a card shows, not what matches: `\r` satisfies §5.2's whitespace
    test and is discarded before token formation either way.

    §8.3 opens with `repair_del`, which no longer exists anywhere — §10 finished, the
    238 affected records were repaired one at a time and D11 closed the route that
    wrote the character, so what is left of that pipeline is this one line."""
    return expr.replace("\r\n", "\n").replace("\r", "\n")


# `theory_subtokens` stood here until the Q14 final ruling: a Theory Name
# condition is a regular expression over the raw `theory` column now.  The 533
# records (0.04 %) with no defining theory carry the empty string; how the
# empty value behaves under `Regex` and `Not(Regex)` is a launch-gate probe of
# the raw-text overlap sweep (§6.3c), not yet measured.

# The one declaration of the patched column.  `run_patch` (site_source_pages)
# sends exactly this fragment, so the patch and the export can never diverge on
# type or filterability — a filterable divergence would silently re-index the
# live store.
SOURCE_LINK_SCHEMA = {"type": "string", "filterable": False}


# The three text columns a condition can name.  One declaration (D23's spirit
# survives tokenization: the same shape for all three, so one pattern means one
# thing wherever it is aimed).  `{"type": "string", "regex": True}` is the
# measured spelling — the schema every 2026-08-26 probe namespace was built
# with; the 4 KiB filterable-value limit does not apply to regex columns
# (measured, Q14).
REGEX_COLUMN = {"type": "string", "regex": True}


# §6.1, in its order.  The schema and the document builder below are two halves of
# one statement and must be read together.
def namespace_schema(dimension: int) -> dict:
    return {
        "id": "uuid",
        "vector": {"type": f"[{dimension}]f16", "ann": True},
        "key": {"type": "string", "filterable": False},
        # Display AND matching: since Q14's final ruling a condition is a
        # regular expression over the raw displayed text, so the three text
        # columns carry the regex index themselves and the `*_subtokens`
        # shadows (with the tokenizer that filled them) are gone.  `theory` is
        # the ONE theory the entity is written in, empty when unknown.
        "name": REGEX_COLUMN,
        "expr": REGEX_COLUMN,
        "theory": REGEX_COLUMN,
        # Display only, and only a theorem-alike record has any: the theories
        # declaring the constants its statement uses.  No index — no condition
        # reaches it (D14 as superseded), it is read only when an entity page
        # renders.  Sorted, because turbopuffer preserves insertion order
        # verbatim, so what is written here IS the order the chips appear in.
        "constituent_theories": {"type": "[]string", "filterable": False},
        "kind": {"type": "string", "filterable": True},
        "position": {"type": "string", "filterable": False},
        "source_link": SOURCE_LINK_SCHEMA,
        "from_collection": {"type": "string", "filterable": False},
        # Display only since 2026-08-26.  It carried a full-text index — case
        # folded, stemmed, stopwords removed — for one reader: the BM25 leg of the
        # hybrid ranking, dropped 2026-08-25 when the user measured the hybrid as
        # worse than the vector leg alone.  The text still shows on every card and
        # entity page; nothing searches it, so nothing indexes it.
        "interpretation": {"type": "string", "filterable": False},
    }


def build_document(key: bytes, rec, theory: str, constituents: 'list[str]',
                   vector: np.ndarray, source_link: str) -> dict:
    """§8.1 steps 2 to 5 for one record.

    A condition matches the raw `name`, never the displayed form: a member of a
    dynamic fact collection is displayed as `<from_collection>(_)`, but the
    Worker emits one filter for the whole namespace and cannot route a member
    row to a different field, so a pasted `coll(_)` matches nothing — intended,
    and ruled on 2026-08-19 (§8.1 step 5).

    `theory` is the one theory the entity is written in — `defining_theory_of`
    below — and `constituents` the theories declaring the constants a statement
    uses, display-only and empty for everything that is not theorem-alike.  Until
    2026-08-26 one column carried both senses, which is what made a Theory Name
    condition mean two things.

    `source_link` is the finished href the card will emit, composed from §17's
    artefact by `site_source_pages.source_links`; the empty string is D42's
    absent form.  Resolution happened once, at map time (D49 ruling 2) — the
    export only carries the string."""
    return {
        "id": document_id(key),
        "vector": base64.b64encode(
            vector.astype("<f4", copy=False).tobytes()).decode("ascii"),
        "key": base64.urlsafe_b64encode(key).decode("ascii"),
        "name": rec.name or "",
        "expr": clean_for_display(rec.expr or ""),
        "theory": theory,
        # Sorted here and nowhere else: turbopuffer stores an array in the order
        # given, so this call is what fixes the order of the entity page's chips.
        "constituent_theories": sorted(constituents),
        "kind": rec.kind.label,
        "position": (f"{rec.position[0]}:{rec.position[1]}" if rec.position else ""),
        "source_link": source_link,
        "from_collection": rec.from_collection or "",
        "interpretation": rec.interpretation or "",
    }


# ---------------------------------------------------------------------------
# §7 — the theories a record is filtered by, and §8.1 step 1's gate
# ---------------------------------------------------------------------------

def theory_registry() -> 'dict[bytes, str]':
    """The whole theory-hash registry in memory: 16-byte hash to theory long name
    (§7.3).  Ten thousand entries against two hundred thousand name-addressed
    records, so reading it once beats a point lookup per record.

    A hash does not determine one long name — byte-identical theory text vendored
    into a second session gets one hash under two names, measured at 2 cases of 9,214
    — and the registry keeps whichever was written last.  That caveat is
    THEORY_HASH_REGISTRY_PLAN.md's R9 and this plan honours it rather than fixing
    it."""
    from Isabelle_Semantic_Embedding import theory_hash_registry
    return {k: theory_hash_registry.decode_entry(v)[0]
            for k, v in theory_hash_registry.iter_items()}


def theories_of(key: bytes, rec, registry: 'dict[bytes, str]') -> 'list[str]':
    """Every theory a record depends on: the constituent theories of a
    theorem-alike entity, the declaring theory of a name-addressed one.

    This is no longer what a Theory Name condition matches — `defining_theory_of`
    is — but it remains **D24's scope test**, and deliberately: the scope question
    is "does everything this record needs come from a declared session", which the
    dependency set answers and one theory cannot.  It is also what the entity page
    shows a theorem under its constituent-theories heading.

    A theorem-alike key's 16-byte prefix is an XOR pseudo-theory and must never be
    looked up as a real theory (D13), which is why the two cases are told apart by
    the key's shape and not by whether the record happens to carry constituents."""
    from Isabelle_RPC_Host.universal_key import is_xor_prefixed_key
    if is_xor_prefixed_key(key):
        if rec.theory_constituents is None:
            raise ExportError(
                f"{rec.name!r} is content-addressed and carries no constituent "
                f"theories, so nothing can say which theories it lives in")
        return [name for name, _ in rec.theory_constituents]
    name = registry.get(key[:16])
    if name is None:
        raise ExportError(
            f"the declaring theory of {rec.name!r} (hash {key[:16].hex()}) is not in "
            f"the theory-hash registry, so D24's scope test cannot be applied to it")
    return [name]


def _head_theory_name(rec) -> str:
    """The theory base name a record's own name begins with, or `''`.

    An Isabelle entity is named `<theory base name>.<rest>`.  For a member of a
    dynamic fact collection the member's own name is minted where the collector
    ran, so the collection's name is read instead — `Deriv.derivative_eq_intros(93)`
    belongs to `Deriv`, not to the theory that happened to gather it."""
    source = rec.from_collection or rec.name or ""
    return source.split(".", 1)[0] if "." in source else ""


def defining_theory_of(key: bytes, rec, dependencies: 'list[str]',
                       positioned: 'dict[str, str]',
                       by_base: 'dict[str, list[str]]',
                       registry: 'dict[bytes, str]') -> str:
    """**The one theory the entity is written in**, or `''` when nothing says.

    This is what a Theory Name condition matches as of 2026-08-26, for every kind
    alike.  Two sources, in order:

    1. **Isabelle's own record**, for a name-addressed entity: the key's first 16
       bytes ARE its declaring theory's hash, so `theories_of` already has it and
       it is authoritative.  The entity's source position is NOT consulted, and
       must not be — 1,236 name-addressed records are declared in one theory and
       positioned in another file (`AutoCorres2.CLocals` mints entities for eleven
       theories from inside its own file), and there Isabelle is right.

    2. **The source position**, for a theorem-alike entity, which Isabelle gives
       no declaring theory at all (D13).  The file its statement was written in
       publishes to exactly one theory page, and that page is named by the theory.
       Measured over the corpus: resolves 98.40 %, and where a record's own name
       also names a theory the two agree on 99.88 % — every disagreement being
       `AutoCorres2.CLocals` again.

    Then a fallback, for the theorem-alike records point 2 misses — no position
    (1,831), a position inside an Isabelle/ML file (6,747), or a collection member
    whose position points at the collector rather than at the fact (9,597).  Their
    own name begins with a theory base name; resolve it against the record's own
    dependencies first, since a name shared by several theories is most likely the
    one this record already uses, and only then against the whole published tree.
    An ambiguous base name resolves to nothing rather than to a guess.

    Coverage of the whole rule, measured 2026-08-26: 99.95 % of theorem-alike
    records, 100 % of name-addressed ones.  The 533 that resolve to `''` match no
    Theory Name condition at all, which is the honest outcome — see
    `theory_subtokens`."""
    from Isabelle_RPC_Host.universal_key import is_xor_prefixed_key
    if not is_xor_prefixed_key(key):
        return registry[key[:16]]            # theories_of already raised if absent
    if not rec.from_collection:
        found = positioned.get(document_id(key))
        if found is not None:
            return found
    head = _head_theory_name(rec)
    if not head:
        return ""
    for candidates in (dependencies, by_base.get(head, [])):
        hit = [t for t in candidates if t.rsplit(".", 1)[-1] == head]
        if len(hit) == 1:
            return hit[0]
    return ""


def vector_store_path(explicit: 'str | None' = None) -> str:
    """The one vector store this export publishes from."""
    from Isabelle_Semantic_Embedding.semantic_embedding import vector_store_names
    if explicit:
        return explicit
    names = vector_store_names()
    if len(names) != 1:
        raise ExportError(
            f"expected exactly one vector store, found {names}; name the one to "
            f"publish with --vector-store")
    return os.path.join(semantic_DB_dir(), names[0])


def vector_reader(stack, path: str):
    """`(get, dimension)`, where `get(key)` is the record's float32 vector or None.

    Reads the layered stores directly rather than through `Semantic_Vector_Store`,
    which would want an embedding provider and therefore an API key the export has
    no use for — the same shell `snapshot_sync.export` uses."""
    from Isabelle_Semantic_Embedding.snapshot_sync import _model_of, _local_dimension
    from Isabelle_Semantic_Embedding.semantic_embedding import Vector_Store, _decode_q15
    model = _model_of(os.path.basename(path))
    dimension = _local_dimension(model) if model else None
    if dimension is None:
        raise ExportError(f"no configured dimension for the model of {path}")
    shell = Vector_Store.__new__(Vector_Store)
    shell.path = path
    raw_get = shell._raw_getter(stack)

    def get(key: bytes):
        raw = raw_get(key)
        return None if raw is None else _decode_q15(raw, dimension, key)

    return get, dimension


def completeness_gate(get_vector) -> int:
    """§8.1 step 1: every **shippable** record has a vector, or the export stops.

    Shippable is `snapshot_sync._ships_predicate()` — imported, never restated: it
    drops WIP keys, and a restatement of it is what produced the 8,908 figure the
    user rejected on 2026-08-12.  The vector store is a lazy cache and a missing
    vector is legal in normal operation, so publishing around one would quietly ship
    a corpus with holes."""
    from Isabelle_Semantic_Embedding.semantics import Semantic_DB
    from Isabelle_Semantic_Embedding.snapshot_sync import _ships_predicate
    ships = _ships_predicate()
    shippable = missing = 0
    examples: 'list[str]' = []
    for key, raw in Semantic_DB.iter_items():
        if len(key) == 16 or not ships(key, raw):
            continue
        shippable += 1
        if get_vector(key) is None:
            missing += 1
            if len(examples) < 5:
                examples.append(key.hex())
    if missing:
        raise ExportError(
            f"{missing} of {shippable} shippable records have no vector "
            f"(e.g. {', '.join(examples)}); embed them before exporting")
    return shippable


# ---------------------------------------------------------------------------
# §8.2 — the namespace name
# ---------------------------------------------------------------------------
# The tokenizer asset, D46's component guard and the `.asset` sentinel
# namespace all stood here until 2026-08-26.  The asset fed the tokenizer
# (retired with tokenization, Q14) and the guard existed because the asset's
# rules had to match the index's — a failure class that no longer exists.  The
# sentinel carried the display numbers and cost a cross-ocean turbopuffer read
# per cold-isolate page view; ROWS/ENTITIES/BUILT live in `wrangler.toml
# [vars]` now, kept honest by RELEASE.md's checklist (§8.2).  The 489-entry
# `\<symbol>` table the condition box replaces with was extracted once from
# the retiring asset into `site/app/public/symbols.json`.


# D5 as amended 2026-08-25 (the user's golden standard): two records are one
# entity iff both are theorem-alike and their universal keys agree in every byte
# but the kind tag.  The Worker's `entityOf` is the same function.
def entity_of(key: bytes) -> bytes:
    from Isabelle_RPC_Host.universal_key import is_thm_rule_key
    return key[:16] + b"\x00" + key[17:] if is_thm_rule_key(key) else key


def namespace_base(isabelle_home: str, afp_dir: str) -> str:
    """§8.2's namespace name without its generation: `isasearch-<isabelle
    release>-<afp snapshot>`, e.g. `isasearch-2025-2-afp-2026-05-13`.

    The user fixed this shape on 2026-08-20 and took the tokenizer asset's digest
    back out of it, amending D45.  What that gives up is stated in §8.2: a Worker
    carrying an older asset than the index was built with no longer addresses the
    older index by construction, so a rule change deployed out of order is a silent
    wrong answer rather than a self-correcting one."""
    release = os.path.basename(os.path.normpath(isabelle_home))
    if release.startswith("Isabelle"):
        release = release[len("Isabelle"):]
    snapshot = os.path.basename(os.path.normpath(afp_dir))
    return f"isasearch-{release}-{snapshot}"


def list_namespaces(prefix: str, *, region: str, key: str) -> 'list[str]':
    """Every namespace whose name starts with `prefix`, following the cursor."""
    out, cursor = [], None
    while True:
        query = f"?prefix={urllib.parse.quote(prefix)}&page_size=1000"
        if cursor:
            query += f"&cursor={urllib.parse.quote(cursor)}"
        page = request("GET", f"/v1/namespaces{query}", region=region, key=key)
        out += [n["id"] for n in page.get("namespaces", [])]
        cursor = page.get("next_cursor")
        if not cursor:
            return out


def next_namespace(base: str, *, region: str, key: str) -> str:
    """The next free generation of `base`: the base name itself the first time, then
    `base-2`, `base-3`, and so on.

    §8.2 writes every export into a namespace that does not yet exist, because
    turbopuffer cannot drop what a batch omits and an upsert into a live namespace
    would leave every deleted entity behind forever.  Nothing in the base moves when
    the corpus does — an Isabelle release and an AFP snapshot stay put while new
    interpretation data is collected — so the generation is what makes "a namespace
    that does not yet exist" true rather than merely intended.

    Read off the account rather than remembered anywhere: the namespaces that exist
    are the record of which generations were used, and a note kept beside them would
    be a second thing to keep in step."""
    used = set(list_namespaces(base, region=region, key=key))
    generation = 1
    while (base if generation == 1 else f"{base}-{generation}") in used:
        generation += 1
    return base if generation == 1 else f"{base}-{generation}"


# ---------------------------------------------------------------------------
# turbopuffer
# ---------------------------------------------------------------------------

# §6.4 and D18: every region-bearing component goes in North America, co-located
# with the Fireworks origin.  Which North American region is second-order and
# reversible — turbopuffer has `copy_from_namespace`.
DEFAULT_REGION = "aws-us-west-2"

# §12.1: no key lives in this repository, in any form.  The user's key sits in
# ~/Current/MLML/secret.sh, outside the tree, under a different name; bridge it with
#     source ~/Current/MLML/secret.sh && export TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY"
API_KEY_ENV = "TURBOPUFFER_API_KEY"

_RETRY_STATUS = frozenset({408, 429, 500, 502, 503, 504})


def api_key() -> str:
    key = os.environ.get(API_KEY_ENV)
    if not key:
        raise ExportError(
            f"{API_KEY_ENV} is not set. The key is not in this repository and must "
            f"not be put in it (§12.1); source secret.sh and export it under this "
            f"name.")
    return key


def request(method: str, path: str, body: 'dict | None' = None, *,
            region: str, key: str, attempts: int = 6) -> dict:
    """One turbopuffer API call, retried on the failures that are worth retrying.

    A full export is tens of gigabytes over thousands of requests, so a transient
    502 must not cost the run; a 4xx that is not a rate limit is a mistake in what we
    sent and is raised at once."""
    url = f"https://{region}.turbopuffer.com{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        retry_after = None
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                raw = resp.read()
            return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            if e.code not in _RETRY_STATUS or attempt == attempts:
                raise ExportError(
                    f"{method} {path} -> HTTP {e.code}: {detail}") from None
            reason = f"HTTP {e.code}: {detail}"
            try:
                retry_after = float(e.headers.get("Retry-After", ""))
            except ValueError:
                pass
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            if attempt == attempts:
                raise ExportError(f"{method} {path} failed: {e}") from None
            reason = str(e)
        # The server's Retry-After outranks the local schedule (429 backpressure
        # names its own horizon); jitter keeps concurrent workers from thundering
        # back in lockstep.
        delay = min(2 ** attempt, 60)
        if retry_after is not None:
            delay = max(delay, min(retry_after, 300))
        delay += random.uniform(0, delay / 4)
        _log(f"{method} {path}: {reason}; retrying in {delay:.1f}s "
             f"({attempt}/{attempts - 1})")
        time.sleep(delay)
    raise AssertionError("unreachable")


# `check_theory_separator` stood here until 2026-08-26.  It asked turbopuffer,
# against a throwaway namespace on every run, whether a whitespace-only element of
# a `pre_tokenized_array` survives — the element `theory_subtokens` used to inject
# between two theory names.  `theory_subtokens` carries one name now, so there is
# no separator to keep and nothing to ask.  (The answer, for the record, was yes:
# it survived every run this export ever made.)


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------

# One request carries at most this many rows or this many bytes, whichever comes
# first.  turbopuffer allows 512 MB and 8 MiB per attribute; these are far below
# both, because a batch is also the unit a failure costs and the unit the
# checkpoint advances by.
BATCH_ROWS = 256
BATCH_BYTES = 24 << 20

# How many batches go up at once.  Measured against the live account on 2026-08-20
# with the real payload size: one request at a time gave 16.6 documents a second and
# four at a time gave 58.4, so the upload is bound by per-request latency rather than
# by bandwidth, and a full corpus goes from most of a day to a few hours.
#
# A whole group is sent, and only then is the checkpoint advanced to the group's last
# key.  That is what keeps a resumed run as correct as a serial one: batches inside a
# group finish in any order, so no single one of them means "everything up to here
# has landed", and a group that fails part way is simply re-sent whole — an upsert
# being idempotent in its document ids.
BATCH_WORKERS = 4


def iter_shippable(sessions, registry, counts) -> 'Iterator[tuple[bytes, object, list[str]]]':
    """§8.1 step 0's membership, one record at a time, in key order: exactly the
    records the export publishes, before vectors enter the picture.

    Split out of `iter_documents` because §17.1's corpus scan needs the same set —
    the filters run in one place so the scan and the export can never disagree
    about which records are published.

    Key order matters twice: it is what makes a re-run resumable from a checkpoint,
    and it is what makes two runs over the same store produce the same sequence."""
    from Isabelle_RPC_Host.universal_key import EntityKind
    from Isabelle_Semantic_Embedding.semantics import Semantic_DB
    from Isabelle_Semantic_Embedding.snapshot_sync import _ships_predicate
    ships = _ships_predicate()
    for key, raw in Semantic_DB.iter_items():
        if len(key) == 16:
            continue                              # a per-theory cost record
        if not ships(key, raw):
            # Also where the one-byte global version counter goes: `_ships` reads
            # a key shorter than a theory hash as something no artifact carries.
            counts["wip"] += 1
            continue
        counts["records"] += 1
        try:
            rec = Semantic_DB._decode(raw)
        except Exception:
            counts["undecodable"] += 1            # legacy, or not an entity at all
            continue
        if rec.kind == EntityKind.EXPERIENCE:
            counts["experience"] += 1             # step 0: never published (D24)
            continue
        theories = theories_of(key, rec, registry)
        if not all(session_of(t) in sessions for t in theories):
            counts["out of scope"] += 1
            continue
        yield key, rec, theories


def iter_documents(sessions, registry, get_vector, counts,
                   source_links: 'dict[str, str] | None',
                   positioned: 'dict[str, str]',
                   by_base: 'dict[str, list[str]]') -> 'Iterator[tuple[bytes, dict]]':
    """§8.1 steps 0 and 2 to 5, one record at a time, in key order.

    `source_links` is the composed link per document id, or None when the
    export was explicitly told to ship without links (`--no-source-links`).
    With an artefact present, a document id it does not name is an error, not
    an empty link: the artefact's records cover every published id, so absence
    means the store moved since the scan — a stale artefact must not ship as
    silently-absent links (the A3/B5 ruling, 2026-08-23).

    `positioned` and `by_base` come from the same artefact and feed
    `defining_theory_of`; both are empty under `--no-source-links`, which then
    leaves every theorem-alike record to the name fallback."""
    from Isabelle_RPC_Host.universal_key import is_xor_prefixed_key
    for key, rec, dependencies in iter_shippable(sessions, registry, counts):
        vector = get_vector(key)
        if vector is None:
            raise ExportError(f"{rec.name!r} lost its vector between the "
                              f"completeness gate and the export")
        if source_links is None:
            link = ""
        else:
            link = source_links.get(document_id(key))
            if link is None:
                raise ExportError(
                    f"{rec.name!r} is not in the source-links artefact — the "
                    f"store moved since the scan; re-run scan and map (§17)")
        theory = defining_theory_of(key, rec, dependencies, positioned, by_base,
                                    registry)
        counts["exported"] += 1
        counts["no defining theory"] += 0 if theory else 1
        # Only a theorem-alike record has constituents to show; for everything
        # else `dependencies` is the single declaring theory, which `theory`
        # already carries and the entity page says in a sentence instead.
        constituents = dependencies if is_xor_prefixed_key(key) else []
        yield key, build_document(key, rec, theory, constituents, vector, link)


def _batches(documents, rows: int, size: int):
    """Documents grouped into upsert batches, with the last key of each batch."""
    batch, batch_bytes, last = [], 0, None
    for key, doc in documents:
        batch.append(doc)
        batch_bytes += len(doc["vector"]) + len(doc["interpretation"]) + len(doc["expr"])
        last = key
        if len(batch) >= rows or batch_bytes >= size:
            yield batch, last
            batch, batch_bytes = [], 0
    if batch:
        yield batch, last


def _groups(items, size: int):
    """`items` in consecutive runs of at most `size`, order preserved."""
    group = []
    for item in items:
        group.append(item)
        if len(group) == size:
            yield group
            group = []
    if group:
        yield group


def _read_checkpoint(path: str, base: str,
                     links_digest: 'str | None') -> 'tuple[str, bytes, int] | None':
    """The unfinished run's namespace, the last key it got confirmation for and how
    many documents it had upserted by then; None when there is nothing to resume.

    An unfinished run keeps its own namespace rather than taking a fresh generation:
    the half-loaded one is what the resumed batches belong in, and allocating a new
    one would leave it behind as a stranded partial index."""
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        state = json.load(f)
    namespace = state.get("namespace", "")
    if not (namespace == base or namespace.startswith(base + "-")):
        raise ExportError(
            f"{path} is a checkpoint for {namespace!r}, which is not a generation of "
            f"{base!r} — a different Isabelle release or AFP snapshot. Delete it or "
            f"point --checkpoint elsewhere.")
    if state.get("links_digest") != links_digest:
        raise ExportError(
            f"{path} was written under a different source-links artefact — a "
            f"resume would leave every already-upserted row carrying the old "
            f"artefact's links.  Delete the checkpoint to start the namespace "
            f"over, or resume with the artefact it was started with.")
    _log(f"resuming {namespace} after {state['documents']} document(s)")
    return namespace, bytes.fromhex(state["last_key"]), int(state["documents"])


def _write_checkpoint(path: str, namespace: str, last: bytes, done: int,
                      links_digest: 'str | None') -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"namespace": namespace, "last_key": last.hex(),
                   "documents": done, "links_digest": links_digest}, f)
    os.replace(tmp, path)


def run(*, isabelle_home: str, afp_dir: str,
        vector_store: 'str | None', region: str, dump: 'str | None',
        checkpoint: str, limit: 'int | None',
        skip_gate: bool, name_override: 'str | None' = None,
        source_links_path: 'str | None' = None,
        no_source_links: bool = False) -> str:
    """§8.1 end to end.  Returns the namespace that was written."""
    import contextlib

    # The artefact is resolved FIRST — a pure local read, before the API key
    # and the namespace listing — because a missing artefact is an argument
    # error and must not cost a billed write (the A3/B5 ruling: a re-export
    # without it would erase the patched source_link column on every row;
    # shipping without links takes the explicit --no-source-links).
    if source_links_path and no_source_links:
        raise ExportError(
            "--source-links and --no-source-links contradict each other; "
            "pass exactly one")
    if source_links_path:
        import site_source_pages as ssp
        body, links_digest = ssp.load_artefact(source_links_path, "map",
                                               ssp.ARTEFACT_FORMAT)
        source_links = ssp.source_links(body)
        # The same artefact answers "which theory is this written in" (§7 as
        # rewritten 2026-08-26): both readings come off one (file, page) pair.
        positioned = ssp.positioned_theories(body)
        by_base: 'dict[str, list[str]]' = {}
        for long_name in ssp.published_theories(body):
            by_base.setdefault(long_name.rsplit(".", 1)[-1], []).append(long_name)
        _log(f"{len(source_links)} source link(s) composed from "
             f"{source_links_path} ({links_digest[:12]}); "
             f"{len(positioned)} position(s) name a theory, "
             f"{sum(len(v) for v in by_base.values())} published theory name(s)")
    elif no_source_links:
        source_links, links_digest = None, None
        positioned, by_base = {}, {}
        _log("--no-source-links: every source_link ships EMPTY — D42's absent "
             "form on every card — and every theorem-alike record falls back to "
             "its own name for a defining theory")
    else:
        raise ExportError(
            "no --source-links artefact: an export without it would erase the "
            "source_link column on every row (§17.6).  Pass the artefact, or "
            "--no-source-links to ship without links on purpose.")

    key = None if dump else api_key()

    base = namespace_base(isabelle_home, afp_dir)
    # Against the override when there is one: that is the name this run will use, and
    # checking a scratch run's checkpoint against the production base rejects it.
    resumed = None if dump else _read_checkpoint(checkpoint, name_override or base,
                                             links_digest)
    if resumed is not None:
        namespace, resume_after, done = resumed
    else:
        resume_after, done = None, 0
        if name_override:
            namespace = name_override
        elif dump:
            namespace = base          # nothing is written, so no generation is spent
        else:
            namespace = next_namespace(base, region=region, key=key)
    _log(f"namespace {namespace}")

    sessions = declared_sessions(isabelle_home, afp_dir)
    _log(f"{len(sessions)} declared session(s) in scope (D24)")
    registry = theory_registry()
    _log(f"{len(registry)} theory-hash registry entr(ies)")

    path = vector_store_path(vector_store)
    with contextlib.ExitStack() as stack:
        get_vector, dimension = vector_reader(stack, path)
        if skip_gate:
            _log("SKIPPING the completeness gate at your request (§8.1 step 1)")
        else:
            _log(f"completeness gate over {os.path.basename(path)}...")
            _log(f"  {completeness_gate(get_vector)} shippable record(s), "
                 f"every one with a vector")

        counts: 'dict[str, int]' = dict.fromkeys(
            ("records", "undecodable", "wip", "experience", "out of scope",
             "exported", "no defining theory"), 0)
        entities: 'set[bytes]' = set()
        documents = ((k, d) for k, d in iter_documents(
            sessions, registry, get_vector, counts, source_links,
            positioned, by_base)
            if entities.add(entity_of(k)) is None)
        if resume_after is not None:
            documents = ((k, d) for k, d in documents if k > resume_after)
        if limit:
            documents = itertools.islice(documents, limit)

        if dump:
            with open(dump, "w", encoding="utf-8") as f:
                for _key, doc in documents:
                    f.write(json.dumps(doc, ensure_ascii=False) + "\n")
            _log(f"wrote {counts['exported']} document(s) to {dump}")
        else:
            schema = namespace_schema(dimension)
            started, at_start = time.monotonic(), done

            def upsert(batch):
                request("POST", f"/v2/namespaces/{namespace}",
                        {"distance_metric": "cosine_distance", "schema": schema,
                         "upsert_rows": batch}, region=region, key=key)

            pool = stack.enter_context(
                concurrent.futures.ThreadPoolExecutor(BATCH_WORKERS))
            for group in _groups(_batches(documents, BATCH_ROWS, BATCH_BYTES),
                                 BATCH_WORKERS):
                list(pool.map(upsert, [b for b, _ in group]))
                done += sum(len(b) for b, _ in group)
                _write_checkpoint(checkpoint, namespace, group[-1][1], done,
                                  links_digest)
                if done % (BATCH_ROWS * BATCH_WORKERS * 10) == 0:
                    # A full corpus is tens of gigabytes over hours; a bare count says
                    # nothing about whether it is progressing or crawling.
                    elapsed = time.monotonic() - started
                    rate = (done - at_start) / elapsed
                    _log(f"  {done} document(s) upserted, {elapsed / 60:.0f} min, "
                         f"{rate:.0f}/s")
            _log(f"upserted {done} document(s) into {namespace}")

    for what, n in counts.items():
        _log(f"  {what:<14} {n}")
    if not dump and not limit:
        # §8.1's final report: what RELEASE.md step 8 pastes into wrangler.toml
        # [vars], in the same commit as TPUF_NAMESPACE.  ROWS is the record
        # count (§6.3c's denominator); ENTITIES is the D5-collapsed display
        # number; step 10's probe asserts the deployed pages agree.
        built = time.strftime("%Y-%m-%d", time.gmtime())
        _log("REPORT — paste into worker/wrangler.toml [vars] (RELEASE step 8):")
        _log(f'  TPUF_NAMESPACE = "{namespace}"')
        _log(f'  ROWS = "{done}"')
        _log(f'  ENTITIES = "{len(entities)}"')
        _log(f'  BUILT = "{built}"')
    return namespace


def _default_trees() -> 'tuple[str, str]':
    """The Isabelle distribution and the AFP snapshot, from Isabelle's own settings.

    `AFP` points at the snapshot's `thys` directory — it is what the stored entity
    positions abbreviate as `$AFP` — so D24's tree is its parent."""
    from Isabelle_RPC_Host.paths import resolve_isabelle_var
    home = resolve_isabelle_var("ISABELLE_HOME")
    afp = resolve_isabelle_var("AFP")
    if not home or not afp:
        raise ExportError(
            "cannot locate Isabelle and the AFP: ISABELLE_HOME and AFP are both "
            "needed, from the environment or from `isabelle getenv`")
    return home, os.path.dirname(os.path.normpath(afp))


def build_parser(**kw) -> argparse.ArgumentParser:
    """THE option set, stated once.  `isabelle_semantics.py` adopts this parser as its
    `site-export` subparser's parent, so the two ways in cannot drift."""
    p = argparse.ArgumentParser(
        prog="python src/site_export.py",
        description="Export the semantic DB into a turbopuffer namespace (§8).",
        **kw)
    p.add_argument("--isabelle-home", help="the distribution tree (default: $ISABELLE_HOME)")
    p.add_argument("--afp", help="the AFP snapshot tree (default: the parent of $AFP)")
    p.add_argument("--vector-store", help="the vector store to publish from")
    p.add_argument("--source-links", metavar="ARTEFACT",
                   help="§17's artefact; each row's source_link is composed "
                        "from it (required unless --no-source-links)")
    p.add_argument("--no-source-links", action="store_true",
                   help="ship every source_link empty, on purpose — a "
                        "re-export without the artefact would otherwise "
                        "erase the patched column")
    p.add_argument("--region", default=DEFAULT_REGION)
    p.add_argument("--namespace", help="write into this namespace instead of the "
                                       "next free generation; for a live smoke test")
    p.add_argument("--dump", metavar="PATH",
                   help="write the documents as JSON lines instead of upserting; "
                        "touches no network and needs no key")
    p.add_argument("--checkpoint", default="site-export.checkpoint.json",
                   help="where to record upsert progress, so a re-run continues "
                        "instead of starting over")
    p.add_argument("--limit", type=int, help="stop after this many documents")
    p.add_argument("--skip-completeness-gate", action="store_true",
                   help="do not check that every shippable record has a vector; "
                        "for a --limit run, never for a real export")
    return p


def run_from_args(args: argparse.Namespace) -> int:
    """The body both entry points share: locate the trees, run, report a failure."""
    try:
        home, afp = args.isabelle_home, args.afp
        if not (home and afp):
            found_home, found_afp = _default_trees()
            home, afp = home or found_home, afp or found_afp
        run(isabelle_home=home, afp_dir=afp,
            vector_store=args.vector_store,
            region=args.region, dump=args.dump,
            checkpoint=args.checkpoint,
            limit=args.limit,
            skip_gate=args.skip_completeness_gate, name_override=args.namespace,
            source_links_path=args.source_links,
            no_source_links=args.no_source_links)
    except ExportError as e:
        print(f"[site-export] {e}", file=sys.stderr)
        return 1
    return 0


def main(argv: 'list[str] | None' = None) -> int:
    return run_from_args(build_parser().parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
