# isasearch-web

The public semantic-search site over the Isabelle semantic database
("isasearch"): a turbopuffer-backed search namespace plus a published
tree of rendered Isabelle source pages.

## Layout

| Path | What it is |
| --- | --- |
| `docs/SEMANTIC_SEARCH_SITE_PLAN.md` | The authoritative design (decisions D1–D54, §1–§17). Nothing overrides it. |
| `docs/SEMANTIC_SEARCH_SITE_PLAN_DONE.md` | Retired/completed plan sections. |
| `docs/PLAN_CONSISTENCY_AUDIT.md` | A self-consistency audit work list over the plan. |
| `src/site_export.py` | Exports the semantic DB into the site's turbopuffer namespace (plan §8). Run as `python src/site_export.py`. |
| `src/site_source_pages.py` | The source-page pipeline — `scan` / `map` / `publish` / `gate` / `patch` (plan §17). Run as `python src/site_source_pages.py`. |
| `tests/` | The pytest suites (`python -m pytest tests/`). |
| `site/` | Interface design (`design/`), the tokenizer asset and its JavaScript port (`tokenizer/`), measurement prototypes (`prototype/`), review archives (`review/`), approved interface copy (`COPY.md`). |
| `pipeline/` | Versioned pipeline state: the continuation/handover file, the scan and map artefacts the live namespace is pinned to, review transcripts, the executed live-patch checkpoint. |
| `published/` | The generated published tree (git-ignored, 5+ GB; rebuilt by `python src/site_source_pages.py publish`). |

## Dependencies and credentials

The code imports the `Isabelle_Semantic_Embedding` package (the DB
library, `contrib/Semantic_Embedding` in the MLML super-repository;
installed editable) for database access. The rendered-tree input lives
outside this repo at `~/.isabelle/Isabelle2025-2/browser_info/`.

The turbopuffer key is read from the `TURBOPUFFER_API_KEY` environment
variable. Keys are never committed to this repository in any form.
