# Claude Design edit prompt — the ranking-mode switch + four defect fixes

Drafted 2026-08-24 for the user to paste into Claude Design against the
existing isasearch canvas project. The switch's two labels and the hover
text below are the approved copy for the control (D36 as amended
2026-08-24); item 2c executes the kind-filter default as ruled the same
day (D29 as amended: none selected, empty = no restriction). `COPY.md`
carries both already.

---

Edit the existing isasearch design. This is an incremental edit, not a
redesign: replicate the page's own existing styles, components and spacing —
copy and paste existing structure wherever possible, and introduce no new
visual language. Do not modify the generated runtime (support.js). All
visible text given below in quotes is final copy: use it verbatim,
character for character. Keep every other string on the page exactly as it
is.

1. Add a ranking-mode switch.

The landing page currently shows the search box, and under it one
explanatory paragraph (it begins "A natural-language query is required" —
or "A query is required." in a later revision; either way it is the only
paragraph between the search box and the SYNTACTIC FILTERS panel).
Insert the new control between the search box and that paragraph,
left-aligned with the search box, as a compact two-state segmented
control styled like the page's existing chip/pill controls:

  Leading label:  "Rank by"
  State 1 (selected by default):  "meaning and wording"
  State 2:  "meaning only"

Give the control the page's existing hover-text affordance, with this text:

  "isasearch orders results by two signals: the meaning of your
  description, and its wording matched literally against each entity's
  English explanation. Switch to meaning only when results echo your
  words but miss your meaning."

Hard constraints:
- Exactly two states. Do not add a third state of any kind.
- The switch changes only how results are ordered. It must not look like a
  filter and must not sit inside the Syntactic filters panel group.
- Do not display any relevance score, percentage or ranking number
  anywhere, in either state.
- Do not add any text explaining what the switch does beyond the hover
  text above.

2. Check for four known defects and fix any that are still present.

a. If any "load 8 more" control exists at the foot of the result list,
   remove it. The only paging controls are "previous 20" and "next 20",
   rendered as:  "previous 20 · next 20"  (previous absent on the first
   page, next absent on the last).
b. If any total match count is shown anywhere (e.g. "N results" as a
   grand total), remove it. Above the list the only count lines are
   "Showing results 1 to 20" (paged) or "Showing all «7» results" (a
   short list).
c. The Kind buttons' default state is NONE selected. Do not add any text
   about what an empty selection means. If the page anywhere shows a
   blocking message for a cleared kind selection (beginning "You have
   cleared every kind"), remove that message and the state that shows it.
d. The result list pages by 20, not 8: 20 cards per page everywhere the
   page count appears.

Change nothing else.
