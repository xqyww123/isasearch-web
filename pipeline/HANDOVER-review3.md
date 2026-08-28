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

## DEFERRED BY THE USER (2026-08-24 design session) — do not lose

- theoryCaveat trigger gap: D29's amendment (kinds default NONE, empty =
  no restriction) breaks the D15 notice's trigger in the DEFAULT state —
  the design tests `kinds includes a theorem-alike`, false on an empty
  selection, yet an empty selection makes theorems eligible and the
  surprise applies.  Correct predicate: (kinds empty OR includes
  theorem-alike) AND (a condition reaches Theory Name directly or via
  All).  Needs: one-line design fix + a sentence in COPY.md §3.4's
  trigger note.  User said 之后再说 — raise before the front end ships.

## NEXT ACT (post-compact #2, 2026-08-24 late): BUILD THE WORKER (§12.2 step 5) — user's explicit go

User ruled: compact, then start the Worker. All prerequisite rulings are
in hand; no further approvals needed to write code. The plan's §11.1
(rate limits), §6.3 (query construction), §6.6/D36-as-amended (fusion +
the BM25 checkbox's two states), §8.2 (namespace naming), §9 (front end,
still NOT to be built beyond what the Worker API needs), §17 (source
pages, already served from R2) are the governing sections.

Worker requirements digest (verify each against the plan when building):
- Endpoints: the search API (query -> Fireworks embedding -> turbopuffer
  multi_query -> fused 200) + serving /source/* from the R2 bucket
  `isasearch` binding (object key = URL path minus leading /), with edge
  caching for the pages (a page is immutable within a corpus generation).
- Two retrieval states (D36 amendment): checkbox selected = vector leg +
  BM25 leg over `interpretation`, server-side RRF (k=60), each leg 200,
  fused truncated to 200; cleared = vector leg alone, top 200. Filter
  tree attached to BOTH legs, or the single leg. Filter-first guarantee
  (mask then top-N) — post-filtering a fetched top-N is FORBIDDEN, even
  as a fallback.
- Kind selection: empty = NO kind condition sent (D29 as amended).
- D48: no relevance numbers anywhere in responses shown to users.
- D42: empty source_link = absent form.
- Rate limits §11.1: 5/IP/10s at the edge, 1000/IP/day in KV, global
  bucket deferred; D28 no spend cap; log every 429 with its layer.
- Query embedding: Fireworks Qwen3-Embedding-8B, cache by query text
  (cost, not latency); 8000-char query cap (D29/D40 wording in COPY.md).
- Region: everything North America (D18); Smart Placement on.
- Acceptance item from §6.6: run one highly selective filter against the
  real 4096-dim index and record whether ANN returns the filtered set's
  best members (a few hundred matching docs) — pre-launch requirement.
- Deployment needs a Cloudflare token with Workers deploy permission —
  ASK THE USER when reaching deployment; coding needs none.
- Worker owns isabelle-semantics.qiyuan.me (D17); domain wiring, the
  /source/* cache rule, the CoreC++ '+' round-trip check and the user's
  source_link click-through all land at deployment time.

State at compact:
- Work tree has UNCOMMITTED changes (user rebuked commit spam; commit
  ONLY on the user's word, push ONLY on the user's word):
  site/design/IsaSearch.dc.html (landing prose justified + full-width,
  panel-foot symbols note widened+justified, "The filters are optional"
  rename), site/COPY.md (rename in the landing line and §5.7),
  pipeline/HANDOVER-review3.md (this file).
- 6 local commits ahead of origin/main (through dccad41) — unpushed.
- Design session rulings all transcribed: Filters heading (D22 amend),
  kind default none (D29 amend), BM25 checkbox label+hover (D36 amend,
  user's verbatim sentence), no totals/scores; the merged design carries
  the user's pass + the 8-18 copy alignment (commits 7aefd1b/466e4ad).
- DEFERRED (see block above): theoryCaveat trigger gap under empty-kinds
  default — raise before the front end ships.
- Housekeeping unanswered: push?, delete published.pre-basefix-20260824
  (5GB)?, delete ~/heaps-AFP-ALL4/ (30GB)?
- COPY.md standing conditional: draft 4 unread by readers; reader pass
  owed before final approval (plan §13b).

## THE WORKER IS BUILT (2026-08-24, post-compact #2 — §12.2 step 5 executed)

Code at `worker/` (repo root — layout choice NOT yet confirmed by the user;
the pre-migration §12.1 table said `site/worker/`). Files: `wrangler.toml`
(no credential; TPUF_NAMESPACE/TPUF_REGION/FIREWORKS_MODEL as vars; R2
binding SOURCE_BUCKET=isasearch; KV bindings RATE_KV/EMBED_KV with ids to
fill at deployment; Smart Placement on), `src/index.js` (routing, /source/*
off R2 + edge cache, daily KV gate, search handler), `src/search.js` (pure:
validation, §6.3 compilation, both retrieval states' turbopuffer bodies,
D5 collapse, D26 marking), `src/kinds.js` (11 stored kinds; {kinds} phrase
port of render_kinds; the exact embedding input text), `src/embed.js`
(Fireworks + KV cache keyed on SHA-256 of the exact sent text),
`test/search.test.mjs` (12 green: `node --test worker/test`),
`probe/live_probe.mjs` (8/8 PASS live 2026-08-24), `worker/README.md`
(API shape + deployment list). Repo README updated; .gitignore covers
.dev.vars/node_modules/.wrangler. ALL UNCOMMITTED (commit/push only on the
user's word).

Verified live (dev key, read-only): Fireworks embedding 4096-dim through
the library's instruction template ("Instruct: Given a natural-language
description, retrieve the most relevant Isabelle/HOL {kinds}\nQuery: …" —
the {kinds} phrase varies with the kind selection, so the embed cache keys
on the full sent text, which subsumes "by query text"); fused multi_query
accepted (fused rows sit at results[0].rows, single-leg at rows — measured);
root-level limit caps at 200; filters ride both legs (0 leakage on
excludes(all)); ~0.06%-selective kind filter still fills 200; 200 rows →
180 cards (D5); end-to-end under `wrangler dev --local`: top card for the
sorted-list query is List_Ins_Del.sorted_snoc_iff with source_link
/source/HOL-Data_Structures.List_Ins_Del.html#L15; error codes
query_missing/condition_empty(+index)/kind_unknown/daily_limit all
exercised; /source/HOL.List.html served from local R2 with correct
content-type/cache headers. compatibility_date pinned 2026-05-03 (local
workerd ceiling; nothing newer needed).

Measured and transcribed into §6.6: turbopuffer bills a multi_query ONCE
PER LEG (23,971,467,722 billable bytes on a two-leg query ≈ 2× namespace).

RAISE WITH THE USER (found while building, not fixed silently):
1. worker/ vs site/worker/ placement — confirm or order the move.
2. D38's sentence "the export additionally stores, on every record, the
   full set of kinds its group appears under" is NOT in the shipped schema
   (§6.1/site_export.py have only the single `kind`). A card's kind badges
   therefore union only the rows that reached the 200 — exactly the
   variance D38 said the stored set would prevent. Options: patch a
   `kinds` column later (patch_rows, like source_link) or amend D38.
3. Embed-cache TTL 30 days and MAX_CONDITIONS=64 body bound are the
   author's numbers, not ruled.

DEPLOYMENT (needs the user): a Cloudflare token with Workers deploy
permission; then wrangler kv namespace create ×2 (fill ids), the three
`wrangler secret put` (turbopuffer READ-ONLY key — must be issued;
dev key never deploys), custom domain isabelle-semantics.qiyuan.me (D17),
the edge rate rule 5/IP/10s (§11.1 layer 1), the /source/* cache rule,
CoreC++ '+' URL check, the user's source_link click-through.

## WORKER REVIEW ROUND CLOSED (2026-08-25) — all rulings applied, code reworked

2-turn adversarial review (two Opus reviewers, correctness + elegance):
7 findings refuted, 13 should-fix + nits applied, 6 rulings taken by the user.

Rulings (all transcribed into the plan / COPY.md):
- worker/ at repo root (§12.1 note).
- R1 = (b): D38's stored group-kind union WITHDRAWN (struck in D38, noted in
  D5); Introduction rule button hover DELETED (COPY §3.6 note). No `kinds`
  column, no patch.
- R3: "normalised query" = NFC + trim + inner whitespace folded (§11.1).
- R4: asset sentinel BUILT as companion namespace `<ns>.asset` (every tpuf
  row must carry a vector — measured — so not a row in the data ns). Written
  for the live ns: isasearch-2025-2-afp-2026-05-13.asset, digest 9fadd5c55bc9…
  = sha256(site/tokenizer/asset.json). Export writes it after a full run;
  `--asset-sentinel-only --namespace` for old namespaces. Retire with its ns.
- R5 = (a): layer 2 in ONE Durable Object `DailyGate` (SQLite): counters(day,
  ip_hash, count, country, asn) + daily(day, searches, rejected, addresses);
  ip_hash = sha256(FIXED salt | ip); asn stored, as_org not; usage stats are a
  new ruled purpose. KV RATE_KV binding removed; EMBED_KV stays.
- R6: D26 exception KEPT; C1 fixed (All panel counts; theoryParts from
  compileRequest).
- Smart Placement governs /source/* — accepted, recorded under D18.
- Layer 1 edge rule scoped to /api/search (§11.1, README).

Code state (worker/): kinds.js one table + canonicalKinds (dedupe, fixed order,
all-eleven ≡ none); search.js normalizeQuery, bm25 boolean-validated, always a
multi_query (one-leg without rerank_by for semantic-only — measured 2026-08-25
identical rows, billed one leg), rerank_by ['RRF',{rank_constant:60}], rowsOf
requires exactly one results entry, collapse uniform '' defaults; embed.js put
via ctx.waitUntil; index.js no decodeURIComponent, body bound by arrayBuffer
byteLength, HEAD derived from a canonical GET cache key + Content-Length,
CONTENT_TYPES = html/css/ttf/json, sentinel check once per instance, DO gate
with cf.country/cf.asn, 429 log carries ipHash; gate.js the DO; wrangler.toml
Text rule for asset.json, DO binding + migration v1.
Verified: 19/19 unit tests; probe 9/9 live; wrangler dev end-to-end (All-panel
marking, kinds order, chunked 300KB → 413, %ZZ → 404, HEAD body 0 +
Content-Length, gate: exactly 1000 allowed then 429 w/ Retry-After, daily row
2026-08-25|1000|8|1; sentinel refusal → 502 with logged reason). Python 128 green.
Local state and .dev.vars removed after each run.

Still UNCOMMITTED, push only on the user's word. Deployment list unchanged
(Workers token from the user; READ-ONLY tpuf key; EMBED_KV id; domain; edge
rule scoped; cache rule; click-through).

## DEPLOYED (2026-08-25)

Live: https://isabelle-semantics.qiyuan.me (Worker `isasearch`, version
92c26a5d…; workers.dev alias isasearch.xqyww123.workers.dev). Done: EMBED_KV
47c37534…; DO migration v1; secrets TURBOPUFFER_API_KEY (READ-ONLY key
`turbopuffer_ISASEARCH_READ_KEY`, verified: query OK, write 403, list 403),
FIREWORKS_API_KEY (dedicated `FIREWORKS_ISASEARCH_KEY`), IP_HASH_SALT (kept in
secret.sh as ISASEARCH_IP_HASH_SALT); custom domain + DNS; zone http_ratelimit
rule "isasearch: 5 searches per IP per 10 s" on /api/search only (verified:
6th quick request 429, fonts unaffected); zone cache rule "/source/* at the
edge" 30 d (verified HIT); CoreC++ '+' 200; #L15 anchor live. Deploy token =
least-privilege `isasearch-deploy` (CLOUDFLARE_API_TOKEN in secret.sh; minted
via the user's CLOUDFLARE_GOD_KEY — the classifier blocks me from minting/
deploying/putting secrets, so those commands are run by the user with `!`).
Owed: user click-through; latency re-measure after Smart Placement settles
(1.4–2.5 s/search from SG in the first hours); republish must purge zone cache.

## NEXT ACT (post-compact #3, 2026-08-25): BUILD THE FRONT END (§12.2 step 6, phase two, D32) — user's explicit go

State at compact: backend fully live at https://isabelle-semantics.qiyuan.me
(commits through 9f1216b, pushed; work tree clean; Smart Placement hint wnam →
remote-LAX, 1.0–1.7 s/search from SG; user click-through of source links
PASSED; one-shot cron 8-26 09:23 re-measures latency, session-only).

Inputs (read these first, in this order):
1. site/COPY.md — THE source of every visitor-facing string (§0–§9; §10 lists
   what is deliberately unwritten). The mockup follows it, never the reverse.
   Standing conditional: draft 4 owes a reader-testing pass (plan §13b) before
   FINAL approval — raise before the front end ships, not before starting.
2. site/design/IsaSearch.dc.html (+ support.js, the Claude Design runtime, not
   edited) — the settled mockup: landing (search box, checkbox labelled with
   the user's BM25 sentence, "Filters" panel group with five panels + Kind
   buttons, none selected by default), result list (20/page, "previous 20 ·
   next 20", "Showing results 1 to 20"/"Showing all «n» results", no totals,
   no scores, no timing), cards, expanded explanation, theory line (D26),
   §4.6 "was read as" notice, empty states, entity page sketch. Rule §9.1b:
   replicate its own styles; design nothing new. Turning it into a real page
   means REPLACING support.js's data-binding with real fetch + rendering —
   ask the user whether the front end is (a) a static HTML+JS page served by
   the Worker at `/`, or (b) generated; plan §9.5 says server-rendered from
   the Worker, no framework.
3. worker/README.md — the API contract (POST /api/search body + response:
   results cards, limit_reached, parts, matched_theories; error codes). The
   Worker has NO `/` route and NO entity-page route yet: both are front-end
   work and land in worker/src/index.js.
4. Plan §9 (9.1 layout, 9.2 the literal-matching education, 9.2b D15 amber
   sentence, 9.3 fonts — subset IsabelleDejaVu to WOFF2 + live `==>`→`⟹`
   replacement for unambiguous abbrevs only, from etc/symbols `abbrev:`
   fields; 9.4 entity pages one per `group` at a stable URL — URL scheme NOT
   yet chosen, ask; sitemaps sharded 50k, ordered distribution-first then
   AFP, name-addressed before theorem-alike; related entities from the ten
   nearest vectors; 9.5 server-rendered), D25 (entity pages ship in the first
   release; cards link to them from day one), D30 disclosure text, D42 absent
   source-link form, D48 no numbers.
5. DEFERRED, must fix before shipping: theoryCaveat (D15 amber sentence)
   trigger under the empty-kinds default — correct predicate is (kinds empty
   OR includes a theorem-alike) AND (a condition reaches Theory Name directly
   or via All); mockup line ~894 uses st.kinds.some(...) which is false when
   empty. Needs a COPY §3.4 sentence? — raise with the user.
6. Entity page needs a Worker query by `group` (filter ['group','Eq',g],
   attributes incl. interpretation, all kinds of the group) + related
   entities (vector ANN with the entity's own vector — vectors are not
   returned by include_attributes; needs a design: re-embed the
   interpretation? or store? ASK the user; §9.4 says "ten nearest vectors").

Discipline unchanged: commit/push only on the user's word; no coined words;
user-visible copy verbatim from COPY.md or user-approved; ask before any
design deviation; deploy/secret commands are run by the user with `!` (the
classifier blocks me); never `isabelle build`.

## FRONT END BUILT (2026-08-25) — local, not yet deployed

Built and verified in the browser (the user's Chrome via MCP, plus headless
screenshots): landing, result list (20/page, previous/next, §4.5 end copy),
cards (kind labels, D26 theory line, clipped long expressions, explanation
with D30 text, copy, source link/absent form), Filters panel group (four
condition panels, contains/excludes, Kind buttons, BM25 checkbox, Clear all,
collapsed summary, §3.4 amber note incl. the empty-selection reading),
abbreviation replacement (36 entries, `site/build_abbrevs.py`), §5.1–5.7 empty
states, §6/§7 messages, about page (COPY §14), entity page
(`/entity/<key>`, ten nearest by the record's own vector).

Rulings of the day, all recorded in the plan/COPY: page-per-record (D9
amended), URL = universal key base64url (BLAKE2b port), collapse golden
standard (D5 amended; `group` column unused), entity count 1 230 467 +
build date in the sentinel row (live row restamped), PhiSymbols font (uploaded
to R2 `source/fonts/`), header links about/source, no dark theme, §4.6 notice
DELETED, no `?q=`, no "Type the symbols directly" paragraph, product name
"Isasearch" in visible text. Q13: re-export with `_`/`.` as tokens — deferred.

Before deploying: `wrangler deploy` (user runs it; `[assets]` is new — first
deploy uploads site/app/public). Then live re-test: `/`, `/about`, one
`/entity/…`, a search from the page. Still owed before "shipped": COPY draft 4
+ §14 reader testing (§13b); sitemaps (§9.4, 1.34 M URLs). `worker/.dev.vars`
exists locally for `wrangler dev` — delete when done.

## NEXT ACT (post-compact #4, 2026-08-25): READER TESTING OF THE COPY, THEN DEPLOY — user's explicit go

State: front end built, browser-verified, committed and pushed (5aea8e0).
NOT deployed. The user ruled the order: reader testing (§13b) → user's
final approval of site/COPY.md → `wrangler deploy` (user runs it with `!`:
`cd worker && source ~/Current/MLML/secret.sh && npx wrangler@4 deploy`)
→ live re-test of /, /about, one /entity/…, one search → delete
worker/.dev.vars (a local `wrangler dev` on :8787 may still be running;
kill by PID, never `pkill -f wrangler`).

Reader testing, how (§13b, done three times before — see COPY.md §12 for
what each round changed): several independent subagents, each given ONLY
the visitor-facing text (COPY.md's quoted blocks — §2, §3, §4, §5, §6, §7,
§8, §14 about page — not the commentary), answering a fixed set of
questions (what the site does / cannot do; what `sorted` matches; does
`sort` match `sorted_wrt`; what an empty kind selection means; what a Theory
Name condition does on a theorem; what the daily limit counts; who wrote the
explanations), plus one skeptic hunting contradictions and undefined terms.
Report in Chinese; the user approves COPY.md verbatim; then deploy.

Open observation for the user: under the collapse golden standard, two AFP
entries carrying the same theory file (Separation_Logic_Imperative_HOL and
Van_Emde_Boas_Trees, Syntax_Match.thy) yield two identical-looking cards,
told apart only by the source link. Default: keep as is.

Later: sitemaps (§9.4) with the Q13 re-export (`_`/`.` as tokens, tests the
one-command pipeline); post-deploy code review; usage-stats endpoint.

---

## STATE AT COMPACT #5 (2026-08-25, evening) — DEPLOYED, ONE COMMIT AHEAD

**The site is live with today's work.** Deployed version `6e38ad41`; verified on
the live site right after: the landing intro and placeholder, the about page's
seven-row table, three-decimal similarities in the API, and — the point of the
day's biggest change — the same query with and without `kinds:["lemma"]` gives
identical similarities and order for the top three (0.884 / 0.881 / 0.875), so
the kind selection filters and no longer reranks.

**Four commits on `main`, none pushed:**
`64914bf` the front end pass · `0d9589f` usage statistics + `daily_geo` ·
`9a5a5eb` the entity page reads the one string table · `f466ed1` sticky footer.

**`f466ed1` is NOT on the live site** — the user ruled it rides with the next
deployment.

### What changed today, in one place

Retrieval: BM25 and the RRF fusion are gone (the user judged the hybrid results
worse); the query instruction is fixed to the constant phrase, so the kind
selection no longer enters the query vector (plan §6.3b, D29/D36 amended); the
cards print the cosine similarity to three decimals (reversing D48, whose ground
was the fused score).

Interface: Syntactic Filters, collapsed on arrival, four panels — the All panel
and all five panel-heading hovers are deleted; the foot of the group is the
user's own line beside Clear All; the card is one column with the source
location and the similarity on the name's row; the pager says where you are; the
end-of-list copy no longer says "No more results" when more exist; the entity
page's theory chips link to their published source; the about page opens with a
table of what the site knows about itself, including the embedding model and the
two usage numbers.

Storage: `daily_geo (day, country, asn, searches)`, kept for good — country and
AS used to live only in the two-day rate-limit table and were being discarded
nightly, which was an oversight and not a ruling.

`site/COPY.md` is draft 5 and matches the built site; nothing in it is
outstanding.

### NEXT ACTS

1. **Purge the Cloudflare edge cache** if it has not been done since the deploy
   — entity pages are edge-cached four hours (`/` and `/about` are NOT edge-cached
   at all — browser only, one hour; corrected 2026-08-26 against worker/src/index.js),
   and `/source/*` thirty days by the zone rule, so visitors
   may still be served the old copy. Dashboard → qiyuan.me → Caching →
   Configuration → Purge Everything (the zone is Free; purge-by-prefix is
   Enterprise-only).
2. **Push** the four commits (origin only — the repo has four remotes).
3. **Housekeeping**: the local `wrangler dev` is still running and
   `worker/.dev.vars` still exists; both can go now that the deploy is done.
4. Later, all previously deferred: the sitemaps (§9.4, ~1.34 M URLs); Q13's
   re-export with `_` and `.` as matchable tokens, which also tests the
   one-command publish; an authenticated endpoint over `stats()` and `geo()`,
   which nothing reads yet.
5. Undecided and harmless: the thin-space digit grouping (`1 230 467`) against
   the user's comma form (`1,230,467`) — COPY §1's rule stands unless he says
   otherwise.

---

## STATE AT COMPACT #6 (2026-08-26) — D55 LANDED, NOT DEPLOYED, RELEASE.md NEXT

### What the live site serves right now

Version `6e38ad41`, deployed 2026-08-25. It is **five commits behind** the
repository and knows nothing of D55. Namespace `isasearch-2025-2-afp-2026-05-13`.

### The five unpushed commits (origin only — one remote, `origin`)

```
f7ff912  COPY's glossary retires "the associated theories"
fb32295  The Defined in line moves under the statement box, where it can be seen
da0b63a  The plan records D55, and §6.1 matches the code again
3cce114  Theorems get a defining theory, and the theory field stops meaning two things
bceafca  An Isabelle/ML position prints its own path, not a theory that is not there
```

Working tree clean. 131 Python tests and 31 Node tests pass.

### D55 in one paragraph

A Theory Name condition used to mean two things: a name-addressed entity's
declaring theory, a theorem's ~7 constituent theories. It now means one — the
theory the entity is **written in** — derived in the export from the source
position through §17's map, and stored. `theories` ([]string) became `theory`
(string); `constituent_theories` ([]string, display-only, unindexed, sorted) is
new; `group` and `interpretation`'s full-text index are deleted, as are
`THEORY_SEPARATOR`, its probe, and D26's card marking. Coverage 99.95 % of
theorem-alike, 100 % of name-addressed, 533 records resolve to `''` and match
no Theory Name condition. `HOL.` selects 4.0 % where it selected 98.6 %.

### NOT DEPLOYABLE ALONE

The Worker asks for `theory` and `constituent_theories` in `include_attributes`;
the live namespace has neither, and turbopuffer answers **HTTP 400** on the whole
query, not a null. Measured 2026-08-26. So the code ships only with a re-export
into a new generation.

### Live measurements taken today, for the release checklist

| step | command | measured |
|---|---|---|
| scan | `python3 src/site_source_pages.py scan --out <path>` | **30 s**; 1,341,843 records, 9,818 linkable position files, 486,655 (file, line) pairs |
| map | `python3 src/site_source_pages.py map --scan <s> --rendered ~/.isabelle/Isabelle2025-2/browser_info --theories ~/Current/MLML/data/theories.json --out <path>` | **7.6 s**; 10,595 theory pages, 1,165 aux copies of 1,139 symbolic paths, residue 0, **linked 1,329,092 of 1,341,843 (99.05 %)** |
| export | `python3 src/site_export.py --source-links <artefact> [--namespace N] [--limit N]` | ~103 docs/s ⇒ ~3 h 36 m for the full corpus |

`publish` takes `--rendered --artefact --out` (out must not exist); `gate` takes
`--published --artefact [--namespace --sample --update-counters --rendered]`;
`patch` takes `--artefact --namespace --checkpoint [--limit]`.

**The committed `pipeline/map-artefact.json` is stale**: the store has moved
**4,834 records** past it, and `iter_documents`' A3/B5 guard refuses such a run.
A release therefore *starts* with scan + map — 40 seconds, so no reason not to.
Today's fresh pair is in the job tmp dir (`scan-new.json` `f024ff84cb98`,
`map-new.json` `ec9da0bd000f`); they were NOT committed, because committing a
map implies republishing the tree it describes.

### Temporary things that MUST be cleaned up

1. **turbopuffer**: `isasearch-preview-20260826` (27,904 real records in the new
   schema) and `isasearch-preview-20260826.asset`. Built with the DEV key for a
   local preview. The live namespace was only ever read.
2. **`worker/.dev.vars` carries `TPUF_NAMESPACE=isasearch-preview-20260826`** —
   a line that did not exist before. Remove it, or local dev silently talks to a
   2 %-slice namespace. (The file is git-ignored; the live target lives in
   `worker/wrangler.toml`.)
3. A `wrangler dev --local --port 8787` is running, serving that preview
   namespace. It is ours, started 2026-08-26.

### NEXT TASK, as the user set it

**Write `docs/RELEASE.md`** — there is no release checklist anywhere; the steps
are scattered over plan §17.1–17.7, §8.1–8.2, §12.2 and `worker/README.md`, and
none of them states the order. Then **run reader agents over it and iterate**.
The user asked for the documentation skill for this.

Shape agreed before the compact: a numbered, checkable order, each step carrying
the exact command, what its output should look like, what it protects against,
and what to do when it fails. Plan = why; RELEASE.md = which keys in what order.
Then execute this release against it and fill in the observed numbers, so the
document is verified rather than imagined.

Skeleton sketched (unreviewed): 0 preflight → 1 scan → 2 map → 3 publish →
4 gate → 5 upload to R2 → 6 export → 7 verify → 8 deploy (`TPUF_NAMESPACE` in
wrangler.toml + `wrangler deploy`) → 9 live acceptance → 10 purge the zone cache
→ 11 delete the old namespace, update `pipeline/`.

### Decisions — one still open (2026-08-26)

1. **OPEN — does Q13 ride with this re-export?** (`_` and `.` kept as matchable
   tokens — plan §16.8's Q13, user 2026-08-25 "有必要重新导入", deferred until the
   front end shipped, which it has.) Marginal cost zero if combined; a separate
   3 h 36 m export otherwise. It needs both tokenizer implementations changed, the
   `tokenizer_rule` bumped, asset + `expected.json` regenerated, and COPY
   §0/§3.5/§5.1 rewritten and reader-tested. **It was additionally blocked by the
   §16.6 gate being half-dark; that is repaired (see below), so the path is open.**
2. **RULED yes** — `publish` + `gate` + the R2 upload are part of this release.
   Without them the ~12,751 records new since the last publish would have links
   landing at the top of a page instead of on their line.
3. **RULED** — step 5 uploads with `rclone copy` and the deleting `sync` waits until
   step 11, after acceptance. R2 has no staging, so step 5 writes into the prefix the
   live site is already serving; deleting there while the old index is still live
   would 404 real visitors. End state identical.

### Still deferred, unchanged

Sitemaps (§9.4, ~1.34 M URLs); an authenticated endpoint over `stats()`/`geo()`;
the 10.7 s first-request latency after an idle period (three candidate causes,
one measurement, needs a spaced probe); thin-space vs comma digit grouping
(COPY §1's rule stands).

### Rulings made today, all already in COPY and the plan

- The `.ML` source line prints `$AFP/AutoCorres2/utils.ML:123` and
  `~~/src/HOL/Nominal/nominal_thmdecls.ML:175`, `~~` unchanged.
- COPY §4.4's coverage figure: 99.28 %, not the pre-backfill 80.2 %.
- The entity page section is `Theories of the constants used`, theorems only.
- `Defined in <theory>` sits **under the statement box, outside it** — the first
  attempt put it inside the Source block, where the user could not find it.
  Always shown; omitted only when there is no theory; **not on the result card**.
- `constituent_theories` is sorted by the export.

---

## STATE AT COMPACT #7 (2026-08-26, late) — Q14 OPEN ON AN UNEXPLAINED FAILURE

### NEXT TASK, as the user set it: find out why 41

**Reproduce and explain**: at 1,200,000 rows, the condition `x + y` (2,831 true
matches, so a full page is available) returned **41 of `top_k` 200** under a bare
`Glob` and under a bare `Regex` over the `\n`-joined subtoken column, while
`ContainsTokenSequence` returned 200. At 400k it was 97; at 100k it was fine. Adding
`ContainsTokenSequence` clauses on the pattern's literal runs — logically implied, so
they cannot change the answer, and verified not to — restored 200 in every case.

**The mechanism is NOT known.** An earlier write-up of this in the plan asserted a
cause (index-backed prefilter versus unindexed scan) that was *constructed, not
verified*; that wording has been corrected. Two things make the gap serious rather
than academic: the failure is silent, and turbopuffer's own documentation attaches the
partial-postfilter recall warning to `ContainsTokenSequence` — which showed **no** loss
anywhere, including live at 1,337,009 rows with real vectors, checked set-wise and
rank-wise against locally computed ground truth — and *not* to `Glob`/`Regex`, which
are the ones that lose. That inversion is unexplained, and it means the model of this
subsystem is wrong somewhere.

Three experiments, cheapest first, written out in plan §13's Q14:
1. **Raise `top_k` on a bare `Regex`.** If the cause is a fixed ANN candidate budget
   followed by post-filtering, `top_k` 2000 should return ~410 usable rows, not a full
   200. A full 200 falsifies that hypothesis and points elsewhere.
2. **Ask turbopuffer.** Their `Regex` warning says to contact them; their docs
   reference a "Native Filtering" article on how filters combine with ANN.
3. **Measure the case never measured**: the `All` panel's three-way `Or` of narrowed
   filters, and cross-field combinations — where an unexplained repair is likeliest to
   stop working.

**Reproduction cost**: the probe namespaces were deleted. Scripts and every raw log are
preserved at `~/isasearch-pipeline/regexprobe/` (5.6 MB, four sizes). Rebuilding 1.2M
rows at 64 proxy dimensions is ~25 minutes at ~320 rows/s; 4096 dimensions runs at
~23 rows/s, which is why the large namespaces used reduced dimensions.

**Do not write Q14 into an implementation plan until 1 or 2 answers the question.**

### Done and pushed today

- **`docs/RELEASE.md`** — the release checklist, which did not exist. Five rounds of
  reader agents; they found an ordering bug (acceptance ran before the cache purge),
  two rollback paths that caused the outage they were meant to fix, a delete step
  identified by recycled generation numbers, and several wrong claims of mine —
  including that `/about` prints the export's `exported` count, when it prints the
  sentinel's *distinct entity* count (~1.23M against 1.34M rows), which would have
  failed that acceptance check on every release.
- **The tokenizer moved into this repository** (`site/tokenizer/`), with its tests and
  the CI workflow. The §16.6 gate's two halves had been looking for each other across
  the 2026-08-24 repository split since it happened, so the Python half had not run for
  two days — silently, because a gate that cannot start looks like a gate with nothing
  to report. All four commands now pass together. Audited adversarially: a mutated copy
  moves exactly one digest, and poisoned modules on `PYTHONPATH` are ignored.

### Rulings today, all in plan §13 Q14 or §14.5/§14.6

Wildcard `_` = one or more subtokens, structure-blind (bracket matching was measured
working at bounded depth, then ruled out); server-side, no Worker post-filter (so §6.6's
prohibition is never engaged); all three panels; `\n`-joined column with leading and
trailing sentinels; **plain escaping via `escape-string-regexp`, not symmetric
encoding** — verified 55/55 on metacharacter-bearing subtokens and 14,922 distinct
subtokens producing valid patterns; `Regex` over `Glob`, chosen for the escaping story,
not the 1.4–1.7× speed edge, which is invisible on the leg the site actually sends.
Arbitrary-depth bracket matching is permanently closed: the engine is Rust `regex`
(identified from its own error strings) and every recursion extension is rejected.
The 4 KiB filterable-value limit does not apply (62,891-byte value accepted and matched).

`publish` + `gate` + the R2 upload are part of the coming release. Step 5 uploads with
`rclone copy` and defers the deleting `sync` to step 11.

### Still open, unchanged

Q13 (whether `_`/`.` become matchable subtokens) rides with the same re-export or not;
`_`'s lexing rule (whitespace-delimited only?) and what a wildcard-only condition does.
The release itself has not been run: live is still `6e38ad41`, and the code is not
deployable alone because turbopuffer 400s a query naming an absent column.

Cleanup outstanding: `isasearch-preview-20260826` and its `.asset`; the
`TPUF_NAMESPACE` line in `worker/.dev.vars`; the `wrangler dev` on 8787;
`published.pre-basefix-20260824` (5.1 GB).

**Also seen twice**: on production, the first vector query after a burst of filter-only
queries took 9.2 s and 9.6 s, against a steady state of 21–40 ms. Probably the same
thing as the long-deferred "10.7 s first request after idle" — now with a second
observation and a known trigger.

## STATE AFTER THE ROOT-CAUSE INVESTIGATION (2026-08-26, post-compact session)

The question the last handover led with — why bare `Glob`/`Regex` returned 41 of
200 — is answered. The full account, with every number, lives in plan §13 Q14
("The row loss, root-caused"); this section is the pointer plus what it changed.

**The mechanism in one paragraph.** Under an ANN query turbopuffer evaluates a
`Glob`/`Regex` filter on one of two paths, chosen per pattern: an **indexed path**
(the 2026-02 pattern index pre-locates matching rows; recall exact at every
`top_k` and every vector) and a **neighborhood path** (the ANN search explores a
bounded region around the query vector and the filter applies only inside it; the
query returns only the true matches that lie in the region). 41 = matches of
`x + y` inside the region explored for that vector on that index build; a
byte-identical rebuild returned 74. Path assignment tracks the row frequency of
the pattern's most common required token (all tokens ≤ ~7 % of rows → indexed;
any token ≥ ~23 % → neighborhood; boundary not located). Five measured
signatures separate the paths — filter-only scan cost, ANN latency band,
`top_k` saturation, query-vector dependence, contiguous-band rank skips.
The vendor docs turned out to be right and previously misread: the `Regex`
warning describes exactly this and prescribes exactly the conjunction repair.

**What it changed, in decreasing severity:**

1. **Production loses rows today, without any wildcard.** Bare
   `ContainsTokenSequence` — the live site's only condition mechanism — is a
   partial postfilter on the same machinery, and on conditions dominated by `=`
   (the corpus's most frequent token) it collapses on the live namespace with
   real vectors: `f x = x` (142 true) returned 2/1/6/0 across four vectors;
   `a = b` (2,928 true) returned 47–106, saturating at 106 at `top_k` 3200;
   `x = y` returned 438 of a possible 3,200. The earlier "no loss on
   production" verdict tested seven conditions that all sat on the indexed
   path. No in-engine mitigation is known. **What to do about it is the
   user's call** — report to turbopuffer (the reproduction is ready), mitigate,
   or accept and document.
2. **The Q14 repair is real but not airtight**: conjoined
   `And([ContainsTokenSequence(run…), Regex(pattern)])` restores exact recall
   everywhere except conditions built entirely from ubiquitous tokens, where it
   inherits the production defect above (repaired `x - y`: 134 of 200 on the
   probe namespace). The cross-field `Or` (the `All` panel shape) adds no loss
   of its own — measured, repaired branches stay exact wherever single-field
   repaired filters are exact.
3. **Q14 is unblocked as a mechanism question**; the remaining decision is
   design: the wildcard inherits exactly the same failure class as production's
   existing conditions, no worse and no better.

**Reproduction assets**: `~/isasearch-pipeline/regexprobe/` — `topk_probe.py`
(the discriminating experiment; `topk-run1.txt`/`topk-run2.txt` are the stable
tables), `build.py` (~12 min for the 1.2M namespace). The probe namespace
`isasearch-regexprobe-64d-1200k` is deliberately left alive as the reproduction
substrate for a turbopuffer conversation; delete it once that is settled.

**The 9.5 s cold first query reproduced a third time** (9.18 s, first CTS query
on production after a burst of aggregate/filter-only queries).

## ADDENDUM (2026-08-26, later the same session): the reliable fix exists — kNN

The section above ended with "no known in-engine mitigation". That is now false,
in the best way: turbopuffer has a **documented exact mode**,
`rank_by: ["vector", "kNN", …]` (changelog Dec 2024: "kNN exact search for 100%
recall on filtered vector search queries"; requires filters, exhaustive over the
matching documents). Everything is in plan §13 Q14 under "The solution"; the
short version:

- Verified exact against locally computed ground truth on the probe namespace
  (bare Regex/Glob/CTS, deviations only f16 ties ≤ 8.6e-5) AND on production
  (`f x = x` 142/142 with zero order differences where ANN returned 2; bare `=`
  with 655,804 matches complete). Cross-field `Or` complete.
- Latency on production: 86 ms–1.2 s for real conditions; 5–8 s for the
  degenerate bare `=`. Billing negligible.
- The conjunction repair is obsolete for correctness; the chunked
  `["id","In",…]` scheme (exhaustive below a measured ~300-entry boundary) and
  the bigram-column statistics are archived as fallbacks in the agents' reports
  under `~/isasearch-pipeline/regexprobe/` (agentA/, agentC/, agentD/).
- Decisions left to the user: route every conditioned query through kNN
  (recommended; unconditioned stay ANN), a match-count bound for the latency
  tail, whether/where to send the turbopuffer draft
  (`agentC/turbopuffer-report-draft.md`), and when to delete the probe
  namespace `isasearch-regexprobe-64d-1200k` (kept as reproduction substrate).
- Cold-first-vector-query: two more observations (9.13 s ANN after idle; one
  kNN >300 s client timeout after ~4 min idle, 542 ms on retry).

## ADDENDUM (2026-08-26, evening): conditions are raw-text regular expressions

Three user rulings in quick succession replaced the two-form condition design:
regex is the DEFAULT and ONLY condition form; no token sequences, no tokenizer,
no `\n`-joined columns — patterns match the raw `name`/`expr`/`theory` text as
displayed (those columns exist untruncated; they gain `regex: true` at the next
re-export, and the `*_subtokens` columns drop). Q13 is moot; the site tokenizer
subsystem and the §16.6 gate retire with the re-export. The dialect probe ran
all-green (Not(Regex) exact/composable; \b and \<...\> whole-word; `.` stops at
real newlines, (?s)/[\s\S]/\s cross; empty pattern matches everything — hence
pre-request rejection; (?i), \x{27F9}, \p{L}, POSIX classes fine; script at
~/isasearch-pipeline/regexprobe/rawprobe/probe.py). Deadline table final:
4s/8s/12s/15s per class, retry only where timeout is anomalous, one retry per
search, no total budget (~25 s structural bound accepted), fallback error page
approved. Docs rewritten (plan Q14 "THE FINAL RULING", Q13 banner, §6.3, §6.3c
v2, §5/§16.6 scope notes; COPY §0/§1/§3.2/§3.5/§5.1/§5.3/§5.6). NEXT: the user
wants ONE MORE REVIEW ROUND over the rewritten design before implementation;
then the M3 raw-text sweep (launch gate), then the router build.

## ADDENDUM (2026-08-26, night): re-review folded in; all rulings closed

The second review round (two fresh reviewers over the rewritten docs) returned
28 + 15 findings — mostly stale text the big rewrite missed, plus real catches:
my "~25 s structural bound" was wrong arithmetic (true worst 35 s / 47 s with
an ANN retry); on:'all' was contradicted three ways; the \<symbol> table had
no surviving home; a leading `?` in a pasted theorem is a parse error; markup
escapes (\<^sub> …) are untranslatable; multi-line pastes die in an <input>.
Every finding is now folded in, under these user rulings: 35 s accepted with
timeout-retries restricted to ≤8 s legs; live WASM Rust-regex validation with
red outline + engine message (JS RegExp forbidden as validator); the newline→
\s+ paste handler; placeholder "a regular expression (Rust regex syntax)"; no
`?` hint line; live \<symbol> replacement as an input-method feature with NO
warning for unknown names; no §3.5 foot-line addition ("千万别写"); on:'all'
deleted from the API; and the SENTINEL MECHANISM DELETED ENTIRELY ("绝对不能
这样写代码" — a cold-isolate page view paid a cross-ocean turbopuffer read):
ROWS/ENTITIES/BUILT live in wrangler [vars], checklist-synchronized, probe-
verified (ROWS within 1 % of approx_row_count); symbols.json becomes a static
asset; .asset namespaces retire. Measured tonight: turbopuffer's 4xx does NOT
echo the offending pattern (one-line reason, column name only), so error
attribution is the client validator's job and the server 4xx renders page-level
via §5.8. NEXT: implementation can start on the user's word — router first
(§6.3c is the spec), then the re-export release (regex:true, drop *_subtokens,
symbols.json, no sentinel), with the raw-text overlap sweep as its launch gate.

## STATE AT COMPACT #8 (2026-08-26, night) — IMPLEMENTATION STARTS NOW

**The user has given the go-ahead: implementation begins immediately after this
compact.** Order: ① the count router in the Worker, ② the front end, ③ the
re-export release, ④ a full RELEASE.md run. Everything below is pointers; the
specs themselves are all in the repo, committed and pushed (HEAD e8ddbfa).

**Specs (authoritative, complete):**
- Router: plan §6.3c — protocol, the deadline/retry table (4/8/12/15 s;
  timeout-retry only on ≤8 s legs; one retry per search; no total budget,
  ~35 s structural bound accepted), request/response contract
  ({mode, count, rows, complete, results}; parts and limit_reached die),
  one certificate everywhere, error codes (regex_rejected→COPY §5.8,
  condition_empty, regex_timeout→COPY §6's new sentence, upstream),
  "Input and validation" (WASM Rust-regex validator — NEVER JS RegExp; the
  newline→\s+ paste handler; live \<symbol> replacement from symbols.json;
  NFC-only on the Worker), acceptance items.
- Condition design: plan §13 Q14 "THE FINAL RULING" — regex over raw
  name/expr/theory text; no tokenization anywhere; on:'all' deleted from the
  API; excludes = Not(Regex) (measured exact); empty text rejected pre-request
  (empty pattern matches every row, measured).
- Export changes: §8.1/§8.2 banners — regex:true on the three raw columns,
  *_subtokens dropped, symbols.json (489 names, extract from
  site/tokenizer/asset.json BEFORE deleting the tokenizer) as a static asset,
  NO sentinel row / NO .asset namespace; the export's final report prints
  rows/entities/built for RELEASE step 8 to paste into wrangler [vars]
  (ROWS/ENTITIES/BUILT beside TPUF_NAMESPACE, same commit); step 10 probe
  asserts /about == config and ROWS within 1 % of approx_row_count.
- COPY: regex-era strings all written (§0, §3.2 incl. placeholder
  "a regular expression (Rust regex syntax)" and the input-method paragraph,
  §4.5 trigger=complete, §5.1/§5.3 incl. excludes variants, §5.6, §5.8,
  §6 regex_timeout). Header names them as shipping with the re-export.

**Worker code-change list (from the reviews; condensed):** tupfQueryBody takes
a rank mode (kNN spelling: rank_by ["vector","kNN",v]); a count body builder +
accessor for results[0].aggregations.n (keep rowsOf strict, do not reuse);
tupfPost must carry resp.status and ≥2 KiB of body on the thrown error (today:
generic Error, body sliced to 300 chars, all mapped to 502 upstream — that
mapping must learn 4xx-no-retry); search() restructured to
Promise.all([embed,count]) → route → certificate → fallback, with the per-
search log line; index.js drops the tokenizer import, assertAssetMatches and
the whole sentinel path (aboutFacts reads env vars); PANELS loses 'all';
response fields swap (complete replaces limit_reached; parts gone) with
app.js:207/231/235/282-350 updated together (empty states re-rendered per new
COPY, excludes variants, per-condition red outline + engine message);
replaceAbbrev/abbrevs.json retire; the \<symbol> live replacer + paste handler
+ WASM validator arrive (verify a sound rregex-WASM npm package exists; else
validation is server-backstop-only for now and say so); worker/test pins ANN
at search.test.mjs:160 (add kNN case); live_probe.mjs: checks 2/3 assert the
disproved fullness inference (rewrite to the certificate), check 4 reads
r.theories which D55 deleted (dead today), imports the retiring tokenizer.

**Environment right now:** wrangler dev runs on 8787 (background, worker/
directory, .dev.vars points at isasearch-preview-20260826 — fine for dev).
Live worker is 6e38ad41 (pre-everything); live namespace
isasearch-2025-2-afp-2026-05-13 untouched. Cleanup list unchanged (preview ns
pair, published.pre-basefix, regexprobe scratch incl. 406 MB groundtruth.npz).

**Launch gate before the re-export release:** the raw-text overlap sweep
(spec inside §6.3c's "The 3 % line" paragraph: clustered patterns, no-literal
length shape, common-literal, CTS-differential control, Not(Regex), the
empty-value Not(Regex) probe; record overlap, under-fill rate, fallback-kNN
latency; deadlines provisional until it runs). Scripts to adapt:
~/isasearch-pipeline/regexprobe/ (probe.py in rawprobe/ shows the current
request idioms).

## STATE AT COMPACT #9 (2026-08-27) — THE RELEASE STARTS NOW

**The code is done, committed and pushed; the release itself has not started.**
Implementation ran through compact #8's list ①②③; what remains is ④, a full
RELEASE.md pass. The user gave the go-ahead in the same breath as asking for
this compact ("建议先 compact the context 而后开始").

**The two implementation commits** (both on `origin/main`):
- `d3586b8` — the count router (§6.3c) in the Worker, and the regex-era front
  end (placeholder/hover, live `\<symbol>` replacement from the 489-name
  `symbols.json`, the newline→`\s+` paste handler, live validation by the
  vendored rregex 1.13.1 WASM build, `complete` replacing `limit_reached`, the
  rewritten empty states, `abbrevs.json` retired).
- `c7df6d9` — the export: `name`/`expr`/`theory` become
  `{"type":"string","regex":true}`, the `*_subtokens` columns and the whole
  tokenizer subsystem (with D46's guard, the CI gate workflow and the `.asset`
  sentinel) are deleted, and the run ends with the four-line REPORT block.
  RELEASE.md was rewritten for the era in the same commit.

**Verified before the release, 2026-08-27 (all seven preconditions green):**

| precondition | observed |
|---|---|
| right host | both `browser_info` and the semantic DB present |
| toolchain | venv python (`~/Current/MLML/.venv`), node v20.20.2, rclone 1.60.1 |
| DB quiet | `lsof +D` over the semantic DB: **no output**. The RPC host that held it (PID 3543184, `run_attached__`, cwd `contrib/phi-system`) exited on its own |
| `data/theories.json` | not checked by hand — the map step hard-fails on staleness |
| keys | all six resolve (`set`) |
| tree + tests | clean; 126 pytest + 35 node tests pass |
| disk | 183 G free |

**The three step-0 values, in hand** (RELEASE calls this pass/fail):
- deployed Worker: last deployment 2026-08-25 (a secret change); the code is
  `6e38ad41`, i.e. pre-everything;
- live namespace: `isasearch-2025-2-afp-2026-05-13`, `approx_row_count`
  1 337 009 — exactly the configured `ROWS`; `ENTITIES` 1 230 467, `BUILT`
  2026-08-20;
- published tree R2 is serving: **`published`** — `rclone check published
  R2:isasearch/source --one-way` reports 0 differences over 11 750 files. **It
  is the source-page rollback and must survive this entire release.**
  `published.pre-basefix-20260824` (5.1 GB) is the stale one, safe to drop.

**The plan for the release**, in this order, with `$WORK=~/isasearch-pipeline`
and `$TODAY=20260827` (fix it once; a release can cross midnight):

0. **A ~10-minute rehearsal first** (the author's recommendation, which the
   user did not object to when giving the go-ahead — if he wants it skipped he
   will say so): `--limit 2000` into a scratch namespace, then point the local
   dev Worker at it and run a real conditioned search through the router. The
   3-row smoke test of 2026-08-26 proved the schema; this proves the real
   record stream, real vectors and the router end to end. Delete the scratch
   namespace afterwards.
1. `scan` → 2. `map` (record the content hash) → 3. `publish` into
   `published.20260827` → 4. `gate` (tree) → 5. `rclone copy` to R2 (**copy,
   never sync** — the deletions wait for step 11) → 6. the full export
   (~3 h 36 m, ~29 GB, $22–45; detached under tmux with `set -o pipefail` and
   `tee`) → 7. `gate --namespace --sample 1000` → **7b. the raw-text overlap
   sweep, the launch gate**.
2. **Then stop.** Step 8 (`wrangler deploy`) and step 9 (the zone-cache purge)
   are human-only; the site stays on the old Worker and the old namespace until
   the user runs them, which is safe.

**The three things the user was told before starting, so they are not
rediscovered mid-run:**
1. **The launch gate can only run after the export.** Every figure behind the
   3 % line and the deadline table was measured on the `\n`-joined subtoken
   columns this schema deletes, and the sweep that re-derives them needs a
   regex-schema namespace at production scale — which only the export produces.
   If the sweep comes back badly, what changes is two `wrangler.toml [vars]`
   numbers (the line fraction, the deadlines); the exported data stays good.
   The cost is that the router's real operating point is unknown until ~4 hours
   in.
2. The rehearsal above.
3. Steps 8 and 9 need the user at the keyboard four to five hours from now.

**Environment right now:** the wrangler dev server on 8787 was killed and is
NOT running; restart it with `cd worker && npx wrangler@4 dev --local --port
8787` if the front end needs looking at (its `.dev.vars` points at
`isasearch-preview-20260826`, which is the OLD schema, so a conditioned search
there correctly returns `regex_rejected` — that is expected until the
re-export). The browser extension was not connected, so **the front end has
never been seen in a real browser**; the vendored validator was verified
head-lessly instead (valid/invalid patterns, `\<sorted\>` word boundary, the
engine's own message text).

**Cleanup backlog, unchanged:** `isasearch-preview-20260826` and its `.asset`
companion, the `worker/.dev.vars` `TPUF_NAMESPACE` line,
`published.pre-basefix-20260824` (5.1 GB), and the regexprobe scratch under
`~/isasearch-pipeline/regexprobe/` (incl. the 406 MB `groundtruth.npz`).

---

## RELEASE 2026-08-27 → 28 (live)

| | |
| --- | --- |
| namespace | `isasearch-2025-2-afp-2026-05-13-2` |
| artefact content hash | `54c3b8e26b68` |
| deployed Worker version | `fbb84e20-b4bc-40ff-932b-e95267e3c99a` (step 8 deployed `5b276d1b-…`; superseded same night by the PhiSymbols fix) |
| commit sha deployed | `1fb0040` (step 8's own commit was `d388c98`) |
| published tree | `published.20260827` (rollback: `published`) |
| predecessor | `isasearch-2025-2-afp-2026-05-13` — KEEP until the next release |

Step 6's REPORT, as pasted into `[vars]`:

```
TPUF_NAMESPACE = "isasearch-2025-2-afp-2026-05-13-2"
ROWS           = "1341843"
ENTITIES       = "1235163"
BUILT          = "2026-08-27"
```

**Figures.** scan 35 s — 1,341,843 records, 9,818 linkable files, 486,655 pairs.
map 7.8 s — 10,595 theory pages, residue 0, linked 99.05 %. publish **14 m 32 s**
— 486,655 marks, 11 merged conflicts. gate (tree) **14 m 08 s** — 15,970,528
references, counters 232/1/106 unchanged. R2 **8 m 48 s** — but only 12 of 11,750
files changed, so that is a metadata pass, not an upload. export 1,341,843
documents = the scan's final-line count; counts `undecodable` 0, `wip` 255,
`experience` 6768, `out of scope` 277, **`no defining theory` 3256**. gate
(namespace, sample 1000) **15 m 39 s**, zero misses.

**Step 5's rclone invocation, as actually run** (first time these commands met a
populated bucket): the six `RCLONE_*` exports, then `rclone lsf` to prove the
prefix, `rclone copy … --dry-run` redirected to a file, `rclone copy …
--transfers 32 --checkers 32`, `rclone check … --one-way` → 0 differences over
11,750 files. Spurious `501 NotImplemented` on attempt 1, absorbed by retries.

**Step 7b** — full record in `~/isasearch-pipeline/launchgate-final-20260828.log`.
Blocking checks all pass: score parity 0.0016 @10 and 0.0058 @100, kNN
certificate, no uncaught under-fill, `Not(Regex)` returns all 3,256 empty-theory
rows, fallback kNN 14,220 ms. Overlap recorded, not enforced: `200 198 132 180 183`.

**Five things that cost time, so the next release does not rediscover them.**

1. **The completeness gate fired mid-release** — 5,119 shippable records with no
   vector, all with interpretations, from corpus growth since 2026-08-20. Fixed
   by `isabelle_semantics.py embed --yes Qwen/Qwen3-Embedding-8B`: 5,373 embedded,
   1,124,538 tokens, minutes, cents. The failed attempt created no namespace and
   wrote no checkpoint. Precondition 8 now exists to catch this before step 1.
2. **Export throughput collapsed** from 209 docs/s to 8 docs/s over four hours,
   with TLS `EOF in violation of protocol`, write timeouts, DNS failures and
   turbopuffer `HTTP 408` — 35 retries, none past 3/5. Reads stayed fast and the
   machine was idle, so it was upstream. A SIGINT + resume recovered it (17 docs/s
   average after), costing one batch group. **The recovery is not visible in the
   first three minutes** — measure twice, several minutes apart, before concluding
   a restart achieved nothing.
3. **The launch gate's set-identity criterion was wrong** and is now recorded, not
   enforced. It failed 133/200 while the results were correct; the two negations
   at 179/200 and 183/200 had similarity gaps of 0.0000 and 0.0027. Replaced by
   score parity (top-10 within 0.005, top-100 within 0.01), user-ruled 2026-08-28.
4. **`no defining theory` moved 533 → 3,256.** ~3,073 are `Geo_Real2.*` entities
   positioned under `/home/qiyuan/Current/MLML/task…` — local task theories, not
   Isabelle or AFP. They carry an empty `theory` and match no Theory Name
   condition. D24's session test did not exclude them. **Open question: should
   local-task entities be published at all?**
5. **`regex: true` makes `filterable` default to false.** `Eq`/`In` on `name`,
   `expr` or `theory` now 400 — only `Regex`/`Not(Regex)` reach them. `kind` is
   unaffected and `In` still works there.

**Fallback deadline has little headroom**: kNN legs measured 14,220–14,891 ms
against a 15,000 ms deadline. Unresolved; the only unenforced risk in the router.

**Step 11's prune caught a live asset.** The dry run offered to delete exactly
one object, `source/fonts/PhiSymbols.ttf` — the font all Isabelle text on the
site is set in. No published tree contains it and neither does the rendered
tree, because it had been uploaded to R2 by hand; every release since has been
one confirmed `sync` from breaking the site's typography. Fixed by serving it
from the Worker's assets (`1fb0040`), where it deploys with the CSS that names
it and no prune can reach it. After that the prune list is the dead R2 copy
alone.

**Step 11 completed 2026-08-28.** Deleted, approved item by item: the R2 object
`source/fonts/PhiSymbols.ttf` (dead once `1fb0040` moved the font to the
Worker's assets) and the namespaces `isasearch-preview-20260826` and
`isasearch-preview-20260826.asset` (the abandoned 2026-08-26 preview). The
account now holds exactly `isasearch-2025-2-afp-2026-05-13-2` (live),
`isasearch-2025-2-afp-2026-05-13` (rollback) and that one's `.asset`.
`rclone check --one-way` after the prune: 0 differences over 11,750 files.

**Kept deliberately**: `published.pre-basefix-20260824` (5.1 GB, two releases
old). Disk was at 176 G free and this release showed the value of an extra old
tree; drop it next time.

**The guard script was fixed before it ran.** As committed it required
`LIVE + '.asset'` to exist, which no post-2026-08-26 namespace has, so it
aborted on every release. Verified against the live account before and after.

**Scheduled cleanup — delete on or after 2026-09-11** (ruled 2026-08-28):
`~/isasearch-pipeline/regexprobe/`, 521 MB of pre-regex probe scratch including
a 406 MB `groundtruth.npz`. Step 7b used to point at it; since the launch gate
moved into `worker/probe/`, no document references it. A dated note sits in the
directory itself. `rm -rf ~/isasearch-pipeline/regexprobe`

## Out-of-cycle deploy 2026-08-28 — the brand became IsaFinder

The name Isasearch collided with someone else's work, so the user ruled it
renamed. Commit `a53ad4e`, Worker version `5820120d-6323-4e47-8a26-d9bcd31e6853`.

**Only the text a visitor reads changed** — 15 strings: the four browser-tab
titles in `worker/src/pages.js`, the header brand link and footer line in
`shell.html`, both `<h1>`s and the intro, three about-page paragraphs, the
truncation notice in `app.js` and the missing-source tooltip in `render.js`.
`site/COPY.md` moved with them, except four occurrences inside its historical
annotations, which quote sentences deleted on 2026-08-25/26 and stay verbatim.

**No identifier was renamed**, so this deploy carried the same `[vars]` as
`fbb84e20`: the Worker is still `isasearch`, the bucket `isasearch`, the
namespace `isasearch-2025-2-afp-2026-05-13-2`, and the two GitHub links still
point at `xqyww123/isasearch-web`. `worker/src/index.js`'s
`/^isasearch-(.+)-afp-(\d{4}-\d{2}-\d{2})/` had to keep the old spelling for the
same reason — it parses the namespace name into the release and snapshot the
header prints, and renaming it would blank that line. The rename was therefore
a case-sensitive substitution of `Isasearch`: the brand is capitalised
everywhere, every identifier is lower-case, and the two never collide.

**No data moved.** The 11,750 published `/source/*` pages carry no brand —
checked against the live `HOL.List.html`, zero occurrences — so neither the
export nor the 5.04 GiB R2 tree needed touching, and steps 1–7 were skipped
entirely. A rename that reached the identifiers would be a different job: a new
Worker (the `DAILY_GATE` Durable Object is scoped to the script, so the daily
counters and usage statistics would reset), a bucket copy, and a namespace
clone — turbopuffer has no rename, but `branch_from_namespace` clones instantly
within a region.

**Verified live after deploy**: `/api/search` 200; `/`, `/about` and a real
`/entity/<key>` all render IsaFinder in title, brand and footer; `app.js` and
`render.js` serve it too. The header still prints "Isabelle 2025-2 · AFP
2026-05-13", which is the untouched regex working.

**The zone cache was not purged.** `/` and `/about` are not edge-cached, and
entity pages carry a 4 h Worker-written cache, so stale pages showing the old
name age out by themselves. The purge still pending from step 11 (the deleted
font, `cf-cache-status: HIT`) is unaffected by this deploy.
