# NEXT ACT (post-compact): collect review round 3 turn-2 reports, write the Chinese consolidated report, get user approval, apply fixes, then patch on the user's word

> **REPO MIGRATION (2026-08-24, user-ordered).** The site subsystem now has its
> own repository, `contrib/isasearch-web` (branch `main`, GitHub-tracked).
> Everything this file cites moved there: the code (`src/site_export.py`,
> `src/site_source_pages.py`, tests under `tests/` — detached
> from the `Isabelle_Semantic_Embedding` package layout; that package stays a
> dependency for DB access), the plan documents under `docs/`, `site/`, and
> this pipeline state itself. Old → new paths:
> `~/isasearch-pipeline/*` → `pipeline/*` (this dir);
> `~/source-link-patch.checkpoint.json` → `pipeline/source-link-patch.checkpoint.json`;
> `~/isasearch-published/` → `published/` (git-ignored).
> The `isabelle-semantics site-export` subcommand is gone — run
> `python src/site_export.py` / `python src/site_source_pages.py` from the
> repo root.
> Historical sections below keep the old paths verbatim; apply the mapping.

## Where the project stands (2026-08-23 late)

§17 pipeline (SEMANTIC_SEARCH_SITE_PLAN.md, decisions D47–D54) is IMPLEMENTED and has
RUN GREEN end-to-end offline on THIS workstation (single-host model, user-directed):
scan → map → publish → gate all passed; §17.7 acceptance URLs verified
(`/source/HOL.HOL.html#L513` = lemma conjI; `Forcing.Arities.html#L235`;
`_aux/AFP/AutoCorres2/function_pointer.ML.html#L298`). The ONLY unexecuted step is
**patch** (writes source_link onto 1,337,009 LIVE rows of
isasearch-2025-2-afp-2026-05-13) — runs ONLY on the user's explicit "开跑".

## In flight RIGHT NOW: review round 3, turn 2 (two resumable Opus agents)

- Reviewer A (fix-by-fix conformance): agent name `aaadc4ca998d718ef`
- Reviewer B (patch-readiness): agent name `ad847520eb8b80484`
- Task outputs land under
  /tmp/claude-1002/-home-qiyuan-Current-MLML/da6e7ce3-5b07-4a3f-9a4c-d7b1cbdddb9b/tasks/<id>.output
  and arrive as task-notifications. If lost, SendMessage the agents by name.
- Their turn-1 verdicts (already delivered, summarized below) + turn-2 cross-exam
  answers = input for MY consolidated Chinese report to the user.
- RULE: do NOT change code before the user approves the fix list. Patch only on
  explicit user command.

## Round-3 turn-1 findings to consolidate (dedup keys)

All 14 converged fixes + D54 verified implemented; identity chain recomputed and
matching on real artefacts. Real defects/questions:

1. **Merge title/h1 exemption is per-LINE** (A HIGH / B LOW — severity contested):
   swallows any diff on a title/h1-bearing line; safe today (renderer puts them on
   dedicated lines 6/12). Fix candidate: NORMALIZE (blank title/h1 element text)
   instead of exempting lines; multi-line test.
2. **Merge base rule picks the foreign copy** (A MED-HIGH + B's 3/12-vs-tiebreak
   measurement): published smt_word.ML/word_lib.ML pages cross-link
   `Zip_Benchmarks.Word` instead of `HOL-Library.Word`. Candidate rule: prefer the
   non-umbrella (not Unsorted/) copy; possibly rewrite merged title to symbolic
   path. Likely needs a SECOND amendment to D49 r6 (user ruling; draft in flight).
3. **D54 counts pairs not occurrences** (A MED): 106 pairs = 425 refs (one ×253).
4. **D54 buckets by where-found** (A4=B9): ALL entity-anchor checks became
   report-only; proposal P1 = at map time seal the INPUT's own miss list, forgive
   exactly that, zero-miss for everything else. B cost-assessing (gate-like pass
   over rendered tree in map). Adopt-now vs after-patch = user decision.
