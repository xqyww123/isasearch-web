# Claude Design edit prompt — the ranking-mode switch + four defect fixes

Drafted 2026-08-24 for the user to paste into Claude Design against the
existing isasearch canvas project. The checkbox's label is the user's
own sentence verbatim; the hover text is its approved companion (D36 as
amended 2026-08-24). The kind-filter default needs no fix: the mockup's
none-selected default, a defect under the old D29, is exactly what the
amended D29 (none selected, empty = no restriction) asks for.
`COPY.md` carries all of it.

---

Edit the existing isasearch design. This is an incremental edit, not a
redesign: replicate the page's own existing styles, components and spacing —
copy and paste existing structure wherever possible, and introduce no new
visual language. Do not modify the generated runtime (support.js). All
visible text given below in quotes is final copy: use it verbatim,
character for character. Keep every other string on the page exactly as it
is.

1. Add a ranking checkbox.

The landing page currently shows the search box, and under it one
explanatory paragraph (it begins "A natural-language query is required" —
or "A query is required." in a later revision; either way it is the only
paragraph between the search box and the SYNTACTIC FILTERS panel).
Directly below that paragraph — after it, still above the SYNTACTIC
FILTERS panel — add a checkbox, selected by default, left-aligned with
the paragraph, in the page's existing form-control style. The checkbox's
visible label is this whole sentence, verbatim:

  "Additionally uses the BM25 word-matching algorithm to improve the
  results. Clear it if you want a pure semantic search."

Give the checkbox the page's existing hover-text affordance, with this
text:

  "Selected: the semantic-similarity results (from the embedding model)
  and the BM25 word-matching results are combined with reciprocal rank
  fusion (RRF). Cleared: only semantic similarity is used."

Hard constraints:
- A checkbox: exactly two states, selected (the default) and cleared.
- It must not look like part of the Syntactic filters panel group and
  must not sit inside it.
- Do not display any relevance score, percentage or ranking number
  anywhere, in either state.
- No further text about the checkbox anywhere beyond the label and the
  hover text above.

2. Check for four known defects and fix any that are still present.

a. If any "load 8 more" control exists at the foot of the result list,
   remove it. The only paging controls are "previous 20" and "next 20",
   rendered as:  "previous 20 · next 20"  (previous absent on the first
   page, next absent on the last).
b. If any total match count is shown anywhere, remove it. This includes
   the line above the result list ("1,204 matches ranked by semantic
   similarity · 61 ms") and the "rows 1–8 of 200" figure at the top
   right: delete both entirely — the match total, the "ranked by
   semantic similarity" phrase and the timing all go. Above the list the
   only count lines are "Showing results 1 to 20" (paged) or "Showing
   all «7» results" (a short list).
c. The result list pages by 20, not 8: 20 cards per page everywhere the
   page count appears.
d. Every result card shows a relevance percentage at its top right
   ("91%", "89%", …). Remove it. No relevance score, percentage or
   ranking number appears anywhere on the page, on any card, in any
   state.

Change nothing else.
