# Releasing isasearch

**What a release is.** Everything a visitor sees comes from three things that must
agree with one another: a **turbopuffer namespace** (the search index), a
**published tree** of rendered Isabelle source pages in an R2 bucket, and a
**Cloudflare Worker** that reads both. A release is one pass that rebuilds all
three from the current semantic DB and switches the site onto them.

The order below is chosen to keep the visible window as small as it can be made,
not to eliminate it: the R2 bucket has no staging area, so step 5 writes the new
source pages into the very prefix the live site is already serving. What that
costs, and how it is kept harmless, is spelled out in step 5. Nothing else about
the release is visible until step 8 flips the Worker.

**What this document is.** The order, the exact commands, and what each step is
protecting. It is not the design: `SEMANTIC_SEARCH_SITE_PLAN.md` says *why* every
step exists and is the authority whenever the two disagree — this file only says
which key to turn, when, and what should come out. Decisions are cited as `D46`,
`D53` and so on, and sections as `§8.2`; both live in that plan.

**Read this first if you are new to the pipeline.** The five commands below
(`scan`, `map`, `publish`, `gate`, then the site export) are not five independent
jobs. They pass one artefact between them — the **file→page map** — and almost
every way a release goes wrong is a step reading an artefact that describes a
different corpus or a different tree from the one actually in play. The gates exist
to catch exactly that. **A gate that fails is doing its job.** For the link-check
`gate` (steps 4 and 7) the one supported way to move a baseline is
`gate --update-counters`, and its diff is reviewed by a human before it is
committed; nothing else about a failing link-check gate is negotiable. Step 7b's
launch gate is the one exception in this document, and a deliberate one: it
*measures* two numbers the design rests on, so a miss there is a design input
that may legitimately move a knob. Step 7b says which two and what to do.

**Two standing hazards, before anything else.** They are explained where they bite,
but they decide how carefully you move, so they are named here:

1. **Step 5 writes into the prefix the live site is serving**, and its dry run
   is not optional — a truncated or failed dry run reads exactly like "nothing
   needs copying". The commands were first run in this form against a
   populated bucket on 2026-08-27 (12 of 11,750 files changed); before that
   they had only ever faced an empty one.
2. **Step 11 deletes namespaces permanently**, and the names are recycled, so the
   wrong one looks plausible. It wants a second pair of eyes.

**If you have done this before**, the tick-list immediately below is the whole
procedure in one screen; everything after it is the detail behind each line.

**One release at a time.** Two concurrent releases would allocate the same
namespace generation number, write the same published tree, and race on the same
checkpoint files. There is no lock enforcing this. Say out loud that you are
starting one.

---

## The checklist

Six things this checklist cannot compress. Read them once before using it:

- **One release at a time.** Nothing enforces it.
- **Nothing may add or change records in the semantic DB from step 1 until step 6
  finishes**, or the export dies hours in and steps 1–5 are all re-run.
  Precondition 8's vector backfill is the one exception: it writes vectors, not
  records.
- **`$WORK` is never `/tmp`.**
- **`$TODAY` is fixed once and re-entered literally.** A release can cross
  midnight, and a stale value prunes R2 to an older tree.
- **Step 5 writes into the prefix the live site is serving.**
- **Step 11 deletes namespaces permanently.**

```
[ ]  0  right host, toolchain (Isabelle on PATH too), ~5 GB free, DB quiet,
        keys set (all six), tree clean, tests green, EVERY shippable record has a
        vector; set $WORK and $TODAY and write $TODAY down; RECORD the deployed
        version, the current TPUF_NAMESPACE, and the previous published-tree
        directory; schema change?
        (a schema change is never a code-only release)
[ ]  1  scan                       ~30 s   → RECORD BOTH numbers: the counts
        block's `records`, and the final line's N record(s)
[ ]  2  map                        ~8 s      → RECORD the content hash
[ ] 2b  OPTIONAL rehearsal, ~10 min: a --limit smoke test into a scratch
        namespace; delete that namespace and restore worker/.dev.vars
[ ]  3  publish -> published.<date>          → KEEP the previous tree until the
                                               NEXT release: source-page rollback
[ ]  4  gate (tree)                          → three counters unchanged, or STOP
[ ]  5  prove the prefix with rclone lsf (cheap, read-only, do it FIRST);
        rclone dry run TO A FILE (never | head), read both summaries;
        rclone COPY (never sync here) → check --one-way = 0 differences,
        then prove the prefix again — check cannot catch a wrong one
[ ]  6  site export, detached, python -u + set -o pipefail + tee ~3 h 36 m+
        → RECORD the namespace AND the final REPORT block (ROWS/ENTITIES/BUILT)
        (may overlap 3-5; step 5 must be done before step 8)
[ ]  7  gate --namespace --sample 1000       → exit 0
[ ] 7b  the raw-text sweep (§6.3c): node worker/probe/launch_gate.mjs,
        needs TPUF_NAMESPACE and ROWS
        → exit 0 blocks on: kNN certificate, no uncaught under-fill, fallback
          kNN inside 15 s, empty-value behaviour, score parity
        → ANN∩kNN set overlap is RECORDED, not enforced (see the step)
        → KEEP its JSON record for the release log
[ ]  8  wrangler.toml: TPUF_NAMESPACE + ROWS + ENTITIES + BUILT, all four from
        step 6's REPORT, ONE commit; wrangler deploy                (human)
        → only after 6 finished, or searches serve a half-loaded index
        → then curl /api/search: 200 before you purge anything
[ ]  9  purge the zone cache (whole zone - conda.qiyuan.me too),
        confirm MISS->HIT                                          (human)
[ ] 10  live acceptance, AFTER the purge (private window or curl): /, /about,
        an entity page, a source link, CoreC++, the rate limit, BOTH count-router
        checks through /api/search, live_probe.mjs
[ ] 11  APPEND TO THE RELEASE LOG FIRST (namespace, artefact hash, Worker
        version, COMMIT SHA, tree directory, every figure observed, the step-5
        rclone invocation you actually ran, step 7b's JSON record, step 6's
        REPORT block) - the order releases happened in is recorded NOWHERE else.
        THEN, IRREVERSIBLE: delete by NAME, never by generation number -
        everything older than the two you keep, plus abandoned runs (the release
        log names the real generations) and the legacy .asset companions of
        retired namespaces; guards in the script, second person confirms.
        Then prune R2 (sync, read the deletions, purge again - human), drop the
        tree two releases old, restore worker/.dev.vars if 2b touched it,
        restart whatever precondition 3 made you stop, copy artefacts into
        pipeline/, commit, push to origin
```

If the site is broken at any point, stop and go to **Rollback**, which sits just
before the steps and names three traps that make the obvious fix the wrong one.

Each line above is one step below, in order.

---

## Vocabulary

The plan's glossary (§1) is authoritative. These are the terms this document leans
on, restated so the steps can be read on their own.

- **The semantic DB** — the LMDB store of Isabelle entities and their English
  interpretations, at `~/.cache/Isabelle_Semantic_Embedding/` (or `$SEMANTIC_DB_DIR`).
  It is the input to the scan and to the site export, and both find it through the
  installed `Isabelle_Semantic_Embedding` package, not through a command-line path.
- **Entity** — one record in the semantic DB: a constant, type, class, locale,
  proof method, theorem collection, theorem, or derived rule. The unit everything is
  counted in.
- **Position** — the `(file, line)` pair recording where an entity was declared,
  with the file spelled symbolically (`$AFP/…`, `~~/…`). A **position file** is a
  file some position names. The scan calls one **linkable** when its symbolic prefix is
  one the pipeline can follow; whether it truly resolves to a published page is the
  map's verdict, not the scan's — which is why step 1's count and step 2's are
  different numbers.
- **Shippable** — the predicate `snapshot_sync._ships`, which the export imports
  rather than restates: the persistent records, excluding work-in-progress keys. It
  is the scope of the export's completeness gate.
- **The rendered tree** — `~/.isabelle/Isabelle2025-2/browser_info/`, exactly as
  `isabelle build -o browser_info` left it. Read-only input, never modified here.
- **The published tree** — the output of the `publish` step, and what goes to R2
  verbatim. Each theory becomes one page served at the URL
  `/source/<theory long name>.html`, with references rewritten and line marks
  (`id="L<n>"`) injected. **That URL is not the directory layout**: on disk those
  pages sit at the tree's *root*, beside `_aux/` (pages for Isabelle/ML files),
  `fonts/`, a generated `index.html`, `isabelle.css` and the run's
  `publish-report.json`. There is no `source/` directory inside the tree; the `source/`
  in the URL is supplied by the R2 key prefix (step 5).
- **The file→page map**, called **the artefact** throughout: one sealed JSON file
  carrying two tables — for every position file, which published page renders it (about
  9,800 entries), and for every entity, a `(document id, file, line)` triple — about
  1.34 M — from which the finished link, or the empty string, is composed on read. Both matter later: the first is what `publish` walks, the second is what step
  7's row count is against. Every later step re-checks its content hash. It is the input
  to `publish`, to both `gate` runs, and to the site export.
- **The artefact's content hash** — the sha256 of the artefact's body, which every
  later step re-checks. Logs print its **first 12 hex digits**, both in the map's
  `wrote … (content hash …)` line and in the export's, so the two are compared as
  written. One value, three names: the map calls it a content hash, the
  export calls it `links_digest`, and step 11's release log calls it the
  artefact hash.
- **The corpus scan**, or **the scan**: the positions read out of the semantic DB.
  Input to the map.
- **The vector store** — the LMDB of embedding vectors beside the semantic DB. It
  is a lazy cache: a missing vector is legal in ordinary operation and is filled on
  demand, which is why the export checks for holes instead of assuming there are
  none.
- **The site export** — the batch job that turns the semantic DB into a turbopuffer
  namespace. Never call it "publish"; in this repository `publish` is the
  source-tree step above.
- **The tokenizer, the asset and the sentinel — retired 2026-08-26.** Conditions
  are regular expressions over the raw text columns (plan §13 Q14), so there is no
  tokenizer, no `site/tokenizer/asset.json`, no D46 component guard and no
  `<namespace>.asset` companion. What the pages print — the entity count and the
  build date — comes from `worker/wrangler.toml [vars]`: `ENTITIES` and `BUILT`
  are displayed, and `ROWS` beside them is the count router's denominator and is
  never displayed. All three are pasted from the export's final REPORT in step 8
  and asserted by step 10's probe. Namespaces from before this ruling still have `.asset` companions
  on the account; step 11 deletes each one alongside its data namespace.