5. Both-buckets overlap fails AND falsely inflates D54 alarm (fix: inherited -= own).
6. B patch findings: retry budget 62s too small vs 429 backpressure past 1M rows
   (attempts=12); stratified sample blind tail 2,682 ids (fix: pinned-endpoint
   formula); _count() None → vacuous proof with --allow-count-mismatch; schema
   literal duplicated (derive from namespace_schema); §17.7's scratch-namespace
   dry-run STILL UNMET — 3 untested API shapes (additive schema, include_attributes
   pre-patch may 400, id In ×500).
7. Alarm baselines only ⅓ machine-compared (A P2 = B12): seal baselines somewhere
   the gate reads; ":1248 hard-codes baseline 106 in a log string".
8. Low/pedantic pile: tree_fingerprint unconsumed duplicate (drop; keep
   theories_sha256+registry_fingerprint as audit values); rename outside try;
   checkpoint path validated late (write done:0 upfront); verified-on-N undercount;
   css_counters last-copy-wins; regex-completeness assertion candidate; untested:
   build_relocation collisions, export flag-pair refusal, _validate missing-field,
   --repo-root.

## Reviewer A's TURN-2 verdict (ARRIVED — fold into the report; B's turn-2 pending)

Key re-ranking: **the merge findings do NOT block the patch** — aux published
paths are pure functions of the symbolic position and base selection happens at
publish time, so base-rule/tolerance changes leave file_page_map, every composed
source_link and the artefact hash byte-identical; tree fixes can ride as a
re-publish even after shipping.

**FINAL must-fix-BEFORE-patch (6 items, all patch/gate-path, all small):**
1. `_count()` raises on non-int (else --allow-count-mismatch proof vacuous).
2. Stratified sample pinned endpoints: `chosen=[ids[i*(n-1)//(sample-1)] for i
   in range(sample)]` + reject --sample<2 (blind tail 2,682→0; verified).
3. Patch schema derived from `namespace_schema` (type divergence aborts write;
   filterable divergence SILENTLY re-indexes live — the nastier branch).
4. Write done:0 checkpoint before the first batch.
5. Patch retry budget attempts=12 + honour Retry-After + jitter; NO concurrency
   change, NO disable_backpressure (would make post-gate sample read stale).
6. Scratch-namespace exercise SHAPED WITH A TRIMMED ARTEFACT (cut records to the
   ~2k sampled ids; partition is over files so _validate passes) — NOT
   --allow-count-mismatch (that disables the guard under test). Sequence:
   patch → gate --namespace → re-patch (no-op) → re-gate. Post-patch: run gate
   --namespace TWICE (second after indexing settles).