- **`upstream`** — the JSON error code the Worker returns with HTTP 502 when
  turbopuffer or Fireworks fails or times out past the retry table:
  `{"error":{"code":"upstream"}}`. It is what a whole site outage looks like from
  the outside. (A timed-out search that carries a regex condition returns
  `regex_timeout` instead — that one is the visitor's pattern, not an outage.)
- **The generation number** — the `-N` suffix in a namespace name. Every export
  writes a new namespace: `isasearch-2025-2-afp-2026-05-13`, then `-2`, then `-3`.
  The export picks the lowest free one by listing the account. This file always says
  "generation number" and never bare "generation", because the data has generations
  of its own:
- **A corpus generation** — one coherent set of {semantic DB, rendered tree,
  `data/theories.json`}, all produced from the same Isabelle build. Mixing two
  corpus generations is the failure the map step's staleness gates exist to catch.
- **The universal key** — an entity's key in the semantic DB, and the address of its
  page: `/entity/<the key, base64url without padding>`. There is no way to compose one
  by hand; take it from a result card.
- **The super-repo** — the MLML repository this one sits inside,
  `~/Current/MLML`. It owns `data/theories.json` and the two files every shell in
  this document sources: `envir.sh`, which puts the Isabelle distribution on
  `PATH`, and `secret.sh`, which sets the keys. Neither is committed to *this*
  repository and `secret.sh` is committed nowhere.

---

## Who runs what

Two people are involved, and the split is not about seniority — it is that an
assistant's classifier refuses a specific class of command.

**A human runs these, always:**

- `npx wrangler@4 deploy` and any `wrangler secret put` — anything that changes what is
  deployed. (`wrangler rollback` is human-only too, but no step of this release calls
  for it: see trap 2 in *Rollback*, where it is the wrong lever.)
- minting or rotating a Cloudflare API token;
- purging the zone cache from the dashboard (step 9, and again in step 11 if the
  prune deletes anything).

**Everything else** — every `python`, `node`, `rclone` and read-only `wrangler`
command in this file — can be run by either. `wrangler deployments list` is
read-only and is not blocked.

An assistant driving a release prepares the exact command line for a blocked step,
hands it over, and waits. In a Claude Code session the human runs it by typing
`! <command>` so the output lands back in the conversation.

## Preconditions

Everything from here on, preconditions included, runs from the repository root in a
shell that has sourced both the environment and the keys:

```bash
cd ~/Current/MLML/contrib/isasearch-web
source ~/Current/MLML/envir.sh     # puts Isabelle on PATH — see precondition 2
source ~/Current/MLML/secret.sh    # the keys
```

**Both lines, every shell.** `envir.sh` is not decoration: without it the very
first command of the release dies (precondition 2 says why, and which steps
care).

The commands below assume **zsh or bash**. Precondition 5's loop avoids bash's `${!v}`
indirect expansion, which zsh rejects, so it runs under either.

1. **The right host.** Scan, map, publish, gate and export all run on the machine
   that holds *both* the semantic DB that will be exported and the rendered tree
   (§17.1). Today that is this workstation. Confirm it:

   ```bash
   ls -d ~/.isabelle/Isabelle2025-2/browser_info ~/.cache/Isabelle_Semantic_Embedding
   ```

   If either is missing you are on the wrong machine, and nothing below applies.

2. **The toolchain.** `python` must be the super-repo's virtualenv
   (`~/Current/MLML/.venv/bin/python`), which is where `Isabelle_Semantic_Embedding`
   is installed editable. There is no separate activation step in this repository —
   check it rather than assume it:

   ```bash
   python -c 'import sys, Isabelle_Semantic_Embedding as m; print(sys.prefix, m.__file__)'
   node --version && rclone version | head -1
   command -v isabelle || echo 'ISABELLE NOT ON PATH — source envir.sh'
   ```

   **Isabelle must be on `PATH`** — that is what `source ~/Current/MLML/envir.sh`
   is for. The scan and the export find the distribution and the AFP through
   `ISABELLE_HOME` and `AFP`, falling back to `isabelle getenv`; with neither
   they refuse to start: `cannot locate Isabelle and the AFP`. Measured
   2026-08-27, only **steps 1, 2b and 6** need it — steps 2, 3, 4 and 7 do not.

   If `sys.prefix` is not that venv, the shell's initialisation has not put it on
   `PATH`: either fix that, or prefix every `python` below with
   `~/Current/MLML/.venv/bin/python`. If the import fails, the package is not installed
   editable and nothing downstream will work.

   Node 20 and rclone 1.60 are what this has been run with — recorded so a future
   failure can be compared against them, not as minimum versions.
   `worker/node_modules` is only needed for `wrangler`, which `npx wrangler@4` fetches.

3. **Nothing writes the semantic DB during the release.** The scan records which
   entities exist; the site export refuses any entity the scan did not see. A
   collection or embedding run finishing halfway through therefore invalidates the
   artefact and stops the export — hours in. There is no lock: stop any RPC host,
   REPL server or collection job first, and do not start one until step 6 is done.

   **The one deliberate exception is precondition 8's vector backfill**, and it
   is safe for a reason stated there: it writes vectors, never records. Read
   precondition 8 before concluding that this rule forbids it.

   ```bash
   lsof +D ~/.cache/Isabelle_Semantic_Embedding 2>/dev/null | grep -iv 'cwd\|zsh'
   ```

   **Nothing but the `COMMAND PID …` header line, or no output at all, is the pass.**
   Both are normal: `lsof +D` prints no header when it matches nothing. Any other line
   names a process to stop. If you get no output, satisfy yourself that `lsof` is
   installed (`command -v lsof`) — an absent tool looks identical to a quiet
   directory.

4. **`data/theories.json` is same-corpus-generation with the rendered tree.** You
   do not have to verify this: the map step hard-fails on each staleness symptom.
   But know what the fix is before you need it — see *When something fails*.

5. **Keys.** `source ~/Current/MLML/secret.sh`. Nothing is ever committed. The
   variable names are exactly as spelled here, including the lower-case
   `turbopuffer_` prefix on two of them:

   | Used by | Command-line variable | Value from `secret.sh` |
   | --- | --- | --- |
   | site export, namespace deletion (**write**) | `TURBOPUFFER_API_KEY` | `$turbopuffer_DEV_KEY` |
   | `gate --namespace`, `launch_gate.mjs`, `live_probe.mjs` (**read**) | `TURBOPUFFER_API_KEY` | `$turbopuffer_ISASEARCH_READ_KEY` |
   | `launch_gate.mjs`, `live_probe.mjs` | `FIREWORKS_API_KEY` | `$EMBEDDING_API_KEY` |
   | precondition 8's vector backfill | `EMBEDDING_API_KEY` | itself — the embedding driver reads this name directly, so sourcing `secret.sh` is all it needs |
   | R2 upload | `RCLONE_CONFIG_R2_ACCESS_KEY_ID` / `…_SECRET_ACCESS_KEY` | `$R2_ISASEARCH_ACCESS_KEY_ID` / `$R2_ISASEARCH_SECRET_ACCESS_KEY` |
   | `wrangler deploy` | `CLOUDFLARE_API_TOKEN` | `$CLOUDFLARE_API_TOKEN` — the least-privilege `isasearch-deploy` token, already in `secret.sh`, so sourcing it is enough |

   `turbopuffer_DEV_KEY` is the account's full-access key and is what every write to
   turbopuffer has ever used; the name is historical, not a warning. The key the
   *Worker* holds in production is the read-only one, verified to 403 on writes.
   Check the names resolve before starting, without printing values:

   ```bash
   for v in turbopuffer_DEV_KEY turbopuffer_ISASEARCH_READ_KEY EMBEDDING_API_KEY \
            R2_ISASEARCH_ACCESS_KEY_ID R2_ISASEARCH_SECRET_ACCESS_KEY \
            CLOUDFLARE_API_TOKEN; do
     printf '%-32s %s\n' "$v" "$(eval "printf '%s' \"\${$v:+set}\"")"
   done
   ```

   All six must print `set`. (The `eval` is not decoration: bash's `${!v}` indirect
   expansion is a syntax error in zsh, which is this machine's shell.)

   **One name, two values.** `TURBOPUFFER_API_KEY` is set per-command from *different*
   secrets — the write key for steps 2b, 6 and 11, the read key for steps 7, 7b and 10.
   Do not export it once for the session; every command below that needs it sets it
   on its own line, and that is deliberate.

6. **The working tree is clean and the tests pass.**

   ```bash
   test -z "$(git status --porcelain)" || echo 'WORKING TREE DIRTY — resolve first'
   python -m pytest tests/ -q && node --test worker/test
   ```

   `git status --short` on its own exits 0 whether or not the tree is dirty, so it
   cannot be chained with `&&`; the form above actually says something.

7. **Disk.** ~5 GB free for the new published tree. At peak three trees coexist — the
   new one, the one it replaces (the rollback), and the one two releases old that step
   11 deletes — so budget ~15 GB of occupancy overall. The export streams to the
   network and stages nothing large on disk.

8. **Every shippable record has a vector**, or step 6 refuses to export.

   Step 6's completeness gate fails the release on any shippable record without
   a vector. It is right to fail and must never be skipped — but it runs *after*
   steps 1-5, so meeting it there burns their wall-clock for nothing. Ask now:
   two to four minutes, Isabelle on `PATH` as for the scan, and written as one
   line so that pasting it at any indentation is safe.

   ```bash
   python -c "import sys,contextlib;sys.path.insert(0,'src');import site_export as se;reg=se.theory_registry();sess=se.declared_sessions(*se._default_trees());c=dict.fromkeys(('records','undecodable','wip','experience','out of scope'),0);st=contextlib.ExitStack();get,_d=se.vector_reader(st,se.vector_store_path());m=sum(1 for k,r,dep in se.iter_shippable(sess,reg,c) if get(k) is None);print(m,'shippable record(s) with no vector;',c['records'],'records seen')"
   ```

   It prints two numbers: how many shippable records lack a vector, and how many
   it saw. **Anything but zero on the first** means fix it before step 1, with
   the offline, incremental backfill below.

   ```bash
   python ~/Current/MLML/contrib/Semantic_Embedding/Isabelle_Semantic_Embedding/isabelle_semantics.py \
     embed --yes Qwen/Qwen3-Embedding-8B
   ```

   The model argument is the canonical HuggingFace name, read off the vector
   store's directory: `vector_Qwen__Qwen3-Embedding-8B.lmdb` →
   `Qwen/Qwen3-Embedding-8B`. It authenticates with `EMBEDDING_API_KEY`, so
   sourcing `secret.sh` is all it needs, and it does not need Isabelle. Re-run
   the probe afterwards and require zero.

   **It does not breach precondition 3**, which protects the *record set*: the
   backfill writes only the vector store — a lazy cache, beside the DB — and
   adds or changes no record.

   **If step 6's gate catches you anyway**, the backfill is still the fix and
   steps 1-5 stand — but only if the record set has not moved, and missing
   vectors alone do not tell you that. Records collected after the scan also
   arrive without vectors, and that is a precondition-3 breach reported in these
   same words. The gate's own message settles it, with nothing to re-run: it
   reads `<n> of <m> shippable records have no vector`, and that **`<m>` is the
   same quantity as step 1's counts-block `records`**. Equal means the record
   set is where the scan left it — delete nothing, re-run step 6 alone. Larger
   means records moved under you: follow "The export stops on a document id the
   artefact does not name" in *When something fails* instead. The artefact hash
   settles nothing here; it only says you handed the export the same file.

   Measured 2026-08-27: 5,119 records without vectors, 5,373 embedded (the
   backfill's scope is slightly wider), 1,124,538 tokens, minutes, cents. The
   failed attempt created no namespace and wrote no checkpoint — the gates do
   run before any billed write — so that day's log holds two attempts and two
   `namespace` lines, which is why step 6 says to read the last one.

---

## What blocks what

```
   scan ──> map ──┬──> publish ──> gate (tree) ──> upload to R2 ──┐
                  │                                              │
                  └───────────────> site export ─────────────────┴──> deploy
                                          │                            │
                                          └──> gate (namespace sample) ┘
                                                 (also reads the published tree)
```

The two branches off `map` are genuinely independent and **may be run
concurrently** — the export takes about 3½ hours and the tree branch does not
touch turbopuffer, so overlapping them takes the tree branch off the clock
entirely (about 37 minutes — see *How long it takes*). The numbered
steps below are written in series because that is easier to follow when something
goes wrong; if you overlap them, the binding rule is the one stated below: **step 5
must be complete before step 8**. Finishing it before the export finishes is the easy
way to be sure.

Four ordering rules, each with a real failure behind it:

- **The export needs the artefact**, and refuses to run without it: an export
  without it would ship every `source_link` empty (§17.6). `--no-source-links` is
  the explicit, deliberate opt-out and is not part of a normal release.
- **Upload the tree before the Worker is deployed.** Every `source_link` the export
  composes names a page in the published tree, and the moment step 8 makes that
  namespace live, every one of those links must resolve. Putting the upload before the
  export *finishes* is the simple way to guarantee it, and it leaves slack for step 7,
  which checks the links against the local tree and would not notice an empty bucket.
- **Deploy the Worker only after the export finishes.** Nothing refuses a
  half-loaded namespace any more (the sentinel that used to is deleted): a Worker
  pointed at one simply serves an index with holes, and `ROWS` — §6.3c's
  denominator, pasted from the export's final REPORT — does not exist until the
  run completes. The row-count check in step 7 is what stands between an
  interrupted export and a deploy.
- **Switch `TPUF_NAMESPACE` and deploy in one act, with its three numbers.** The
  namespace name is the Worker's only pointer at the data; there is no alias to
  flip. `ROWS`/`ENTITIES`/`BUILT` describe that namespace and move with it in the
  same commit (§8.2) — a mismatched `ROWS` misroutes the count router silently,
  which is why step 10's probe asserts the deployed values.

## How long it takes

| Step | Measured | When |
| --- | --- | --- |
| 1 scan | 30 s | 2026-08-26 |
| 2 map | 7.6 s | 2026-08-26 |
| 3 publish | 14 m 32 s | 2026-08-27 |
| 4 gate (tree) | 14 m 08 s, walking 15,970,528 references | 2026-08-27 |
| 5 upload to R2 | 8 m 48 s — **but see the caveat below** | 2026-08-27 |
| 6 site export | 3 h 36 m at ~103 documents/s, ~29 GB uploaded, over 1,337,025 documents — a **floor**, since the corpus has grown since | 2026-08-20 |
| 7 gate (namespace) | minutes | |
| 8–11 | minutes, plus whatever the acceptance click-through takes | |

**The upload figure does not generalise, and must not be read as one.** On
2026-08-27 only **12 of 11,750 files had changed**; the other 11,738 were
byte-identical, so rclone merely refreshed their modification times. 8 m 48 s
is the cost of that metadata pass over an unchanged tree. A release in which
the rendered tree genuinely moves uploads gigabytes: the 2026-08-24 run moved
the full 5.0 GiB. Whichever case you are in, the dry run in step 5 tells you
before you commit to it.

**A release is therefore at least the export's 3 h 36 m.** Steps 3, 4 and 5 in
series added about 37 minutes on 2026-08-27, with the caveat above on step 5.
Overlapping them with the export — the two branches off the map are genuinely
independent — bounds the whole thing at roughly the export alone. The export's
own figure is the one that moves: it is a floor, the corpus grows, and
throughput is not steady (see step 6). Do not promise anyone a finish time.

## Rollback — read this before you start

The three pieces roll back **almost** independently — three couplings matter, and all
three are spelled out under the table. Know which lever is which *before* you need it.

| Symptom | Broken piece | How to undo it |
| --- | --- | --- |
| Every search returns `upstream` 502 | The Worker cannot reach or use the namespace it points at (bad namespace name, bad `[vars]`, an upstream outage) | Put the previous namespace name AND its `ROWS`/`ENTITIES`/`BUILT` back in `wrangler.toml` and deploy — reverting step 8's commit is the reliable way. Seconds. **Traps 1 and 3 both apply.** |
| Searches work, results wrong or entities missing | The index | Same: revert step 8's commit, deploy. Seconds. **Traps 1 and 3 both apply.** |
| Search works, source links 404 or land on the wrong line | The published tree | Re-upload the previous tree with **`sync`, not `copy`**, so pages only the new tree has are removed — step 11's prune shows the two-command shape, and the `--dry-run` pass is not optional here either. Needs step 5's six `RCLONE_*` exports. Then purge the zone cache. ~5 GB, so minutes, not seconds. |
| Pages render wrong, search results fine | Worker code | Revert the code commits only, keeping this release's `wrangler.toml` `[vars]`, then deploy. Trap 2 has the recipe, and says why `wrangler rollback` is wrong here. |

**Every row above ends with a zone-cache purge** (step 9's procedure — human-only).
Entity pages are edge-cached four hours and source pages thirty days, so without it the
rollback appears not to work and you will chase a fix that has already landed.

Two things to have ready, because you will not want to hunt for them mid-incident: the
previous release's **namespace name and published-tree directory** (both in the release
log), and **all six of step 5's `export RCLONE_…` lines** — including
`RCLONE_S3_NO_CHECK_BUCKET=true`, which is not spelled `RCLONE_CONFIG_R2_*` and whose
absence produces a 403 that reads like a permissions failure.

**Trap 1: a namespace rollback does not roll the published tree back.** Step 5 has
already overwritten `source/` with this release's pages, whose line marks come from
this release's artefact — and after step 11's prune, pages the new tree does not have
are gone from R2 entirely. Restoring the previous index alone therefore leaves it
composing links against marks that have moved. Across a corpus generation, rows 1 and
2 must be paired with row 3.

**Trap 2, and why the pieces are not fully independent: `TPUF_NAMESPACE` rides inside
the Worker.** It is a `[vars]` entry in `worker/wrangler.toml`, committed
and deployed as part of the same Worker version as the code. So `wrangler rollback`,
or redeploying the previous commit, silently reverts the namespace pointer along with
the code — undoing step 8's switch. That is why the code row above says to redeploy
the previous code *keeping the current* `TPUF_NAMESPACE`, and why a cosmetic rendering
bug must not be fixed with a version rollback. The recipe, keeping this release's
data pointer and its numbers:

```bash
git revert --no-commit CODE_COMMITS      # NOT step 8's wrangler.toml commit
git show HEAD:worker/wrangler.toml > worker/wrangler.toml   # keep the namespace
git add worker/wrangler.toml                                # AND stage it
git commit -m "Revert <what>; keep this release's namespace and [vars]"
(cd worker && source ~/Current/MLML/secret.sh && npx wrangler@4 deploy)
```

**The `git add` is not optional.** `git revert --no-commit` stages its inverse
in the index, so if any reverted commit touched `worker/wrangler.toml` — the
only reason this recipe exists — the index already holds the reverted `[vars]`.
The redirect rewrites the working tree only; without staging it, the plain
`git commit` commits the index and takes `TPUF_NAMESPACE` back with it, which is
exactly what this trap exists to prevent. The deploy would still be right, and
the recorded sha would not describe it — step 11's last check would then fire.

**`git show … > …` rather than `git checkout HEAD -- …`** on purpose: this is a
shared working tree, and the repository's standing rules forbid `git checkout`
because it discards other people's uncommitted work without saying so.

**Trap 3: a namespace rollback across a schema epoch must take the Worker code
with it.** The regex-era Worker compiles every condition to a `Regex` filter, and
a pre-regex namespace 400s any filter naming a non-regex column (measured
2026-08-26) — so pointing the new code at the old namespace breaks every
conditioned search, and the old code against the new namespace breaks the same
way in reverse (it asks for `*_subtokens` columns the new namespace lacks).
Across such a release, a rollback is the **whole release's commits in one
revert-and-deploy** — code, `wrangler.toml` line and `[vars]` numbers together —
never the namespace pointer alone. Within one schema epoch (a data refresh), the
pointer plus its three numbers suffice.

What this asks of you: **keep the previous published tree on disk until the _next_
release** — step 11 deletes the tree two releases old, never the one you just
replaced — and **do not delete the namespace you just replaced**. There is no rollback
for a deleted namespace.

---

## The steps

Unless a step says otherwise, the working directory is the repository root and the
environment is the one set up here:

```bash
cd ~/Current/MLML/contrib/isasearch-web
source ~/Current/MLML/envir.sh                 # Isabelle on PATH — steps 1, 2b
source ~/Current/MLML/secret.sh                # and 6 die without it
WORK=~/isasearch-pipeline && mkdir -p $WORK    # durable; NEVER /tmp, which is
                                               # memory-backed on this machine
TODAY=$(date +%Y%m%d)      # fix this ONCE; reuse the literal value everywhere
```

**`$TODAY` names this release's files in steps 1–7 and 11, and a release runs for at
least three and a half hours**, so it can cross midnight. Set it once, write the value
down, and re-enter it literally in any new shell — never re-evaluate `$(date)`
mid-release. A stale `$TODAY` in step 11's prune would sync R2 down to an older tree.

### 0. Preflight

Run the precondition checks above, then establish two things:

**What is deployed right now, and what shipped last time.** The release log
`pipeline/HANDOVER-review3.md` — this project's running release log, despite a name
it acquired during a review round and kept — records the previous release's **commit
sha**, Worker version, namespace and published-tree directory. You need the commit
sha, because everything below that asks "did X change since the last release?" means
"since that commit":

```bash
less pipeline/HANDOVER-review3.md            # the previous release's block is at
                                             # the END; page it rather than guess -n
(cd worker && npx wrangler@4 deployments list | tail -30)   # newest is LAST
LAST=abc1234                                   # the sha from the release log
git log --oneline $LAST..HEAD                  # everything this release ships
grep TPUF_NAMESPACE worker/wrangler.toml       # the live namespace, BEFORE you edit it
```

**Three values must be in hand before step 1, and this is a pass/fail, not a note.**
All three are what a rollback or step 11 will ask for, hours from now, under pressure:

| Value | Where | If the log does not have it |
| --- | --- | --- |
| the deployed **version id** | `deployments list` | the log; else accept that a code rollback means redeploying a commit rather than naming a version |
| the live **namespace name** | `worker/wrangler.toml` — authoritative, and better than the log | — it is always there |
| the previous **published-tree directory** | the log | `ls -d published*`, then identify the live one by `rclone check <candidate> R2:isasearch/source --one-way`: the tree that reports 0 differences is what R2 is serving |

`deployments list` does not print `[vars]`, so the namespace is not recoverable from
it — read `wrangler.toml` for that, before step 8 edits it. **If you cannot establish
the published-tree directory, stop and find it**: without it there is no source-page
rollback, and step 11 cannot tell which tree is safe to delete.

If the log has no commit sha — releases before this document was written did not
record one — fall back to the Worker version's date and read `git log --since`. Then
**record the sha this time**, in step 11, so the next release does not have this
problem.

From that diff, answer the two questions that decide the shape of the release. Both
have a mechanical test, and both have a backstop that catches you if you answer wrong:

```bash
# Did the namespace schema change?  Read the whole diff of this file: the column list
# is in `namespace_schema`, and `SOURCE_LINK_SCHEMA` is a module constant beside it
# (shared with `patch`), so grepping for the function name alone would miss one of
# the two places a column can change shape.
git diff $LAST..HEAD -- src/site_export.py
```

A schema change means the full pass and never a code-only release (see *Smaller
releases*); its backstop is brutal — a Worker asking for a column the namespace lacks,
or filtering one that lacks `regex: true`, 400s every conditioned search.

(The second question this step used to ask — did the tokenizer change? — retired
2026-08-26 with the tokenizer itself; there is no gate to run and no
`--asset-change-intended` to prepare.)

*Protects against:* releasing an unknown commit.

### 1. The corpus scan (§17.1)

```bash
python src/site_source_pages.py scan --out $WORK/scan-$TODAY.json
```

The semantic DB is found through the installed package, not named on the command
line; precondition 2's venv check is what pins which one.

**Success looks like** a counts block followed by
`wrote <path> (content hash …): N record(s), M linkable position file(s), K needed
(file, line) pair(s)`. Measured 2026-08-26: **30 seconds**; **1,341,843 records on that
final line**, 9,818 linkable position files, 486,655 pairs.

**This line prints a content hash too, and it is not the one you want** — it seals the
scan. The hash every later step re-checks is step 2's.

**Two different record numbers are printed, and you need both — for different
things.** The counts block's `records` line is the shippable records: it already
excludes work-in-progress keys and the per-theory cost records, exactly as step 6's
does, so it is not a walk total. The final line's `N record(s)` is what survived the
remaining filters, and that is exactly the set the export publishes — the scan and
the export share one generator, so they cannot disagree about it.

**Write both down.** The final line's `N` is what step 6's `exported` and step 7's
row check are measured against. The counts block's `records` is what precondition
8's recovery compares the completeness gate's own denominator against, if that gate
ever fires — and by then this scrollback may be gone.

**Judging the numbers:** the record count is the current corpus and will differ —
it grew by 4,834 in three days in August 2026. The other two move slowly. **None of
these has an automatic threshold**; they are for your eye, and the machine-checked
version of the same question is step 2, which hard-fails rather than drifting. If a
figure has moved by a lot, find out why before continuing rather than inventing a
tolerance.

### 2. The file→page map (§17.3)

```bash
python src/site_source_pages.py map \
  --scan $WORK/scan-$TODAY.json \
  --rendered ~/.isabelle/Isabelle2025-2/browser_info \
  --theories ~/Current/MLML/data/theories.json \
  --out $WORK/map-$TODAY.json
```

**Success looks like** a final line of the form
`wrote <path> (content hash <12 hex digits>)`. **Record that hash** — it is what
steps 3, 4, 6 and 7 re-check, and what the release record should name. The same
value is the export's `links_digest` and step 11's "artefact hash"; there is only
one such number per release.

One naming quirk, before it confuses you: this file is passed as `--artefact` to
`publish` and `gate`, but as `--source-links` to the site export, which reads it for
the links. Same file, two flag names.

Measured 2026-08-26: **7.6 seconds**; 10,595 theory pages, 1,165 auxiliary copies
of 1,139 symbolic paths, `.thy` residue **0**, linked 1,329,092 of 1,341,843
(**99.05 %**).

**What is machine-checked here** — these are hard errors, not figures to judge: a
position file absent from `data/theories.json`; a resolved name with no page; and
D53's cross-check, which requires the table's answer to agree with the declaring
theory recovered independently from the key prefixes of that file's name-addressed
entities. A clean exit means all three held. The linked percentage is *not*
machine-checked and has no floor.

### 2b. The rehearsal — optional, about ten minutes

Skip it on a release that changes no code. It earns its ten minutes when the
export code, the schema or the Worker changed, because it exercises the real
record stream, real vectors and the real query path where a mistake costs
minutes instead of hours.

**Numbered 2b because it must run after step 2** — it reads the map artefact —
and it must finish before step 6 starts, or it is not rehearsing anything. It
reads the semantic DB and writes turbopuffer, so precondition 3 is untouched.

```bash
TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY" \
python src/site_export.py \
  --source-links $WORK/map-$TODAY.json \
  --namespace isasearch-rehearsal-$TODAY \
  --limit 2000 --skip-completeness-gate
```

`--namespace` writes into a name you choose, so the rehearsal cannot consume a
generation number. **This is the only place `--skip-completeness-gate` is ever
legitimate**, and only because a `--limit` run ships nothing.

Then drive a local dev Worker against it — a curl straight at turbopuffer
exercises no line of the router. `wrangler dev` holds its terminal, so use two,
and **stop the server afterwards**:

```bash
(cd worker && npx wrangler@4 dev --local --port 8787)     # terminal 1, blocks
```
```bash
# terminal 2
curl -s -X POST http://127.0.0.1:8787/api/search -H 'content-type: application/json' \
  -d '{"query":"a sorted list","conditions":[{"on":"expr","polarity":"contains","text":"sorted_wrt"}]}'
```

The dev Worker reads `worker/.dev.vars`, so pointing it at the scratch
namespace means editing that file — and **`.dev.vars` is gitignored, so step
0's "working tree is clean" check cannot see it.** Note what you change and put
it back at step 11. Override `ROWS` there too if you want both router branches:
the 3 % line is a fraction of it, so at `ROWS=2000` a condition matching more
than 60 rows goes ANN and a narrower one kNN.

**Delete the scratch namespace afterwards**, or it reaches step 11 as a
mystery:

```bash
curl -s -w '\nHTTP %{http_code}\n' -X DELETE \
  "https://aws-us-west-2.turbopuffer.com/v1/namespaces/isasearch-rehearsal-$TODAY" \
  -H "Authorization: Bearer $turbopuffer_DEV_KEY"
```

`{"status":"ok"}` with `HTTP 200` is the pass — check it, because a bare `-s`
lets a 401 or 404 scroll past looking like success. (`v1` here and `v2` in step
11 both answer this call; the difference is not significant.)

*Protects against:* discovering at hour four what a 2,000-document run would
have shown in twenty seconds.

### 3. Publish the tree (§17.4)

```bash
python src/site_source_pages.py publish \
  --rendered ~/.isabelle/Isabelle2025-2/browser_info \
  --artefact $WORK/map-$TODAY.json \
  --out published.$TODAY
```

**Naming and disk.** The published trees live in the repository root as
`published.<YYYYMMDD>`; `/published*/` is git-ignored, so a 5 GB tree there does not
dirty the working tree. `ls -d published*` shows which exist. The one currently on
R2 is whichever the last release recorded in the handover — **that is the source-page
rollback, and it must survive this entire release.** The *next* release's step 11 is
what deletes it, being two releases old by then.

`--out` **must not exist** — and neither must its staging path, `<out>.building`.
The pass never deletes a path it was handed, and refuses both with the same message
("move it aside yourself if it is stale"). It writes into staging and renames into
place at the end, so an ordinary failure leaves no `--out`; a crash can leave a
`.building` directory behind, and that is what to remove before re-running.

**Success looks like** `published <path>: N theory page(s), M auxiliary page(s), K
mark(s), C merged conflict(s)`. A *merged conflict* is one of §17.2's auxiliary pages
whose several rendered copies differed and were combined by the id-union merge.

**Judging the numbers** — and note that they do not all behave alike:

- The **mark count tracks the corpus and will move every release.** It is the
  artefact's needed-line total, and the pass hard-fails unless it injects exactly
  that many, so it can never silently disagree with step 2 — but it also will not
  match a figure from a previous run. Expect it to be close to step 1's (file, line)
  pair count for *this* release: 486,655 on 2026-08-26, against 486,346 at the
  2026-08-24 publish.
- The **page counts, the merged-conflict count, and the two tolerance counters publish
  prints are tree-side** and move only when the rendered tree does. Identical on
  the 2026-08-24 and 2026-08-27 runs: 10,595 theory pages, 1,139 auxiliary pages,
  11 merged conflicts, external references exempted 232, dangling anchors stripped 1. Those last two are
  two of the three baselines step 4 checks properly — the third, inherited fragment
  misses, is a gate-only counter that publish does not print. The page and conflict
  counts are for your eye alone.

### 4. The link-check gate, over the tree alone (§17.5)

```bash
python src/site_source_pages.py gate \
  --published published.$TODAY \
  --artefact $WORK/map-$TODAY.json
```

**Success is exit status 0** (`echo $?`) — the same criterion as step 7. Green means:
every needed (file, line) has its mark; every reference in every
published file resolves inside the tree, fragments included; and the three tolerance
counters match `site/expected-counters.json` exactly. **That file is the authority**;
as of 2026-08-26 it holds external references exempted 232, dangling anchors stripped
1 entry, inherited fragment misses 106 pairs — quoted here for orientation, and stale
the moment anyone legitimately runs `--update-counters`.
**A counter mismatch fails the gate.** *Historical, for scale:* the 2026-08-24 and
2026-08-27 runs both walked 15,970,528 references green with every baseline
unchanged.

This is the model for what a checkable step looks like: the baselines are committed,
so the tool distinguishes "the corpus grew" from "something broke" without asking
you to judge a number.

If a counter legitimately moved, `--update-counters` is the only way to adopt it.
Always pass `--rendered` with it: the flag is optional in the code, but without it
the gate skips the confirmation that each newly tolerated pair really is already
missing from the input, which is the whole reason the baseline may move.

```bash
python src/site_source_pages.py gate \
  --published published.$TODAY --artefact $WORK/map-$TODAY.json \
  --update-counters --rendered ~/.isabelle/Isabelle2025-2/browser_info
```

which refuses while any non-counter failure is outstanding, and whose diff to
`site/expected-counters.json` is the review. Do not reach for it before reading
what changed.

*Protects against:* shipping a tree whose links are broken by us. The three counters
are the standing alarm for every future data update: read three numbers instead of
re-auditing five gigabytes.

### 5. Upload the published tree to R2

The bucket is `isasearch`, in Cloudflare's WNAM (western North America) region,
beside the Worker (D18). Object keys are `source/<rel>` — the key is the
site URL path minus the leading slash — so the published tree's root maps onto
`source/`. The tree's root holds the theory pages themselves
(`Abel_Limit_Theorem.Abel_Limit_Theorem.html`, …) alongside `_aux/`, `fonts/`,
`index.html` and `isabelle.css`; there is no `source/` directory *inside* it, so the
local path and the `R2:` path are not parallel and must be written exactly as
below.

**This step writes into the prefix the live site is already serving**, because R2
offers no staging area. From here until step 8 the old index is live over a
partly-new tree. That is tolerable because the overwhelming majority of pages are
byte-identical between two corpus generations and because the thirty-day edge cache
keeps serving the old copies to most visitors — but it is only tolerable while
nothing is *removed*. Hence the two-phase shape below: **add and overwrite now,
delete later.**

> **Read this before running the block below.** The exact invocation of the
> 2026-08-24 upload was not recorded, and that upload went into an empty bucket, so it
> never faced the question this step now answers. The block below is what actually ran
> on 2026-08-27, the first time these commands met a bucket that already held a tree:
> 11,750 files, 12 of them changed, 8 m 48 s, exit 0, with `501 NotImplemented`
> responses absorbed by retries. Record what you run each time (in the release log —
> step 11 asks for it — not as an edit made mid-release with a dirty working tree).

```bash
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ISASEARCH_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_ISASEARCH_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT=https://532d99283b5aa1e02486ee3fdcb163d5.r2.cloudflarestorage.com
export RCLONE_S3_NO_CHECK_BUCKET=true

# 1. prove the destination BEFORE writing anything — read-only, costs nothing
rclone lsf R2:isasearch --max-depth 1                # must print exactly: source/

# 2. the dry run, to a file, then its two summaries
rclone copy published.$TODAY R2:isasearch/source --dry-run > $WORK/r2-dryrun-$TODAY.txt 2>&1
sed 's/.*: Skipped/Skipped/; s/ as --dry-run.*//' $WORK/r2-dryrun-$TODAY.txt | sort | uniq -c
grep 'Skipped copy' $WORK/r2-dryrun-$TODAY.txt | sed 's/.*NOTICE: //; s/: Skipped copy.*//'

# 3. the copy, then the completeness check
rclone copy published.$TODAY R2:isasearch/source --transfers 32 --checkers 32 --progress
rclone check published.$TODAY R2:isasearch/source --one-way
```

**Redirect the dry run to a file; never pipe it into `head`.** `head` exits
after its quota, rclone takes `EPIPE` and dies, and the truncated listing reads
exactly like "nothing needs copying".

**Read the two summaries the block prints.** The first counts the line types.
`Skipped copy` is a file rclone would send over the wire — either because its
content changed **or because the destination does not have it at all**;
`Skipped update modification time` is a file rclone found byte-identical, where
only the timestamp would move.

The second names every file in that first category. On a data refresh the list
should be short and should name theories you can account for: on 2026-08-27 it
was 12 files of 11,750, exactly the 11 theory pages holding newly collected
entities plus `publish-report.json`. Cross-check it with
`diff -rq <the previous tree> published.$TODAY` if you want a second source.

**So the file count alone cannot clear you**: a wrong prefix is an empty
destination, and an empty destination reports all 11,750 files as `Skipped
copy` — indistinguishable from a legitimately rebuilt tree. That is why the
block proves the prefix first, before anything is written.

**Check the dry run ran at all** — the histogram cannot tell a clean run from a
failed one, because an error line is simply another line type:
`grep -ci error $WORK/r2-dryrun-$TODAY.txt`, and read the file's tail for
rclone's transfer summary. No summary means no dry run.

**`copy`, not `sync`, and that is deliberate** (ruled 2026-08-26). `sync` would delete
every object under `source/` that is absent from the local tree. Those deletions are wanted
eventually — a theory dropped from the AFP must stop being served — but running them
*now* would 404 real visitors following links from the still-live old index. So this
step only adds and overwrites, and the pruning pass waits until step 11, after
acceptance has passed. `copy` cannot delete anything, which is what makes a
mistyped path here recoverable.

**The dry run shows scale, not destination.** rclone names each file by its path
*relative to the source*, so the lines read `HOL.List.html: Skipped copy …` and never
name the key it would be written to. Use it to confirm the file count looks like a
published tree. Proving the *destination* is a separate act, and the block above
does its first half before the copy. Complete it right after the copy and
**before step 8**, while a mistake is still harmless:

```bash
rclone lsf R2:isasearch --max-depth 1                       # exactly: source/
rclone lsf R2:isasearch/source --max-depth 1 --dirs-only    # exactly: _aux/ fonts/
rclone lsf R2:isasearch/source --max-depth 1 --files-only \
  --include '{index.html,isabelle.css,publish-report.json}'  # all three
```

**Do not pipe these through `head`.** The prefix lists ~11,750 objects
lexicographically and every theory page starts with an upper-case letter, which
sorts ahead of `_aux/`, `fonts/` and the lower-case files — so `| head` shows
ten `A…` pages and none of the entries you are checking, while looking like a
pass.

They prove: `source/` alone at the bucket root; `_aux/` and `fonts/` as the
only directories under it, **not** a nested `source/` or a `published.<date>/`;
and the three files present. `publish-report.json` rides along harmlessly — it
becomes fetchable at `/source/publish-report.json` and discloses nothing the
tree does not.

A wrong prefix is 11,750 stray objects: caught here it costs one `rclone purge
R2:isasearch/<the wrong prefix>` — **name the wrong prefix, never
`R2:isasearch` and never `R2:isasearch/source`, either of which destroys the
live tree** — and caught after step 8 it is every source link 404ing.
**`rclone check --one-way` cannot catch it**, because it is handed the same
destination string the copy used.

**`RCLONE_S3_NO_CHECK_BUCKET=true` is mandatory.** A bucket-scoped token cannot
`HeadBucket` or `CreateBucket`; without the flag rclone makes that probe, gets a
403, and the failure reads like a write denial when the token is in fact fine.

**Spurious `501 NotImplemented` responses** come from a checksum quirk and are
absorbed by rclone's retries. They are not a failure.

**Success looks like** `rclone check … --one-way` reporting **0 differences** —
that is the criterion, and it is machine-checked. (`--one-way` means extra objects
in the bucket are not reported; they are step 11's business.)

**If `check` reports differences**, re-run the `copy` — it is idempotent and adds only
what is missing, so a partial upload costs nothing to finish. Differences that survive
a second `copy` mean the local tree changed under you; go back to step 3.

*Historical, for scale only, not targets to reproduce:* the 2026-08-24 upload moved
11,750 files / 5.043 GiB, checked 11,750 matching / 0 differences, and content types
came out right — `text/html; charset=utf-8`, `text/css`, `font/ttf`. rclone derives
those from the file extension, so they need no configuration; step 10's click-through
is what confirms it end to end.

### 6. The site export (§8)

Three and a half hours over a network connection, and its first few lines carry the
namespace name the rest of the release depends on. **Run it detached and tee it to a
log** — not in a shell you might lose, and never with the output going nowhere:

```bash
tmux new -s export        # or screen; anything that survives a dropped connection
# inside it, re-establish the environment — a fresh shell has none of it.
# BOTH source lines: the export needs Isabelle on PATH (precondition 2).
cd ~/Current/MLML/contrib/isasearch-web
source ~/Current/MLML/envir.sh
source ~/Current/MLML/secret.sh
set -o pipefail          # without it, `| tee` below hides the exit status
WORK=~/isasearch-pipeline
TODAY=20260827           # EXAMPLE. Type the SAME literal you used in steps 1-2.
                         # NOT $(date): a release can cross midnight, and then
                         # $(date) names files this release never wrote
TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY" \
python -u src/site_export.py \
  --source-links $WORK/map-$TODAY.json \
  --checkpoint $WORK/site-export-$TODAY.checkpoint.json \
  2>&1 | tee -a $WORK/export-$TODAY.log     # -a so a resumed run appends
```

**`python -u` is load-bearing, not a flourish.** Python block-buffers stdout
when it is a pipe, so without it the log lags reality by tens of minutes — it
ran about fifty minutes behind on 2026-08-27 — and the "ten minutes of silence"
rule below becomes unusable, because you cannot tell buffering from a stall.
`PYTHONUNBUFFERED=1` in the environment does the same job.

**`| tee` hides the exit status**, so run `set -o pipefail` in that shell first (zsh
and bash both honour it); without it `$?` is `tee`'s and reads 0 even when the export
died. Then read the namespace off the log — it is the lowest free generation number, on the
line reading `namespace <name>`:

```bash
grep '^\[site-export\] namespace ' $WORK/export-$TODAY.log | tail -1
```

**`tail -1`, not `grep -m1`.** The log is opened with `tee -a` so that a resumed
run appends, so any second attempt leaves two `namespace` lines in one file and
`-m1` returns the **first**. Usually both name the same namespace — a plain
resume keeps it, see *Interruption is safe* below. They differ exactly when the
first attempt never got one (it stopped on a gate) or when the checkpoint was
deleted, and in that second case the first line names a stranded namespace that
step 11 must delete. The last line is always the run you are in.

**Write that name down**; steps 7 and 8 need it, and step 11 needs it next time.

Before writing anything it runs two gates of its own:

- the artefact resolves and its digest is recorded — a pure local read, before any
  billed write;
- the **completeness gate**: every shippable entity has a vector. The vector store
  is a lazy cache and holes are legal in ordinary operation, so this must fail loudly
  rather than ship a corpus with gaps. `--skip-completeness-gate` exists for step
  2b's `--limit` rehearsal and for nothing else; never pass it on a release.
  **If it fires, precondition 8 has the remedy** — the offline backfill command,
  why running it does not violate precondition 3, and the one comparison that
  decides whether steps 1 to 5 still stand.

(The third gate that ran here — D46's asset comparison — retired 2026-08-26 with
the tokenizer.)

**Interruption is safe.** The checkpoint records the namespace, the last key and the
artefact digest; re-running the same command continues rather than starting over,
and keeps its half-loaded namespace instead of taking a fresh generation number.
Changing the artefact between runs is refused. **A resumed run is still a full run**
— the final REPORT is printed on any run without `--limit`, and its ROWS and
ENTITIES are accumulated over the whole corpus, not over the resumed tail — so
resuming does not leave the namespace unfinished or the report short.

**Success looks like** three things in order: `upserted N document(s) into
<namespace>`, then the per-category counts, then exit status 0. Anything else — a
traceback, a missing counts block — means it did not finish, and the checkpoint is
where you resume from. Progress lines appear roughly every ten batch groups with an
elapsed time and a rate — the condition is a modulo on the running document count, so
a short batch can skip one. A gap in them is not by itself evidence of a stall.
At the measured rate one lands roughly every 100 seconds, so treat **ten minutes of
silence** as the moment to go and look — rather than as proof of either state.

**When you look, do not look at the log.** Even with `python -u` the log is the
weakest evidence available, and without it the log is actively misleading. Two
things are authoritative, and both are live.

You are necessarily in a *different* shell from the export — tmux is holding
that one — so re-establish `WORK`, `TODAY` and `source ~/Current/MLML/secret.sh`
here first, or the checkpoint path collapses to `/site-export-.checkpoint.json`
and the query sends an empty bearer token.

```bash
# 1. the exporter's own progress record — see "Sample generously" below
python -c "import json;print(json.load(open('$WORK/site-export-$TODAY.checkpoint.json'))['documents'])"

# 2. the rows actually in the namespace
NS=$(grep '^\[site-export\] namespace ' $WORK/export-$TODAY.log | tail -1 | awk '{print $NF}')
curl -s -X POST "https://aws-us-west-2.turbopuffer.com/v2/namespaces/$NS/query" \
  -H "Authorization: Bearer $turbopuffer_DEV_KEY" -H 'Content-Type: application/json' \
  -d '{"queries":[{"aggregate_by":{"n":["Count","id"]}}]}'
```

If the checkpoint's `documents` advances between two samples, the export is
alive and the silence was buffering or a slow patch, whatever the log says.
The namespace count is the second opinion, and its `last_included_write_at`
tells you when a write last landed.

**Sample generously.** The checkpoint is written per batch group, not per
document, so at a degraded rate one minute can legitimately show no movement.
Take three samples five minutes apart before concluding anything.

**Stop waiting** only when `documents` has not moved across three such samples
*and* `last_included_write_at` predates the first: that is wedged, not slow.
Then `tmux attach -t export`, Ctrl-C, and re-run the identical command. The
cost is bounded by one batch group — the namespace is kept, no generation
number is burned, steps 1-5 are untouched — and a fresh connection often clears
backpressure a wedged one will not.

**Retries are not a stall.** A failed upsert is retried five times with a
growing delay, logged as `retrying in Ns (k/5)`. `write operation timed out`,
TLS `EOF occurred in violation of protocol` and turbopuffer's `HTTP 408` all
appeared on 2026-08-27 and were all absorbed. Read the ladder, not the count:

| what you see | what it means |
| --- | --- |
| many `(1/5)`, no higher | noise; the first retry keeps winning |
| `(2/5)`, `(3/5)` | the upstream write path is degraded, throughput drops, still self-correcting |
| `(4/5)`, `(5/5)` | this batch is about to fail, and a failed batch ends the run — safely, see **Interruption is safe** above |

No line says which batch it belongs to, so several workers at `(1/5)` look like
one worker climbing; the ladder corroborates, the checkpoint decides.

Throughput is not steady. The 2026-08-27 run went 209 documents/s, then ~136/s,
then roughly 10/s for a stretch while turbopuffer's write path degraded, then
recovered. Reads stayed fast throughout — that is how you tell an upstream
write problem from a dead link.

The seven counts, since none of them is otherwise explained:

| count | what it is |
| --- | --- |
| `records` | the shippable records — persistent, not work-in-progress |
| `undecodable` | records whose text would not decode; expect 0 |
| `wip` | work-in-progress keys, rejected *before* `records` is counted |
| `experience` | EXPERIENCE records, never published |
| `out of scope` | records D24's session test excludes |
| `exported` | what actually shipped — **should equal step 1's final-line record count** |
| `no defining theory` | records resolving to `''`, matching no Theory Name condition (533 at the 2026-08-26 measurement, 0.04 %) |

**They do not sum to a walk total.** `wip` and the per-theory cost records are
counted or skipped *before* `records`, so they sit outside it rather than inside.

Only `exported` has a downstream check. If one of the others has moved by an
order of magnitude, find out why before deploying — and note that `undecodable`,
whose expected value is 0, has no order of magnitude: any non-zero value there is
the thing to investigate.

At the end of a full run the export prints its **REPORT block** — the four
`wrangler.toml [vars]` lines, ready to paste:

```
[site-export] REPORT — paste into worker/wrangler.toml [vars] (RELEASE step 8):
[site-export]   TPUF_NAMESPACE = "<namespace>"
[site-export]   ROWS = "<row count>"
[site-export]   ENTITIES = "<distinct entities>"
[site-export]   BUILT = "<YYYY-MM-DD>"
```

**Write all four down.** `ROWS` is the record count and §6.3c's denominator —
the count router's 3 % line is a fraction of it; `ENTITIES` is the D5-collapsed
number the pages display, about 8 % lower, and never the denominator. Step 8
pastes them beside `TPUF_NAMESPACE` in one commit; step 10's probe asserts the
deployed pages agree.

*Protects against:* a corpus with silent holes (the completeness gate), and a
namespace/numbers pair assembled by hand instead of read off the run that built
it.

### 7. The gate again, against the new namespace (§17.5)

```bash
TURBOPUFFER_API_KEY="$turbopuffer_ISASEARCH_READ_KEY" \
python src/site_source_pages.py gate \
  --published published.$TODAY \
  --artefact $WORK/map-$TODAY.json \
  --namespace isasearch-...  `# from step 6's REPORT` \
  --sample 1000
```

This adds the end-to-end clause, and it is three checks, not one:

- **The row count.** The namespace must hold one row per record in the artefact —
  *every* record, not only the linkable ones, since the artefact composes an entry for
  each and the unlinkable ones get the empty string. The number to expect is **step 1's
  final-line `N record(s)`**, which is also step 6's `exported` — not the counts
  block's larger `records`, and not step 2's smaller linked count. This is the check most likely to fire
  after an interrupted or `--limit`ed export — it is how you find out the namespace is
  short — and a mismatch fails unconditionally. The gate has no override for it: the
  `--allow-count-mismatch` flag belongs to `patch`, not to `gate`, so there is nothing
  to reach for and nothing to be tempted by.
- **The sample.** A sample spread evenly across the namespace's ids, both endpoints
  included, of real rows must have a `source_link` that is
  either empty or string-equal to a path the published tree serves, with the named
  mark present. Empty links are legitimate: about 1 % of entities have no linkable
  position, so the comparison bites on the non-empty ones.
- **A short return** from the sample's own lookup is itself a failure, not a smaller
  sample — the rows it asked for must all come back.

It re-runs step 4's tree-side checks as well, since it is the same tool with the same
`--published` and `--artefact`; the three above are what `--namespace` adds.

**Success looks like** the same green report as step 4 plus the namespace lines, and
**exit status 0** — the gate's exit code is the criterion, as it was in step 4.

**If the sample fires** — a `source_link` naming a path the tree does not serve, or a
mark that is not there — the index and the tree were built from **different
artefacts**, which is exactly what this step exists to catch. Adjust nothing: check
that the artefact hash step 6 recorded is the one step 3 published under, and re-run
whichever of the two used the wrong one. (The "do not upload" advice in *When something
fails* does not apply here; the upload already happened at step 5.)

**If the row count fires**, the namespace is short and there is no override: go back
to step 6 and let the export finish. The usual causes are a run that was interrupted
and never resumed, or one given `--limit`. Resume it with the same command and the
same checkpoint; the row count is exactly the check that tells you it was not done.

*Protects against:* the one thing steps 4 and 5 cannot see — the index and the tree
having been built from different artefacts.

### 7b. The raw-text overlap sweep — the launch gate (§6.3c)

**This gate exists because every overlap and latency figure behind the count
router was measured on the `\n`-joined subtoken columns, which this schema
deletes.** The sweep re-establishes them on the raw columns of the namespace
that will go live, and the deadline table and the 3 % line are provisional until
it has run. It is also the per-release re-establishment of the approximate
branch's guarantee — the ANN overlap is a property of each index build, not of
the design.

```bash
TPUF_NAMESPACE=isasearch-...    \
ROWS=1234567                    \
TURBOPUFFER_API_KEY="$turbopuffer_ISASEARCH_READ_KEY" \
FIREWORKS_API_KEY="$EMBEDDING_API_KEY" \
node worker/probe/launch_gate.mjs
```

Both of the first two come from step 6's REPORT block.

**Success is exit status 0**, the same criterion as steps 4 and 7.

It imports the Worker's own `compileRequest`, `tupfQueryBody`, `tupfCountBody`,
`routeOf` and `certified`, so the sweep measures the filters the router will
actually send rather than a hand-written imitation of them. It prints one row
per pattern, then a `PASS`/`FAIL` line per pass condition below, then a JSON
record to paste into the release log; it exits non-zero if any condition
failed. `ROWS` is passed in because the 3 % line is a fraction of it, and at
this point in the release `wrangler.toml` still holds the *previous*
namespace's number.

What it measures, against the step-6 namespace, read-only (the pattern shapes
are §6.3c's "The 3 % line" paragraph):

- semantically clustered patterns, a no-literal length shape, a common-literal
  shape, and a CTS-equivalent differential control — recording, per pattern:
  the exact count, the ANN row count against `min(count, 200)` (the under-fill
  rate), the ANN∩kNN overlap for full-200 results, and the fallback-kNN latency;
- a `Not(Regex)` shape (the `excludes` compiler output), same recordings;
- the empty-value probe: does `Not(Regex)` return the 533 empty-`theory` and
  ~6,800 empty-`expr` rows, and does any plausible pattern match the empty
  string?

**These four block the release.** The probe exits non-zero if any fails:

1. every kNN result satisfies the certificate `rows == min(count, top_k)`;
2. no under-filled ANN result at or above the line fails to trigger the
   fallback certificate;
3. **fallback-kNN latency fits the 15 s deadline** — the deadline a real
   visitor's fallback sits behind, so you want the slowest leg well under it,
   not just under it;
4. the empty-value behaviour matches what the Worker assumes — empty patterns
   are rejected client- and Worker-side, so only `Not` can reach the empty rows.

A miss on any of those is a design input, not a tolerance. Two knobs exist, both
`[vars]` in `worker/wrangler.toml`: **`EXACT_FRACTION`** is the 3 % line and
**`DEADLINES_MS`** the deadline table. If you move either, re-run this sweep and
let the changed line ride in step 8's commit.

**The ANN∩kNN set overlap is recorded, not enforced** (ruled 2026-08-28). It
fails on the filter's shape, not the data: `excludes` matches nearly the whole
corpus by construction (`expr !~ sorted` is 99.59 %), so it is above any line,
and ANN swaps tied rows freely. Measured 2026-08-27, two negations scored
179/200 and 183/200 with a similarity gap of **0.0000 and 0.0027** — different
rows, identical quality. Red on every correct release is not a gate.

**Score parity replaced it**, measuring what set identity stood in for: was the
visitor shown a result materially worse than the best available at that rank.
**Top-10 within 0.005, top-100 within 0.01** (2026-08-27: worst 0.0015, 0.0052).

Two cautions. The thresholds are absolute cosine gaps and **do not transfer
across queries** — bands here run 0.48 to 0.81, so "similarity ≥ 0.5" would mean
all 200 rows for one query and the top hundred for another. And the verdict
follows the battery: the same no-literal shape measured 0.0052 under one query
and **0.0322** under another, so a new shape needs the queries that stress it.

Record every figure in the release log regardless — the overlap numbers are the
per-build evidence §6.3c asks for.

### 8. Deploy the Worker (§8.2)

`worker/wrangler.toml` has exactly one `[vars]` block and no per-environment
overrides, so there are four lines to change, and they are exactly step 6's
REPORT block:

```toml
TPUF_NAMESPACE = "<the namespace from step 6>"
ROWS = "<from the REPORT>"
ENTITIES = "<from the REPORT>"
BUILT = "<from the REPORT>"
```

**One commit for all four** — `ROWS` is the count router's denominator, and a
namespace switched without its numbers misroutes silently. Commit it, then **a
human runs**:

```bash
(cd worker && source ~/Current/MLML/secret.sh && npx wrangler@4 deploy)
```

The subshell matters: every later step's paths — `published.$TODAY`, `pipeline/`,
`worker/probe/live_probe.mjs`, `sys.path.insert(0, 'src')` — are relative to the
repository root.

**Success looks like** wrangler printing the uploaded bundle, the bound resources, and
a **new version id**, followed by the deployed URL. Note that version id — it is what
step 11 records and what a rollback names. `deployments list` shows the deployment
history but prints neither `[vars]` nor a commit sha, so it confirms *that* a new
version went out, not *which commit* it was built from; the tie between them is the
record you write in step 11.

```bash
(cd worker && npx wrangler@4 deployments list | tail -20)   # newest is LAST
```

Switching the site onto the new data *is* this deployment; there is no other
mechanism. **The switch itself** propagates in seconds and is not subject to any
HTTP cache — Worker code and configuration travel by Cloudflare's own configuration
system, not through the edge cache. **The pages the old Worker already put in the
edge cache are a separate matter** and are still being served; step 9 is what
clears them, and it is not optional.

**Before going any further, check the site is not down** — step 9 purges the whole
zone, and doing that on top of a broken deploy wastes `conda.qiyuan.me`'s cache for
nothing:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://isabelle-semantics.qiyuan.me/api/search \
  -H 'content-type: application/json' -d '{"query":"sorted list"}'
```

`200` and you may proceed; a `502` here means the deployed Worker cannot use its
namespace or its `[vars]` — go to *Rollback*.

*Protects against:* nothing on its own — but doing it out of order is the
sharpest edge in the release: deployed before step 6 finishes, the site serves a
half-loaded index with no error anywhere; deployed with a stale `ROWS`, the
count router routes against the wrong denominator, silently.

### 9. Purge the Cloudflare zone cache

**Do this before acceptance, not after.** The edge is still holding the previous
corpus generation's source and entity pages — `/source/*` for up to thirty days — so
checking the site first would test content the purge is about to delete, and could
fail on line marks that moved.

What is cached, and where — the three routes differ, and only two of them are the
purge's business. The browser column and the two `cache.put` calls are in
`worker/src/index.js`; the 30-day edge TTL is a Cloudflare **zone rule**, which lives
in the dashboard and is recorded in `worker/README.md`, not in any source file
(checked 2026-08-26):

| Route | Browser | Edge |
| --- | --- | --- |
| `/source/*` | 4 h | **30 days**, by the zone rule |
| `/entity/<key>` | 4 h | **4 h**, written by the Worker |
| `/` and `/about` | 1 h | **not edge-cached at all** |

So the purge is what stops visitors being served the previous corpus generation's
source and entity pages. It clears the **Edge** column only: a visitor's own browser
can still hold a source or entity page for four hours, and `/` and `/about` are never
in the zone cache at all — a stale `/about` cannot be purged and simply ages out of
that visitor's browser within the hour.

**A human does this**: dashboard → `qiyuan.me` → Caching → Configuration → Purge
Everything. Purge-by-prefix is an Enterprise feature; on this zone it is all or
nothing.

**It purges the whole zone, not just this site.** `conda.qiyuan.me` shares it, so the
conda channel's cache is cleared too. Nothing breaks — the next request refills from
origin — but say so rather than surprise anyone relying on it.

**Confirm it took** by fetching a source page twice and watching the header go from
`MISS` to `HIT`:

```bash
PAGE=Some_Entry.Some_Theory.html     # pick one from the middle of the index;
                                     # NOT HOL.List.html — see below
for i in 1 2; do curl -s -o /dev/null -D - \
  "https://isabelle-semantics.qiyuan.me/source/$PAGE" \
  | grep -i '^cf-cache-status'; done
```

**A real GET, not `curl -I`.** A HEAD request does not reliably populate
Cloudflare's edge cache, so `-I` can answer `MISS` twice on a perfectly healthy
zone and read as a failed purge.

**And not a popular page.** `HOL.List.html` and its like are the likeliest to
have been refilled between the purge and your check, by a passing visitor or by
your own step 10 click-through — which is why `PAGE` above is something nobody
would have visited.

**The pass is `MISS` then `HIT`.** A first fetch that already says `HIT` is
inconclusive rather than a failure: try another untouched page. Two `MISS`es on
a real GET means the purge did not take — do it again before step 10, because
step 10's whole point is to see what a visitor sees.

*Protects against:* a source page from the old tree being served against a link from
the new index — the exact shape of "the release looked fine for four hours".

### 10. Live acceptance

Against `https://isabelle-semantics.qiyuan.me`, after the purge, so that what you see
is what a visitor gets. **Your own browser is the one cache the purge cannot clear** —
`/` for an hour, entity pages for four — so do these in a private window, or with
`curl`, and not in the tab you had open before the deploy.

1. **The search page works.** Load `/`, type a query, get cards with similarities
   and source links.
2. **`/about` prints the new entity count and build date.** These come from the
   deployed `[vars]`, so a stale pair means step 8's commit did not carry the
   REPORT numbers. **The count is not `exported`** and must not be compared with
   it: `ENTITIES` counts *distinct entities*, which collapses each theorem and
   its derived-rule twin into one, so it runs about 8 % below the row count
   (1,230,467 entities against 1,337,009 rows in the committed artefact —
   the 2026-08-20 export's own figure was 1,337,025, sixteen twin rows higher). What to
   check is that the page shows **exactly the configured values** — the probe
   below asserts it mechanically with `SITE_URL` — and that the build date is
   the one the export stamped. On a release that crossed midnight that is
   yesterday's date, and that is correct, not a fault.

   Fetch it fresh: this page is browser-cached for an hour and is *not* in the
   edge cache, so your own browser is the likeliest source of a stale reading.

   ```bash
   curl -s https://isabelle-semantics.qiyuan.me/about \
     | grep -iE 'entit|built|[0-9]{4}-[0-9]{2}-[0-9]{2}'
   ```
3. **One entity page.** Take the link from any result card in check 1. Confirm the
   statement, the `Defined in` line, the source link, and the ten nearest entities.
4. **One source link clicked through** to `/source/<theory>.html#L<n>`, landing on
   the right line.
5. **`/source/CoreC++.Annotate.html` returns 200.** The `+` in a theory name must not
   be percent-encoded anywhere in the path; the 29 `CoreC++.*` pages that carry entities are
   the only names that can prove it (the tree ships a 30th, `CoreC++.CoreC++.html`,
   which no record points at). Quote the URL so the shell leaves it alone —
   curl itself passes `+` through untouched:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     'https://isabelle-semantics.qiyuan.me/source/CoreC++.Annotate.html'
   ```
6. **The rate limit still bites** — six quick requests, the sixth 429:

   ```bash
   for i in $(seq 6); do
     curl -s -o /dev/null -w '%{http_code}\n' -X POST \
       https://isabelle-semantics.qiyuan.me/api/search \
       -H 'content-type: application/json' \
       -d '{"query":"a sorted list stays sorted when an element is appended"}'
   done
   ```

   The rule is five per address per **ten seconds**, so all six have to land inside one
   window; six serial round trips usually do. If you see six `200`s, retry in parallel
   (`for i in $(seq 6); do curl … & done; wait`) before concluding anything — and if it
   still does not fire, that is an abuse-protection regression, not a data problem: it
   does not block the release, but raise it the same day. The sixth should be `429`.
   Fonts and pages must be unaffected — the rule is scoped to `/api/search` alone.

   To see the body `{"error":{"code":"burst_limit","layer":"edge"}}`, **replace**
   `-o /dev/null` with `-o -`; do not add it. curl binds `-o` targets to URLs
   positionally, so a second `-o` on a single-URL command is ignored and the body
   still goes to `/dev/null`.

7. **The count router (plan §6.3c).** Two checks through `/api/search` — a curl
   straight at turbopuffer exercises no line of the router and passes even when
   the router is absent or inverted:
   - **Below the line, exact.** A conditioned search whose count sits under 3 %
     (e.g. Expression `f x = x`, ~142 matches, plus a kind selection) answers
     `mode: "exact"` with `rows == count` (both are record counts in the
     response) and `complete: true` when count ≤ 200 — every true match, the
     certificate the old ANN path failed by 140/142.
   - **Above the line, within budget.** A dense condition (e.g. Expression
     `= `) answers `mode: "approximate"` with 200 rows inside the deadline, or
     falls back to an exact answer — either is a pass; a 5xx or an under-filled
     approximate answer is not.
   Both responses' cards carry similarities (computed from `$dist`).

The read-only probe covers the machine-facing half — the schema assertion, the
certificate on both rank modes, the `Not(Regex)` complement, the engine-message
shape and (with `SITE_URL`) the `/about` values:

```bash
TPUF_NAMESPACE=isasearch-...    \
TURBOPUFFER_API_KEY="$turbopuffer_ISASEARCH_READ_KEY" \
FIREWORKS_API_KEY="$EMBEDDING_API_KEY" \
SITE_URL=https://isabelle-semantics.qiyuan.me \
node worker/probe/live_probe.mjs
```

It prints one `PASS`/`FAIL` line per check and exits non-zero if any failed.
(The ANN-vs-kNN overlap itself was step 7b's business, before the deploy.)

### 11. Retire the predecessor, and record the release

**Keep the live namespace and the one it replaced; delete everything older.** One
namespace stores about 11.5 GB (D31's figure, at f16). That is not the 29 GB in the
timing table, which is what crosses the wire — turbopuffer's upload encoding is float32
whatever the schema stores. Two measurements of two different things; do not try to
derive one from the other. Either way, a cycle that retires nothing adds a namespace's
storage to the bill every release.

Three things make this step easy to get wrong, and all three are why it is written
out at length rather than left to arithmetic.

**Namespaces from before 2026-08-26 have `.asset` companions; new ones do not.**
The sentinel mechanism is deleted, so a fresh export occupies one name. A legacy
data namespace retires together with its companion — delete the pair.

**Names are recycled, so you cannot identify the oldest by its number.** The export
takes the *lowest free* generation number. Delete the base name and the next export
allocates the base name again — after which the live namespace has a lower number
than its own predecessor, and "the generation two behind" is arithmetically
meaningless. **The order releases happened in is recorded only in the release log**
(`pipeline/HANDOVER-review3.md`), never in the names. Read it, name the survivors,
and delete by name.

**An abandoned run** — a `--limit` smoke test, or a run whose checkpoint was
lost, leaving a partial namespace possibly holding gigabytes — **is identified by
the release log**, which names every real generation; a namespace the log does
not name (and `wrangler.toml` does not point at) is one. (The old test — "no
`.asset` companion" — died with the sentinel: no new namespace has one.) Those
are safe to delete regardless of age, and they must not be counted as one of the
two you keep.

List what exists:

```bash
TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY" python - <<'EOF'
import sys; sys.path.insert(0, 'src')
import site_export as se
for n in sorted(se.list_namespaces('isasearch-', region=se.DEFAULT_REGION,
                                   key=se.api_key())):
    print(n)
EOF
```

**Write the release log block first, before deleting anything.** The order releases
happened in is recorded nowhere else, and this is the tail of a job that has already
run for hours; an interruption between the delete and the write would leave an account
whose ordering can no longer be reconstructed. The bullets below say what the block
must contain — write it, then come back here.

Then delete, by name: every namespace older than the two you are keeping, plus any
abandoned run. **This is the sharpest irreversible action in the release** — there is no
undo, and deleting the wrong name destroys the rollback you may need ten minutes
later. It is not the only one: the R2 prune further down this step deletes
objects permanently too, and Trap 1 explains why that one bites across a corpus
generation. Write the names into the script by hand, read them back against the listing
and the release log, and have a second person confirm them before running it:

```bash
CONFIRM= TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY" python - <<'EOF'
import os, sys; sys.path.insert(0, 'src')
import site_export as se

LIVE   = 'isasearch-...'           # what wrangler.toml now names — the live one
KEEP   = 'isasearch-...'           # the one it replaced — the rollback
DOOMED = ['isasearch-...', 'isasearch-....asset']   # fill in; nothing else

# Guards, because the alternative mitigation is care, and the paragraphs above explain
# why care is not enough here: the names are recycled, so the wrong one looks right.
existing = set(se.list_namespaces('isasearch-', region=se.DEFAULT_REGION,
                                  key=se.api_key()))
# Only a pre-2026-08-26 namespace has an .asset companion.  Protect one when it
# exists; REQUIRING it would refuse every release from now on.
protected = {LIVE, KEEP} | {n + '.asset' for n in (LIVE, KEEP)
                            if n + '.asset' in existing}
clash = set(DOOMED) & protected
assert not clash, f'REFUSING — these are live or the rollback: {clash}'
missing = {LIVE, KEEP} - existing
assert not missing, f'REFUSING — these should exist and do not: {missing}'

print('to delete, permanently:')
for n in DOOMED:
    print('   ', n, '' if n in existing else '  <-- NOT on the account, check the name')
if os.environ.get('CONFIRM') != 'delete':
    print('\ndry run. Re-run with CONFIRM=delete once a second person has read the '
          'list above.')
    sys.exit(0)

for n in DOOMED:
    if n not in existing:
        print('skipping', n, '— not on the account')   # a re-run after a partial pass
        continue
    se.request('DELETE', f'/v2/namespaces/{n}', region=se.DEFAULT_REGION,
               key=se.api_key())
    print('deleted', n)
EOF
```

As written it is a **dry run**: it prints what it would delete and stops. Have the
second person read that list, then re-run the identical command with `CONFIRM=delete`
instead of `CONFIRM=`. (The confirmation is an environment variable rather than a
typed prompt because the script arrives on stdin, so `input()` would read the
already-consumed heredoc and die.)

`se.request` raises on any status it does not accept, so reaching `deleted <name>`
means the call succeeded. Confirm anyway by re-running the listing above: what you
deleted should be gone, and every name in `protected` should remain.

Then:

- **Prune the R2 bucket** — the deletions step 5 deliberately deferred. Now that the
  new index is live and accepted, objects the new tree does not contain are dead.
  Removing them is safe *because the local `published.<previous date>` is still on
  disk*: that tree, not R2, is the source-page rollback from here on (Trap 1).

  This is probably a new shell, hours later, so re-establish `$WORK`, the
  `RCLONE_*` exports from step 5, and — most importantly — check that `$TODAY`
  still holds **this** release's date. A stale `$TODAY` prunes R2 down to an
  older tree.

  ```bash
  # the dry run, kept as the record of what you approved
  rclone sync published.$TODAY R2:isasearch/source --dry-run 2>&1 \
    | tee $WORK/prune-$TODAY.txt | grep -i delete | tail -20
  # the true count, unaffected by the tail -20 above
  grep -c 'Skipped delete' $WORK/prune-$TODAY.txt
  ```

  Then, and only after reading it, the real thing — **to a different file**, so
  the list you approved survives:

  ```bash
  rclone sync published.$TODAY R2:isasearch/source 2>&1 \
    | tee $WORK/prune-$TODAY.done.txt | tail -20
  ```

  **rclone logs to stderr**, which is why `2>&1` is there — without it the pipe is empty
  and you would read a blank screen as "nothing to delete". At default verbosity
  unchanged files are not printed, so the output is short: one `Skipped delete as
  --dry-run is set` line per doomed object, plus a summary whose `Deleted: N (files)`
  line is the total. The `grep` isolates them; read the raw output too, it is only a few
  lines.

  **Read the deletion list before running the second command.** A handful, naming
  theories you know left the AFP, is right; hundreds means the local tree is not
  the one you uploaded — stop, and do not run the real `sync`. If the list is
  empty, nothing was removed this release and there is nothing to do at all. When
  the real `sync` does delete something, purge the zone cache a second time.

- **Delete the published tree two releases old**, keeping the one you just replaced
  (`ls -d published*`). It is the source-page rollback until the next release.
- **Put `worker/.dev.vars` back** if step 2b's rehearsal pointed it at a scratch
  namespace (`TPUF_NAMESPACE`, and `ROWS` if you overrode it). The file is
  gitignored, so nothing in this release will remind you: no `git status` shows
  it, and the tests do not read it. Left as it is, the next person to run a
  local dev Worker gets a namespace that no longer exists and a router
  denominator nearly three orders of magnitude wrong.
- **Copy this release's artefacts into the repository** and commit them — they live
  in `$WORK` while the release runs, and in `pipeline/` afterwards, which is what
  pins the live namespace to a scan and a map:

  ```bash
  cp $WORK/scan-$TODAY.json pipeline/scan-v2.json      # these two names are what the
  cp $WORK/map-$TODAY.json  pipeline/map-artefact.json  # repository already carries
  ```

- **Nothing deploy-affecting is committed here.** The `wrangler.toml` `[vars]`
  went in at step 8, *before* the deploy, because the deploy bundles the
  working-tree file and the sha you are about to record must describe what is
  running. If they are still uncommitted now, that sha does not — stop and work
  out what was deployed before you record anything.
- **Append a block to `pipeline/HANDOVER-review3.md`**, this project's release log:
  the namespace, the artefact content hash, the deployed Worker version, **the commit sha you deployed** — step 0 of
  the next release bounds its history with it — the published-tree directory name, the figures observed at every
  step, and anything that surprised you. Three of those are asked for in the middle
  of the release and are the ones that get lost, so they are named here too:
  **the step-5 `rclone` invocation you actually ran**, **step 7b's JSON record**, and
  **step 6's REPORT block**. Append it at the **end** of the file, so that step 0 of the next
  release finds it where this document says it will be.
- **Restart whatever precondition 3 made you stop** — the RPC host, the REPL
  server, any collection job. The release stopped them and nothing else will
  put them back; a finished release that leaves the semantic-DB pipeline down
  is not finished.
- **Push to `origin`**, and to `origin` only.

---

## Smaller releases

Not every change needs the whole pass. Step 0's preflight applies to all of them.

- **Worker code or copy only** (no schema change): steps 0, 8, 9, 10 — and in
  step 8, leave `TPUF_NAMESPACE` and its three numbers alone; only the deploy
  applies. The namespace is untouched, so step 10's check 2 inverts: `/about`'s
  entity count and build date must be **unchanged**, since the `[vars]` they
  come from were not edited. Then append to the release log as step 11
  describes: it is the only record of what is deployed, and step 0 of the *next*
  release reads it.
- **A tree-side fix only** (a rendering correction, no corpus change): steps 0, 3, 4,
  5, 9, 10, reusing the **committed** artefact `pipeline/map-artefact.json` in place of
  `$WORK/map-$TODAY.json`. This is consistent with the rule that a full release
  starts with a fresh scan and map: that rule exists because the *corpus* moves, and
  here it has not. The artefact hash and every composed `source_link` stay
  byte-identical by design, so the index does not move and steps 6–8 are not needed.
  Three pieces of step 11 still apply: if the fix *removed* a page, run the prune (the
  `rclone sync` dry run and its deletion list), or R2 goes on serving what the tree no
  longer has; and this leaves a third `published.<date>` on disk, so drop the oldest
  rather than let the two-releases-old bookkeeping drift.
  Append to the release log as step 11 describes, naming the new published-tree
  directory — otherwise the log still names the old tree, and both step 3's "keep the
  previous tree" rule and the rollback row that re-uploads it point at the wrong one.
- **A schema change** — a column added, removed or renamed — is **never** a
  code-only release. turbopuffer answers a query naming an attribute the namespace
  does not have with **HTTP 400 on the whole query**, not a null: a Worker asking for
  a new column against the old namespace fails every search. Measured 2026-08-26.
  Such a change runs the full pass, steps 0 through 11.

`patch` (`python src/site_source_pages.py patch …`) is **not** part of any release.
It exists for the one-off that added `source_link` to a namespace exported before
that column did, and every export since composes the column itself.

## When something fails

- **The map step fails naming a position file, or reporting a resolved name with no
  page.** `data/theories.json` is from a different corpus generation than the
  semantic DB or the rendered tree. It is regenerated in the super-repo by running
  `tools/Theory_Info/Get_Thy_Info.thy` (which writes `sessions.msgpack` and
  `theories.msgpack` into the super-repo root) and then
  `python tools/Theory_Info/convert_json.py` from that root. That first part runs
  Isabelle, so in this project it needs the owner's explicit go. Do not work around
  the failure.
- **The map step reports a declaring-hash disagreement.** Two independent evidence
  chains — static session structure and collection-time keys — contradict each
  other. This is not a tolerance to widen. Stop and investigate.
- **The gate reports a counter mismatch.** Something in the tree changed shape. The
  gate names the pages and references involved; read them and decide whether the
  change is one you made on purpose. Only then `--update-counters`, and let the diff
  be reviewed before it is committed.
- **The gate fails on something that is not a counter** — a missing mark, a reference
  that does not resolve, a fragment with no anchor. That is the gate saying the tree is
  broken *by us*, and there is no tolerance to widen: `--update-counters` refuses while
  such a failure stands, deliberately. The gate names the page and the reference; §17.4
  and §17.5 describe what the pass should have emitted there. **Do not upload.** If the
  cause is not obvious, this is a stop-and-ask, not a judgement call.
- **The export stops on a document id the artefact does not name.** The semantic DB
  moved after the scan. Between 2026-08-23 and 2026-08-26 it moved 4,834 entities
  (1,337,009 in the committed artefact — the 1,337,025 of the 2026-08-20 export, minus
  16 twin rows deleted since — against 1,341,843 at the 2026-08-26 scan)
  past the committed artefact, which is why a release *starts* with a fresh scan and
  map even though the repository has one committed. Do not disable the check —
  recover like this, and mind the third step, which is the one people miss:

  1. Stop whatever is writing the DB (precondition 3), then re-run steps 1 and 2 into
     new file names.
  2. **Delete the checkpoint.** A fresh map has a new content hash, and the
     checkpoint refuses to resume under a different one — that refusal is correct and
     must not be worked around.
  3. **The half-loaded namespace is now stranded.** With the checkpoint gone the next
     run allocates a fresh generation number and leaves the partial one behind.
     **Write its name down now** — nothing on the account distinguishes it later,
     since every namespace built after 2026-08-26 looks alike. Delete it in step
     11; it is not one of the two you keep.
  4. Re-run step 3 onwards, since the artefact the tree was published under has changed
     too. Step 3 will refuse — `published.$TODAY` exists from the first pass. Move
     **that** directory aside; it is this release's failed attempt. **Never move or
     delete the previous release's `published.<date>`**, which is the only copy of the
     source-page rollback.
- **The export stops on the completeness gate.** Entities exist with no vector.
  **Precondition 8 is the whole answer** — the backfill command, why it does not
  breach precondition 3, and the one comparison that decides whether steps 1 to 5
  still stand. Do not pass `--skip-completeness-gate`. Nothing was written when
  this gate fired, so there is no partial namespace to clean up and no checkpoint
  to delete.
- **Every live search answers `upstream` after deploying.** `upstream` covers
  turbopuffer and Fireworks failures past the retry table, and a broken router
  config (`ROWS`/`EXACT_FRACTION`/`DEADLINES_MS` unparseable — the Worker fails
  loudly rather than misroute). In order of likelihood after a release:
  `TPUF_NAMESPACE` names a namespace that does not exist or is half-loaded; the
  `[vars]` were mis-pasted; or one of the **Worker's own secrets** is missing or
  expired, which nothing in this release verifies and which looks identical from
  outside — `npx wrangler@4 secret list` in `worker/` shows which are set, though
  not whether they still work. Roll back per the table above to stop the
  bleeding, then work out which. A `regex_rejected` or 400 on every *conditioned*
  search while bare searches work means the namespace's text columns lack
  `regex: true` — the Worker is pointed at a pre-regex namespace (§12.2's
  ordering constraint).

---