**Rides AFTER patch (tree side):** title/h1 tolerance normalize-not-exempt
(severity converged MEDIUM-HIGH; probe: total swallow when fires, unguarded);
base rule ownership-first (measured: primary "session dir not umbrella AFP-*"
flips exactly the 2 wrong cases — smt_word/word_lib then link HOL-Library.Word —
10/12 unchanged; all 819 $AFP aux copies are under AFP-* so no-op there);
rewrite merged <title>/<h1> to the symbolic path (user-visible copy, needs
approval); D54 bucket fixes (inherited -= own; generated pages to own bucket);
alarm counts pairs not occurrences (106 pairs = 425 refs, one ×253); gate
page-count figure; drop tree_fingerprint (keep theories_sha256 +
registry_fingerprint as audit seals); regex-completeness assertions; B13/B15/
B16/B17 cosmetics; B6 = docstring fix (bulk pre-check is BETTER than per-read).
Multi-line merge test fixtures (single-line ones can't tell the readings apart).

**USER DECISIONS to present:**
1. P1 → joint rec: DEFER computation, ADOPT sealed miss-list now — freeze the
   106 (page,fragment) pairs into a git-tracked `expected-counters.json` beside
   the plan; gate takes --expected and FAILS on any inherited miss outside it.
   Subsumes the alarm-baseline mechanism (D50 232, D51 1+path, D54 106 pairs
   enumerated; adopting a new baseline = a reviewed git diff).
2. D49 r6 amendment #2: ownership-first base rule + symbolic-path title rewrite
   (12 pages' user-visible titles) — or explicitly accept Zip_Benchmarks.Word
   cross-links on 2 distribution ML pages.
3. D54 alarm unit: pairs (code) vs references (plan text says "106 fragment
   references"; reality 425 refs behind 106 pairs) — pick one, correct the other.
4. Ship the tree now with the 2 known Zip_Benchmarks-linking pages and
   re-publish later, or fix-then-ship (source_link unaffected either way).
5. B2's include_attributes pre-patch 400 risk downgraded LOW (read-only,
   post-patch is the run that matters).

## Reviewer B's TURN-2 verdict (ARRIVED — round 3 CLOSED, both turn-2s in hand)

PATCH-READINESS: **GO with amendments — unchanged.** Proof that tree fixes don't
block: aux published paths = pure fn of sym; merge changes leave file_page_map,
every source_link and artefact hash 31a4b060… byte-identical → patch first,
re-publish later, NO re-patch (re-publish = mv old aside + gate).

B's BLOCKS-PATCH (minimal): (1) artefact off tmpfs — DONE; (2) patch retry
budget attempts=12 + Retry-After + jitter (62s vs documented 429 backpressure
at 1M unindexed rows — "highest-probability failure of the night"); (3) scratch
dry run ~2k rows, SHAPED WITH A TRIMMED ARTEFACT (A's shape: cut records to the
sampled ids so the count guard runs verbatim; NOT --allow-count-mismatch);
sequence patch→gate --namespace→re-patch(no-op)→re-gate; post-patch gate twice
(indexing settle). Preconditions: never --allow-count-mismatch; if count reads
1,337,025 the 16 twin rows survived — delete first (ids in B turn-1).
A wanted 4 more one-liners pre-patch (my synthesis: just do them, they're tiny):
_count() raises on non-int; endpoint-pinned sample ids[i*(N-1)//(sample-1)] +
reject --sample<2 (blind tail 2,682→0; bigger sample can be WORSE, 10k→7,141);
patch schema derived from namespace_schema (filterable divergence would SILENTLY
re-index live); done:0 checkpoint before first batch. Post-check add: --sample
500 AND 1000 (different blind windows) until pinning lands.

KEY TURN-2 RESOLUTIONS (B measured everything):
- A2 SHARPENED: title-first ordering CANNOT fix smt_word (the broken AFP-ALL-3
  copy's title names sym, the correct HOL-Library copy's does NOT — title rule
  picked the broken one BECAUSE of its title). Converged base rule, in order:
  ①non-umbrella-rendered ②title-names-sym ③sorted path. Measured on all 22
  groups: exactly 2 bases move (smt_word, word_lib — both fixed, then link
  HOL-Library.Word), 20 byte-identical; util.ML (all 3 copies umbrella) still
  decided by ②. Discriminator choice for ① = USER DECISION: path-prefix
  "Unsorted/" vs "session dir ∈ declared_sessions()" (B leans second).
- F-M1 converged (does half of A2's job): canonicalise <title>/<h1> text to
  "File ‹{sym}›" for BOTH comparison and output (regex _TITLE_TEXT sub);
  deletes the line exemption entirely; multi-line fixtures. A1 severity:
  A=HIGH B=MEDIUM (fix identical either way; cosmetic disagreement).
- P1 REJECTED as pre-patch (not for the ~10min compute — measured 254s+327s
  over 5.4GB — but because sealing a new field bumps ARTEFACT_FORMAT →
  invalidates 31a4b060… → re-run scan+map+publish before patch). B's cheaper
  shape: tolerate an inherited miss ONLY if fragment matches ^offset_ (all 106
  are; every composed is L<n>; renamed entity anchors FAIL again — kills A's
  test-shape complaint). A's shape: seal the 106 pairs in expected-counters.json,
  fail outside the list. COMBINABLE (predicate + baseline file). USER DECISION.
- D54 unit: report BOTH — "106 distinct fragments over 425 references"
  (max 253× on HOL.HOL.html#offset_20940..20947).
- A10 REFUTED: marks nest inside open spans on 91.77% of marks (A measured a
  different property); valid HTML, links land 20/20 — DO NOT assert.
- A8 endorsed with zero false positives measured (643,019 = 643,019 inside-tag
  parity on 1,565 files; css 520=520).
- A13 keep inference (fails closed); A15 CoreC++ '+' fine per RFC3986; A14 0
  today; A9 drop tree_fingerprint only, keep theories_sha256+registry_fingerprint
  audit-only (no downstream check — would break host-genericity).
- Baselines: both converge on committed site/expected-counters.json + gate
  --update-counters flag; NOT in artefact (baselines must survive regeneration
  so a change is visible). USER DECISION file-vs-artefact.
- Expect F-M2 to move the D50 baseline off 232 slightly (alarm working).
- D49r6 amendment #2 draft text is in B's turn-2 (quote it verbatim for user).

## B's PATCH GO-with-amendments (verbatim essentials)

Amendments before the run: (1) artefact off tmpfs — DONE, durable copies at
~/isasearch-pipeline/{map-artefact.json,scan-v2.json}, hashes self-verified
31a4b060cfb1 / c88bf4180d62; (2) raise retry budget; (3) scratch-namespace dry run
(~2k real rows: patch+gate+re-patch+re-gate); (4) NEVER --allow-count-mismatch —
if count reads 1,337,025 the 16 twin rows were never deleted live (they WERE:
deletion ran 2026-08-23, rows_deleted:16, count 1,337,009 verified; the 16 ids are
listed in B's report); (5) fix sample blind tail first or probe ids[-1] explicitly.
Invocation: patch --artefact ~/isasearch-pipeline/map-artefact.json
--namespace isasearch-2025-2-afp-2026-05-13 --region aws-us-west-2
--checkpoint ~/source-link-patch.checkpoint.json (key: source secret.sh; export
TURBOPUFFER_API_KEY="$turbopuffer_DEV_KEY"). Post: gate --namespace --sample 500
(+1000 for the other blind window), idempotent re-patch, one human click-through.

## Machine/data state

- Single host = this workstation. Rendered tree at
  ~/.isabelle/Isabelle2025-2/browser_info (synced from cslh19, 5.39GB/12,209 files).
- Local SYSTEM heaps REPLACED (user-ordered): cslh19's full set overlaid into
  contrib/Isabelle2025-2/heaps/polyml-5.9.2_x86_64-linux (32GB, 65 heaps, AFP-ALL-4
  loadable natively). Backup of pre-replace state:
  ~/Isabelle2025-2_local_system_heaps.backup_<ts>.tar.zst (zstd -t OK).
  ~/heaps-AFP-ALL4/ (30GB) is now a redundant sync source — user may order deletion.
- Published tree: ~/isasearch-published (+publish-report.json, artefact_hash
  31a4b060…; alarms external=232, stripped=1; D54 inherited misses=106).
- Live namespace: 1,337,009 rows (16 twin rows deleted 2026-08-23), NO source_link
  column yet.

## Commit state (all local, UNPUSHED — push only to origin, only when user asks)

Submodule contrib/Semantic_Embedding master: …→ e4d63ef (v2) → a5e5235 (v3+Q3-Q6)
→ f4c4ae6/928f8e3 (r6 amendment, Q4) → 71dd101 (D54) → 68d7ca1 (§17.7 URLs).
Super-repo main: … → 254beea (twin cleanup generators) → … → b98e9e9.
Tests: 109 green (test_site_source_pages.py + test_site_export.py); full suite has
10 pre-existing failures in OTHERS' interpretation-driver area — not ours.

## Standing rules (unchanged)

Ask before assuming; no coined terms (fixed vocabulary: the rendered tree / the
published tree / the file→page map / the artefact / the link-check gate /
source_link / D50 site-external / D51 input-dangling strips / D54 inherited
fragment misses / the alarm counters); user-visible copy needs verbatim approval;
memory writes need explicit approval; never `isabelle build` without explicit
command (REPL server exempt); never git stash/clean/reset; commit submodule on
master then bump super main by `git commit contrib/Semantic_Embedding` from root;
keys via source secret.sh, never into the repo; explain patiently in Chinese,
essence first; 吹毛求疵的意见一定要忽略; other agents' dirty files are not ours.

## After the review round closes

Consolidated Chinese report → user approves fixes (+ possible D49r6 amendment #2,
P1 adopt/defer, alarm-baseline mechanism) → apply + retest → scratch dry-run →
patch on user's word → gate --namespace → hosting decision (§17.8: 5.2GB tree,
largest page 23.2MiB vs 25MiB caps, CoreC++ '+' URL check) → the Worker (§12.2).

## POST-REVIEW RULINGS (2026-08-24, all user-approved — transcribe into the plan with the post-patch batch)

1. Pre-patch six fixes: APPROVED and DONE (attempts=12 + Retry-After + jitter in
   request(); _count() raises on non-int even with --allow-count-mismatch;
   endpoint-pinned sample ids[i*(n-1)//(sample-1)] + reject --sample<2;
   SOURCE_LINK_SCHEMA single declaration in site_export consumed by run_patch;
   done:0 checkpoint written before the first batch; scratch drill).
   112 tests green. Scratch drill PASSED end to end (2,000 real ids, schema
   minus source_link, patch -> sample 500 -> sample 1000 -> no-op re-patch ->
   re-sample -> cleanup). Measured on the drill: include_attributes naming the
   missing column PRE-patch is HTTP 400 — never run gate --namespace before the
   patch; post-patch it works (samples compared 500/1000, zero failures).
2. 裁决一 (D54): APPROVED via adversarial verification (VERDICT PASS,
   agent report in this dir's context): defer P1; adopt ANCHORED predicate
   ^offset_\d+\.\.\d+$ (A1) CONJOINED with the frozen 106-pair baseline (A2:
   fail-closed on a missing/unreadable baseline file; --update-counters refuses
   pairs failing the shape predicate and refuses to run while any other gate
   failure is outstanding); stale entries warn + prune on update (A3); gate
   FAILS (not logs) on any of the three counter mismatches D50/D51/D54 (A4);
   re-point test_an_inherited_fragment_miss_is_reported_not_failed — renamed
   entity anchor must FAIL, offset_ case stays tolerated (A5). Optional
   (recommended): --update-counters takes a rendered-tree path and confirms each
   newly tolerated pair is already missing in the input. Plan must state plainly
   that the baseline degrades to a wholesale replacement at corpus regeneration;
   defence 1 (anchored shape) is what survives regenerations.
3. 裁决二/三 (D49 r6 amendment #2): base copy chosen by the committed table
   site/aux-base-choices.json (11 entries: smt_word.ML + word_lib.ML ->
   HOL/HOL-Library; blast/clasimp/classical/hypsubst/splitter +
   atomize_elim/case_product/eqsubst/induct -> HOL/HOL); byte-compare after
   title/h1 canonicalisation to "File ‹{sym}›"; identical -> merge, divergent
   without entry -> hard error, stale entry -> hard error. Umbrella
   discriminator question DISSOLVED. Amendment text approved verbatim
   (2026-08-24 conversation; mapping-table version, NOT B's rule version).
4. 裁决四: alarm baselines in git site/expected-counters.json + --update-counters;
   never in the artefact. APPROVED.
5. 裁决五: patch FIRST, tree fixes + re-publish AFTER (no re-patch needed).
   APPROVED.

## PATCH EXECUTED (2026-08-24, user's explicit 开跑)

All 1,337,009 rows patched with source_link; row count unchanged before/after.
48 HTTP 429 backpressure events, all absorbed by the new retry budget
(attempts=12 + Retry-After + jitter). Checkpoint ~/source-link-patch.checkpoint.json
pins done=1337009 + artefact 31a4b060… . Post-checks ALL GREEN:
full gate + --sample 500 (zero failures), --sample 1000 (zero), idempotent
re-patch (no-op), settle-wait (10 min) gate --sample 1000 (zero).
Remaining: tree-side batch (aux-base-choices table + title canonicalisation +
gate twin defences + expected-counters.json + plan transcription) -> re-publish
-> §17.8 hosting decision -> §12.2 Worker. Commits still unpushed.

## NEXT ACT (post-compact 2026-08-24): the tree-side batch — everything below is USER-APPROVED, no further rulings needed

Order of work (all in contrib/isasearch-web since the migration, branch main):
1. F-M1: merge_aux_copies — canonicalise <title>/<h1> text to "File ‹{sym}›"
   for BOTH comparison and output (regex over the heading element, delete
   _TITLE_OR_H1 and the per-line exemption); multi-line fixtures.
2. D49r6 amendment #2 (mapping-table version): after canonicalisation compare
   copies BYTE-WISE. Identical -> merge. Divergent -> resolve ONLY via
   site/aux-base-choices.json (symbolic path -> rendered session dir);
   divergent-without-entry = hard error naming all copies + divergence summary;
   stale entry (copy gone or group no longer divergent) = hard error.
   Table is repo-internal input; umbrella session names in it are fine (§17.2
   only bans them from published output). The umbrella-discriminator question
   (Unsorted/ vs declared_sessions) is DISSOLVED by this design.
3. Initial table content (11 entries, measured 2026-08-24; 22 groups total,
   10 identical after canonicalisation, 1 more only-title -> also identical):
   {"ISABELLE_HOME/src/HOL/Library/Tools/smt_word.ML": "HOL/HOL-Library",
    "ISABELLE_HOME/src/HOL/Library/Tools/word_lib.ML": "HOL/HOL-Library",
    "ISABELLE_HOME/src/Provers/blast.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Provers/clasimp.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Provers/classical.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Provers/hypsubst.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Provers/splitter.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Tools/atomize_elim.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Tools/case_product.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Tools/eqsubst.ML": "HOL/HOL",
    "ISABELLE_HOME/src/Tools/induct.ML": "HOL/HOL"}
   (Provers/Tools divergences = HOL vs FOL loads of shared distribution tools,
   HOL picked because the corpus and readers live on the HOL line; smt_word/
   word_lib = HOL-Library's own load vs Zippy benchmark copy's re-load, the
   umbrella copy links Word.word -> Zip_Benchmarks.Word, 29+3=32 wrong hrefs,
   0 DB rows affected — both files absent from the artefact's files list.)
4. APPROVED AMENDMENT TEXT VERBATIM (for the plan's D49 ruling 6):
   > **Amended again, 2026-08-24.** The merged auxiliary page's `<title>` and
   > `<h1>` are rewritten to the symbolic path — the page names the file it
   > renders, not the session that happened to render it — and the tolerance
   > compares copies with the heading elements' text canonicalised rather than
   > exempting any line that contains one.
   >
   > The base copy is no longer chosen by a rule. After canonicalisation the
   > copies are compared byte-wise. A group whose copies are all identical
   > merges with no choice to make. A group with any surviving divergence is
   > resolved only by an explicit entry in the committed choice table
   > `site/aux-base-choices.json`, mapping the symbolic path to the rendered
   > session directory whose copy is published. A divergent group absent from
   > the table is a hard error naming every copy and a divergence summary; an
   > entry naming a copy that no longer exists, or a group that no longer
   > diverges, is equally a hard error — the table is an exact mirror of the
   > tree, and every choice in it is a reviewed human ruling, never a
   > heuristic. The table is repository-internal input; session directory
   > names in it never reach published output.
   >
   > Measured 2026-08-24 on the real tree: 22 multi-copy groups; 10 identical
   > after canonicalisation; 11 divergent — nine `src/Provers/` and
   > `src/Tools/` files loaded by both HOL and FOL (the table picks the HOL
   > rendering, the context this site's data lives in), and
   > `smt_word.ML`/`word_lib.ML`, whose umbrella copies record the Zippy
   > benchmark's re-load of the same physical file and link `Word.word` to
   > `Zip_Benchmarks.Word`, an unrelated AFP file, where the distribution's
   > own copies link `HOL-Library.Word` (the table picks `HOL/HOL-Library`).
5. Gate D54 twin defences per the verification agent's A1-A5 (see the ruling
   block above): anchored ^offset_\d+\.\.\d+$ CONJOINED with the frozen
   106-pair baseline in site/expected-counters.json; fail-closed on missing
   baseline; --update-counters refuses non-matching pairs and refuses while
   other failures outstanding; stale = warn + prune on update; gate FAILS on
   any counter mismatch (D50 232 / D51 1+target / D54 106 pairs, report
   "106 distinct fragments over 425 references"); re-point the shipped test
   (renamed entity anchor must FAIL); inherited -= own; optional
   --update-counters rendered-tree cross-check (recommended).
6. Smaller riders (from B's F-list): F-G2 page-count 9,979 not 9,870;
   F-A8 regex-completeness assertions (HTML inside-tag, CSS whole-file);
   F-A9 drop tree_fingerprint (keep theories_sha256+registry_fingerprint
   audit-only, docstring-marked); F-A7 four missing tests (build_relocation
   collision, export flag-pair refusal, artefact-before-network, --repo-root);
   A12 binary-target comment fix; doc fixes (publish docstring, os.rename
   outside try, validate checkpoint path early).
7. Transcribe ALL post-review rulings into SEMANTIC_SEARCH_SITE_PLAN.md
   (D54 amendment for the twin defences, D49r6 amendment #2 verbatim above,
   §17.5 counter-baseline mechanism, §17.6 patch-executed record, expect the
   D50 baseline may move off 232 after the base swap — that is the alarm
   working). Plan wording rule: baseline degrades to wholesale replacement at
   corpus regeneration; the anchored shape predicate is what survives.
8. Then: re-publish the tree (mv published/ aside, publish, full
   gate; NO re-patch — artefact hash 31a4b060… unchanged by design), verify
   smt_word.ML page now links /source/HOL-Library.Word.html (32 hrefs).
9. Then §17.8 hosting decision (USER decision: 5.2GB tree, largest page
   23.2MiB vs 25MiB caps, CoreC++ '+' URL round-trip check) and §12.2 Worker.

Housekeeping owed: many unpushed commits both repos (push only origin, only on
user's word); ~/heaps-AFP-ALL4/ 30GB redundant (user may order deletion);
human click-through of a few live source_links once hosting is up.

## TREE-SIDE BATCH EXECUTED (2026-08-24) — steps 1-8 above ALL DONE

In contrib/isasearch-web (its own repo since this date, pushed to GitHub):
- Steps 1-4: merge_aux_copies canonicalises <title>/<h1> to File ‹{sym}›
  (element-scoped, per-line exemption deleted), byte-compares, resolves
  divergence ONLY via site/aux-base-choices.json (11 approved entries
  committed); divergent-without-entry / no-matching-copy / no-longer-
  divergent / orphaned entries all hard errors.  Real-tree dry run: 22
  multi-copy groups = 11 identical after canonicalisation + 11
  table-resolved, bases exactly as ruled.  Amendment text transcribed
  verbatim into the plan (D49 r6).
- Step 5: gate twin defences per A1-A5: anchored ^offset_\d+\.\.\d+$
  fullmatch (defence 1, unconditional fail otherwise) + frozen baseline
  site/expected-counters.json (defence 2); fail-closed on missing file;
  gate FAILS on any D50/D51/D54 counter mismatch; inherited -= own;
  --update-counters refuses while non-counter failures stand, warns+prunes
  stale pairs, and --rendered cross-checks each newly tolerated pair
  against the input tree.  A5: renamed-entity-anchor test now asserts
  FAIL.  Baselines bootstrapped from the real tree WITH the cross-check:
  D50 232, D51 1 entry, D54 106 pairs — committed.
- Step 6 riders: F-G2 (pages counted once per pass-2 entry — real figure
  9,979), F-A8 assert_reference_completeness in publish AND gate, F-A9
  tree_fingerprint dropped (other two seals docstring-marked audit-only),
  F-A7's four tests, publish-docstring bulk-precheck fix.  A12's exact
  finding is unrecoverable from the ciphered review transcripts; the
  stale binary-target test comment (which asserted the old D54 hole) was
  rewritten — likely the same item.
- Step 7: plan transcription done (all five rulings + §12.1 migration
  amendment + measured no-move of D50).
- Step 8: re-published (old tree kept at published.pre-basefix-20260824,
  5GB, deletion is the user's call).  Publish: 10,595 theory pages, 1,139
  aux pages, 486,346 marks, 11 merged conflicts, D50 232 / D51 1.  Full
  gate GREEN: 15,970,528 refs, D54 106/425 tolerated under both defences,
  ALL baselines unchanged (no --update-counters needed).  smt_word.ML now
  links /source/HOL-Library.Word.html on all 29 hrefs, word_lib.ML on 3
  (32 total, as predicted); headings canonicalised.  NO re-patch (artefact
  31a4b060… untouched by design).
- Tests: 128 green.  isasearch-web pushed through commit 3e7fc5e (+ this
  handover/gitignore commit); super-repo bumps remain UNPUSHED.

NEXT: §17.8 hosting RULED 2026-08-24 = Cloudflare R2 behind D17's
isabelle-semantics.qiyuan.me + a /source/* cache-everything edge rule
(.html is not in Cloudflare's default cache list); chosen over Pages to
buy out the 25MiB per-file cap (largest page NOW 23.6MiB with marks,
5.6% headroom) and the 20k-file deployment cap (11,750 files).
UPLOAD DONE (2026-08-24): the user created bucket `isasearch` (WNAM,
S3 endpoint https://532d99283b5aa1e02486ee3fdcb163d5.r2.cloudflarestorage.com)
and a bucket-scoped Object Read & Write token (secret.sh:
R2_ISASEARCH_ACCESS_KEY_ID / R2_ISASEARCH_SECRET_ACCESS_KEY).  The whole
published tree rides at object keys `source/<rel>` — the key equals the
site URL path minus the leading slash.  rclone (env-config, NO config
file; MUST set RCLONE_S3_NO_CHECK_BUCKET=true — a bucket-scoped token
cannot HeadBucket/CreateBucket and the 403 looks like a write denial;
expect spurious 501 NotImplemented from a checksum quirk, rclone's
retries absorb them).  VERIFIED: rclone check 11,750/11,750 matching,
0 differences, 5.043 GiB; 4 spot files byte-identical (largest page and
smt_word included); content-types correct (text/html; charset=utf-8 /
text/css / font/ttf).
STILL TO WIRE (with §12.2 step 5, the Worker): the Worker owns
isabelle-semantics.qiyuan.me and serves /source/* from an R2 BINDING
(no extra credentials; needs Workers deploy permission when we get
there), edge caching for the pages, the CoreC++ '+' round-trip check on
the final domain, and the user's click-through of live source_links.
Housekeeping also now includes published.pre-basefix-20260824 (5GB,
user may order deletion).
