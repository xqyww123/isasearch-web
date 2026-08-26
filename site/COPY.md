# Interface copy — Isasearch

Draft 5, 2026-08-25. Every visitor-facing string, in one place, so that the
implementation copies rather than invents.

Drafts 1, 2 and 3 each went to the readers that §13b of the plan established.
Draft 1 was rejected by four of four, draft 2 by three of three, and draft 3 by
four of four. §12 records what each round changed and what was rejected, so that
nothing is re-litigated.

**Draft 5 is what the built site says**, and it is largely the user's own
writing. On 2026-08-25 the front end was built, the user read it screen by
screen, and rewrote or struck a great deal of draft 4 as he went; four reading
agents were run over the interface and the about page in the middle of that, and
their findings are marked where they were acted on. Two kinds of change happened
that day and are distinguished throughout: **rulings** (the user's, binding) and
**corrections** (a fact-check against the running code found the copy claiming
something the system does not do). Both are recorded beside the string, with
what stood before and why it went.

**Nothing in this file is outstanding.** Every string it records is the string
the built site serves.

Nothing here may be paraphrased when it reaches the markup. Where a string is
locked by a decision, the decision is named beside it. Text in `«guillemets»` is
a substitution slot, never shipped as written.

## 0. The matching rule, stated once

Draft 2 stated this rule four times in three incompatible ways, and both
reviewers independently made it their top finding. It is stated **here**, and
every place in the interface that needs it uses this wording without variation.

Isasearch divides a name into **parts**. The dividers are `_`, `.`, the question
mark, and the subscript and superscript marks; a divider is thrown away and can
never be matched itself. Every **other** character that is not a letter or a digit —
a hyphen, a bracket, an operator — is a part on its own and can be matched. A
condition matches when its parts appear **as whole parts, in the order given, with
nothing between them**.

Two consequences of the first two sentences that every screen must respect, because
draft 3 broke both. A condition that consists only of dividers has no parts left and
is rejected. A condition that mixes dividers with other characters is **not**
rejected: it is reduced to the parts that survive, and the search then runs on the
reduction, so `_ + _` searches for `+`. §4.6 is the notice that says so.

Measured consequences, all verified against the corpus on 2026-08-14, and the
worked examples in the interface are drawn from this list:

| Condition | `Path_Connected.path_image_join` | why |
|---|---|---|
| `path` | matches | a whole part |
| `image_join` | matches | two whole parts, adjacent, in order |
| `Path_Connected` | matches | likewise |
| `Connected.path` | matches | the `.` divides, the two parts are adjacent |
| `join_path` | no | right parts, wrong order |
| `Path` vs `path` | different | upper and lower case are distinct |

| Condition | `sorted_wrt` | why |
|---|---|---|
| `sorted` | matches | a whole part |
| `sort` | **no** | only whole parts match, never a fragment of one |
| `orted` | no | likewise |

**`sort` not matching `sorted_wrt` is the fact that draft 2 got wrong.** It said a
condition may be "any part of the name that starts at a boundary", which promises
prefix matching that does not exist. Nothing in the interface may imply it.

## 1. The words this interface uses, and the ones it does not

| Use | Never use | Why |
|---|---|---|
| **panel** — one of the five blocks inside the Syntactic Filters panel group (D22; heading renamed by the user 2026-08-24, and again 2026-08-25) | section, group, box | D22 says "panel" |
| **panel heading** — the panel's title | label | "label" is needed for the kind |
| **kind label** — the badge on a card | badge, tag, chip | one word for one thing |
| **condition** — one entry in Entity Name, Expression or Theory Name (and, until 2026-08-25, in All). **A kind selection is not a condition.** | row, filter, term, rule | draft 2 wrote "every condition" of a rule that excludes kinds |
| **search box** — the large input; **condition box** — the input inside a condition | the box, unqualified | draft 1 used "the box" for three inputs |
| **query** — the text in the search box | description, search string, prompt | D40's locked hover says "your query" |
| **search** — the action, and the unit the daily limit counts | query, request, lookup | one action, one word |
| **part** — one unit of matching, per §0 | piece, fragment, token, subtoken | draft 2 used "part" and "piece" for one thing |
| **entity expression**, short form **expression** near the Expression panel | statement, term, formula | §1 of the plan |
| **the associated theories** | related theories, relevant theories | §1 of the plan, verbatim |
| **derived rule** — an Introduction rule, an Elimination rule, an Induction rule or a Case split; **defined at first use, every time** | theorem-alike, theorem-like | draft 2 used two undefined collective terms |
| **select** / **selected** for the Kind buttons | tick, chip | "tick" is British and low-frequency |

Absent by decision: **literally**; **run** as a noun; **allowance**; **resets**;
**authoritative** outside D30's locked first sentence; **carry** in the sense of
*display*; **at once** in the sense of *simultaneously*.

Numbers of four digits or more are grouped with a **non-breaking thin space** —
`1 000`, `8 000`, `1 230 467`. A comma is a decimal point across most of
continental Europe, and draft 2 mixed bare `1000` with spaced `1 300 000`. Digits
throughout, never words: `11 kinds`, not "eleven kinds".

**Nothing in this file is open.** The four labelling choices raised by draft 2
were settled by the user on 2026-08-14; §11 records them.

## 2. The landing page

The whole page is the search box, with the Syntactic Filters panel group
collapsed beneath it.

> **Isasearch**
>
> Search Isabelle/HOL and the Archive of Formal Proofs semantically by describing
> what you want in natural languages (English, Chinese, or others). Isasearch
> covers theorems, constants, types, classes, locales, proof methods and named
> theorems. It's based on Isabelle «2025-2» and AFP «2026-05-13», containing
> «1 230 467» entities now.

*(Rewritten by the user 2026-08-25, and again the same day when the placeholder
below was opened to other languages: "in English" was a restriction the system
does not have. A Chinese query was measured against the live index and returned
the same entities as the equivalent English one, so the promise is real — the
embedding model is multilingual and the document side is unchanged.
"semantically" states in the first sentence what the site is. The subject is **Isasearch**, never "the index" or "the
system": a visitor sees one thing, and §1's rule gives it one name. The
sentence about the rules Isabelle derives from `datatype`, `inductive` and
`function` definitions was dropped — those rules are theorems, the Kind buttons
and the about page name them, and a first-time visitor does not need the
distinction here.)*

The count is a substitution slot, filled by the export and matching the footer's
build date: the export writes both into the asset sentinel row, and the Worker
reads them there (ruled 2026-08-25). It is exact, not rounded, and it counts
**entities under the user's golden standard of 2026-08-25** (plan D5 as
amended): theorem-alike records whose universal keys differ only in the kind
tag are one entity. The live index holds 1 337 009 records and 1 230 467
entities. A search tool may not be vague about how much it covers, because the
absence of a result is its main output.

Placeholder inside the search box, and in the header's search box on the result
page (they are the same string):

> describe what you want in English, 中文 ...

Under the search box, one paragraph:

> The search box above searches by semantics, and that may not effectively find
> what you want. If you know more syntactic information about it — part of its
> name, a symbol in its statement, the theory it belongs to — put it into a
> Syntactic Filter below to narrow the results.

The three values in the first paragraph — the release, the snapshot and the
entity count — are substitution slots, filled from the asset sentinel row and
the namespace name.

*(The user's own sentences, 2026-08-25. The word **syntactic** is what carries
the reader from here into the **Syntactic Filters** panel group below; the
three examples are the three text panels, in panel order. The paragraph that
stood here in drafts 1–4 — "A query is required. It puts the results in order,
and only the first 200 appear…" — was deleted by the user on 2026-08-25, as was
its predecessor's "Do you remember only part of a name?" paragraph, which said
the same thing about whole-part matching that §3.5 already says at the foot of
the panel group.)*

**The BM25 checkbox is deleted (ruled 2026-08-25).** The `Ranking` row, its
label ("Additionally uses the BM25 word-matching algorithm to improve the
results…") and its hover are gone from the interface, and the Worker no longer
sends a BM25 leg or fuses anything: every search is the vector leg alone. The
user tried the hybrid results and judged them worse. D36 is amended
accordingly.

## 3. The Syntactic Filters panel group

Collapsed, nothing active:

> **Syntactic Filters**

Collapsed, with anything active — the two parts appear independently, so that a
visitor who narrowed only the kinds still sees why the results are narrow:

> **Syntactic Filters** · «1 condition» / «3 conditions» · «4 of 11 kinds»

Expanded, four panels in this order: **Entity Name**, **Expression**,
**Theory Name**, **Kind**. The panel group is **collapsed on arrival** — the
landing paragraph above it says what it is for, and a visitor who does not need
it never sees five rows of controls.

**The All panel is deleted (ruled 2026-08-25).** D22 gave it a fifth panel whose
condition was matched against Entity Name, Expression and Theory Name at once —
`contains` meaning "in at least one of the three", `excludes` meaning "in none".
The user removed it: the ability is worth little (someone unsure which field
holds the text can search one field and then the other), while the panel was the
hardest thing on the screen to name and explain, and two of the three rewriting
readers reported the heading "All" as unreadable in place. The copy that
explained it goes with it — §3.3's line below the panel is deleted too. Nothing
replaces the ability: **there is no way to ask for "in any one of the three"**,
and typing the same text into three panels asks the opposite (all three must
contain it), which almost never matches. The API still accepts `on: "all"`, so
the panel can return without a protocol change.

### 3.1 Panel headings — no hover text (ruled 2026-08-25)

**The five panel-heading hovers are deleted.** They said what each panel's
condition is matched against; that is now in §3.5's always-visible line at the
foot of the panel group, in the user's own words. The reason for deleting rather
than keeping both: a hover does not exist on a touch device and does not exist
for anyone who never rests a mouse on a heading, so a fact that only a hover
carries is a fact half the visitors never get. The `cursor: help` on the
headings goes with them.

The Theory Name hover also broke a rule it should never have broken: it ended
"see the note below the panel", pointing at §3.4's note, which is shown only
when a Theory Name condition is present — so a visitor hovering the heading
before typing anything was sent to look at nothing.

### 3.2 The controls inside a panel

The toggle reads **contains** / **excludes** (D22). The control that adds another
condition reads:

> add condition

### 3.3 — deleted 2026-08-25 with the All panel

The line under the All panel ("This condition matches text in Entity Name,
Expression or Theory Name") is gone. The user's reading of it: "This condition"
had no visible antecedent, and the sentence never said whether the text had to
appear in one of the three or in all three.

### 3.4 The note under Theory Name

**The trigger is the user's, settled 2026-08-19**: the note appears when the Kind
selection includes Theorem or a derived rule **and** the Theory Name panel carries a
condition — not merely when the panel is open. (Until the All panel was deleted
on 2026-08-25 an All condition triggered it too, for the same reason.) An empty
kind selection restricts nothing (§3.6), so it counts as
including Theorem: the note appears under the default selection too (ruled
2026-08-25). A note that is always on screen is a note nobody reads; this one
appears exactly when it applies.

> **Theory Name conditions work differently on theorems.** A Theory Name condition
> on a theorem matches every theory that declares a constant appearing in the
> theorem's statement. That is a different question from "where was this theorem
> proved", although the two usually overlap: a theorem matches its own theory when
> its statement uses a constant from it, and matches many others besides. A theorem
> often has several such theories, and sometimes more than twenty.
>
> To search for the theory that proves a theorem, use an **Entity Name** condition
> instead: an entity's name begins with the name of the theory that proves it, up to
> the first dot, so a condition of `Path_Connected` finds theorems proved in
> `Path_Connected`. Write the theory's own name without the session prefix. Such a
> condition also matches any entity whose name mentions `Path_Connected` anywhere
> else.

*(Draft 1 said "Isasearch does not record which theory declares a theorem", which
is false about Isabelle and contradicts the source link on the same card. Draft 2
replaced it with "A theorem is identified by its statement, not by the place
where it is written", which the Isabelle reader rejected for the same reason —
that is true of this index, not of Isabelle, and it was doing the work of
justifying a design choice that can simply be stated. Draft 3 states only the
behaviour. §12.)*

### 3.5 The foot of the panel group, always shown when expanded

One row: the line on the left, the control that clears the whole panel group on
the right (its placement is the user's, 2026-08-25 — under the Kind panel it
read as part of that panel, and set alone on a full-width row above a rule it
outweighed everything else on the screen).

The line, **the user's own words, 2026-08-25**:

> Conditions are **case-sensitive**. Entity Name: the full names of the
> constants, types, type classes, theorems and so on. Expression: the
> proposition of the theorem, the type of the constant, and the source code
> defining the type, type class, locale, the proof method, or the named theorem.
> Theory Name: the defining theories of the entities.

The control:

> Clear All

*(What this line replaced, and why. Until 2026-08-25 the foot carried two long
paragraphs — the whole matching rule of §0, restated, plus a paragraph on how
conditions combine. The user cut them in three steps. First: "we do not need to
say this much here; if it must be said, it belongs on the about page." Second,
of "A result must satisfy every condition; kind selections work the other way
round" — "what is this even saying? I read it and I'm confused" — deleted, and
nothing replaces it, because the Kind button's hover already says the same thing
in plain words (§3.6). Third, of the case-sensitivity example "`Path` and `path`
do not match each other" — "it took me ten seconds to work out what you were
trying to say" — the two lookalike words made the reader do the comparison
before the point could arrive. What stands now says what each panel is matched
against, which is the fact two independent readers reported missing everywhere
on the site, and it says it in always-visible text rather than in a hover.)*

*(The full matching rules — the separator class, operators standing as parts of
their own, whole-part matching, the order rule, spacing — live on the about page
(§14) and in the empty states (§5.1), which teach them at the moment they bite.)*

### 3.6 The Kind buttons

Eleven buttons, none selected by default; an empty selection restricts
nothing, so every kind is eligible until a button is selected (D29 as
amended 2026-08-24). The interface says nothing about the empty state —
user-ruled: readers do not expect an empty filter to return nothing.

> Theorem · Named theorems · Constant · Type · Class · Locale · Proof method ·
> Introduction rule · Elimination rule · Induction rule · Case split

Hover on **Named theorems**: *"A `named_theorems` declaration, such as
`approximation_preproc`."*
*(Introduction rule carried a hover through draft 4 — "A theorem that is also an
introduction rule is a single entity with both kind labels, shown on one result
card…" — deleted 2026-08-25 with D38's withdrawn clause: a card's badges are the
kinds that reached the results, so "both labels on one card" is not promised. The
user chose no hover over a reworded one.)*
Hover on **Case split**: *"A case rule: one case for each constructor of a
datatype, or for each introduction rule of an inductive definition. A rule whose
name ends in `.split`, such as `option.split`, has the kind Theorem here."*

**The other nine buttons carry no hover, and none is to be added** (ruled
2026-08-25). Three rewriting readers each proposed one-line hovers for Theorem,
Constant, Type, Class, Locale, Proof method and the three rule kinds; the user
declined. These two stay because they explain a classification a reader cannot
guess, not because a kind needs a gloss.

**Selecting kinds filters and nothing else** (ruled 2026-08-25). Until that day
the selected kinds were named in the instruction wrapped around the query before
it was embedded, so a selection changed the query vector and with it the *order*
of the results. The user had the instruction fixed instead (plan §6.3b). The
consequence for this file is that the panel group's name is now true of every
panel in it: the Syntactic Filters decide which entities are eligible and never
how they are ranked. No copy states the old behaviour, and none needs to state
the new one.

*(Draft 4 carried a blocking state for a cleared selection — "You have
cleared every kind, so no result can appear. Select at least one." — under
the old all-selected default. The 2026-08-24 amendment makes an empty
selection the default and gives it the meaning "no restriction", so that
state no longer exists and its message is deleted.)*

## 4. The result cards

### 4.1 The card

**Redesigned 2026-08-25.** One column, four rows:

1. the entity name, the kind labels, then — pushed to the far right of the same
   row, on the name's baseline — the **source location**, and after it the
   **similarity**;
2. the entity expression in monospace;
3. D26's matched-theory line, when there is one (§4.3);
4. the English explanation, collapsed (D40: no "AI" label on the collapsed line).

*(What this replaced: a two-column grid whose right-hand 200 px column held a
copy control and the source link stacked above a large empty space. The user:
"the rendering on the right is very strange — this needs redesigning". The two
things in that column had nothing to do with each other, the link wrapped as
soon as it grew, and the space below it was dead. Putting the location on the
name's row was the user's placement.)*

**The copy control is deleted from the card** (ruled 2026-08-25). The entity
page keeps one.

**The source location prints the theory's full name**, the user's requirement:
`Tail_Recursive_Functions.CaseStudy2.thy:29`, not the bare file name. It is read
off the source link, which already carries the theory exactly as Isabelle names
it, session included — deriving it from the source path instead would mean
guessing the session from a directory (`~~/src/HOL/Probability/…` is session
`HOL-Probability`, not `HOL.Probability`), and a guessed name that does not exist
is worse than none.

**The similarity is printed** (ruled 2026-08-25), three decimals, right-aligned
in a fixed column so the numbers line up down the page:

> 0.885

Hover:

> Cosine similarity between your query and this entity

*(D48 forbade any relevance number, on the ground that the fused ranking's score
is not what a cosine similarity means and the displayed numbers would not be
monotone down the page. Removing the BM25 leg removed that ground: the ranking
**is** the cosine similarity now, so the number is exactly what orders the list
and falls monotonically. Two decimals were tried first and hid the differences —
an embedding model's similarities sit in a narrow band, and a page of results
read `0.77` almost all the way down — so three decimals were ruled. The number
is not comparable between searches, only within one.)*

### 4.2 The expanded explanation

The first sentence is **locked by D30**. The second is D30's, amended by the user
on 2026-08-14. The third is required by D40.

> Written by a language model from the formal statement, not by the theory's
> authors. It may be imprecise or wrong. Where the explanation and the statement
> disagree, the statement is the correct one.

*(Shortened by the user 2026-08-25: the fourth sentence — "Isasearch searches
this text as well, so an entity with a poor explanation may rank lower than it
deserves" — is deleted. It is also the sentence a fact-check found imprecise:
what is embedded is the kind, the name, the expression and the explanation
together, so "as well" was pointing at something the copy never named.)*

No explanation:

> No explanation was generated for this entity. Its name and its expression still
> place it in the results, but the search box works best against an explanation, so
> this entity is harder to reach by describing it.

### 4.3 The theory line

**Narrowed 2026-08-25.** The line now appears only on a theorem or a derived
rule, and only when a contains-condition reached the Theory Name field (D26):

> a constant in this statement comes from HOL-Analysis.Path_Connected

Hover:

> Your condition matched this theory. It is one of the «23» theories that declare
> the constants in this statement. The theory where the theorem was proved is
> usually in that set too, because a statement normally uses constants from its own
> theory — but Isasearch does not mark which one it is, so a match here does not
> tell you where the theorem was proved. The entity page lists all «23».

An `excludes` condition never produces this line: nothing was matched.

**A constant, a type, a class, a locale, a proof method and named theorems no
longer show a theory line at all.** They used to print their one theory here,
and §4.1's source location now prints that same theory with its file and line,
so the line was a repetition. This also removed a defect the rewriting readers
found independently: the sentence above is false of those six kinds, which have
no statement and whose one associated theory is simply the theory that declares
them — a constant card was being told that "a constant in this statement comes
from" a theory. The cost accepted: on those six kinds nothing marks *which*
theory matched the condition. It is the theory in the source location, and there
is only ever one.

*(Draft 2 printed "a constant here comes from …", where "here" has no referent on
a card, and its hover claimed a "Theory Name condition" matched, which is false
when the condition sits in All and meaningless when it excludes.)*

### 4.4 The source link

Present on nearly every card (D42, coverage **99.28 %** — 9,599 of the 1,337,009
published rows carry no position). *(This paragraph said "about four cards in
five (coverage 80.2 %)" until 2026-08-26. That was the figure from before
`ENTITY_POSITION_PLAN.md`'s backfill; the plan has carried 99.28 % since, at
§11.1 and again in §17.5's reported figures.)* **Its text is the
theory's full name with the line** (changed 2026-08-25; §4.1 records why, and
where the name is read from). A substitution slot like every other run-time
value; draft 3 wrote it bare, which reads as a claim about a real line of a real
file and was challenged as such:

> «HOL-Computational_Algebra.Primes.thy»:«525»

**A position inside an Isabelle/ML file names no theory**, so its text is that
file's own symbolic path with the line (approved 2026-08-26). 7,292 cards,
0.55 %, across 26 `.ML` files:

> «$AFP/AutoCorres2/utils.ML»:«123»
> «~~/src/HOL/Nominal/nominal_thmdecls.ML»:«175»

`$AFP` and `~~` are Isabelle's own spellings for the AFP tree and the
distribution root, and they are already exactly what the record's stored
position says, so the slot prints it unchanged rather than reassembling it. The
file's base name alone was rejected: `nominal_thmdecls.ML` is two different
files — `$AFP/Nominal2/` and `~~/src/HOL/Nominal/` — and one live query returns
both at once, which would put two files under one name on one screen.

*(Until 2026-08-26 these cards ran the published page's path through the theory
form above, printing `_aux/AFP/AutoCorres2/utils.ML.thy:123` — leaking `_aux/`,
an internal directory of the published tree, and appending `.thy` to a `.ML`
file so that it read as a theory that does not exist. The link itself was
correct throughout; only the text was wrong.)*

Hover, both forms:

> The command that produced this entity. Many entities come from a command such
> as `datatype` or `fun` rather than from an explicit declaration, so the line
> number refers to that command.

Absent form, in place of the link, never a dead link and never blank:

> source position not recorded

Hover on the absent form:

> Some commands do not report a position, so Isasearch cannot provide a link.

### 4.5 Under the list

> Showing results 1 to 20

Twenty results or fewer, so there is no second page:

> Showing all «7» results

Controls at the foot of the list, with the position between them (the position
added 2026-08-25 at the user's request — the two buttons alone never said where
in the list you were). The previous control is absent on the first page and the
next control on the last; the empty side keeps its width, so the position does
not jump sideways when a button appears:

> previous 20   «21–40 of 194» / «page 2 of 10»   next 20

At the end of the results, **when the retrieval came back full** — 200 rows,
which all but proves that more entities satisfy the conditions:

> Isasearch returned the «194» most relevant entities for this search. Others
> also satisfy your conditions but were not returned. If what you are looking for
> is not among them, add a condition to narrow the search.

At the end of a list shorter than that:

> These are all «137» entities that satisfy your conditions.

*(Both approved 2026-08-25, and both replaced a sentence that misled. The capped
one began "No more results", which says the opposite of what is true in exactly
the case it appears: there **are** more. The user: "is this ambiguous — no more
that satisfy the conditions, or no more returned?" The uncapped one ended "To see
more, remove a condition or select more kinds", advice that does nothing when
the list is already complete.

The count is now printed, which draft 4 refused ("no total"). The refusal was
sound while the number could not be produced honestly; it can be — it is the
number of cards on the page, and the pager prints it anyway. The count is the
number of **cards**, which is smaller than the 200 rows retrieved because
several records can describe one entity (D5's collapse): 200 rows became 194
cards on the search these numbers come from.

The trigger is "the retrieval came back full", not a proof that more exist
(user-ruled 2026-08-25: keep the simple test). A search that is satisfied by
exactly 200 rows would show the capped sentence although nothing was left out —
the one case where it overstates.)*

### 4.6 — deleted 2026-08-25

Draft 4 added here a notice above the result list — "«Expression `_ + _`» was
read as «`+`»" — whenever a condition lost a separator. It was the author's
response to a reader finding, never put to the user, and the user struck it on
sight ("我并不记得我批准过这个设计，而且我觉得不应该提醒"). The reduction
itself stands (§0: a condition that mixes separators with other characters is
reduced, not rejected); the interface does not announce it. §5.1's reference
block lost its sentence about the notice with it.

## 5. Empty states

### 5.1 An Expression condition matched nothing

Generic: shown for whatever the visitor typed, so nothing on it assumes what they
meant. The worked case is separated from their own input by its own heading,
which draft 2 failed to do — it labelled the visitor's own quoted condition "For
example".

> **Nothing contains that text**
>
> An Expression condition matches text, not patterns. It has no variables: `?n`
> searches for the name `n`.
>
> **Your condition**
> «?n + ?m = ?m + ?n»
> Isasearch removes the question marks — from your condition and from the text it
> searches — and then looks for «7» parts, one directly after another, in this
> order: «`n` `+` `m` `=` `m` `+` `n`».
>
> **Why this usually happens**
> A condition fixes the variable names, but a statement is displayed with the
> variable names that its own author chose. `?n + ?m = ?m + ?n` finds nothing, even
> though the theorem that it describes is in the index:
> `Groups.ab_semigroup_add_class.add.commute` is printed as `?a + ?b = ?b + ?a`.
> The variable names are the only difference.
>
> **What to do instead**
> Describe the statement in the search box — *addition is commutative* — and use
> an Expression condition only for a name that must appear, such as `sorted_wrt`
> or `continuous_on`.
>
> *[button]* Remove this condition and search again

For an `excludes` condition, the whole page is replaced:

> **Everything that remains contains that text**
>
> **Your condition**
> excludes «⟹»
> Every entity that satisfies your other conditions contains it, so none is left.
>
> **Why this usually happens**
> Operators are common. `⟹` alone appears in «45 %» of all statements, and your
> other conditions have already narrowed the results to a set in which every
> remaining entity uses it.
>
> **What to do instead**
> Exclude a name rather than an operator. Excluding an operator removes a large
> part of the index at once, and it cannot be undone by the search box: the query
> orders results, it cannot remove them.
>
> *[button]* Remove this condition and search again

The reference block beneath, on both variants:

> **What an Expression condition matches**
>
> ✓ Names and operators, as the card displays them: `continuous_on`, `sorted_wrt`,
>   `⟦`
> ✓ Whole parts of a name, in the order you typed them: `sorted` matches
>   `sorted_wrt`; `sort` matches nothing, because only whole parts are matched,
>   never a fragment of one
> ✓ Isabelle's ASCII form, for every symbol that Isabelle displays as a character:
>   `\<Longrightarrow>` is understood as `⟹`. Abbreviations such as `==>` are
>   converted inside the condition box while you type; an abbreviation that has more
>   than one meaning is not converted, so type the `\<…>` form for those. A few
>   markup escapes, such as `\<^named_theorems>`, have no character of their own and
>   are matched exactly as you typed them.
>
> ✗ Patterns of any kind. **These are not rejected — they are reduced**, which is
>   worse, because the search then succeeds and returns the wrong entities:
>   - `_` and `.` are separators, so `_ + _` becomes the single part `+` and
>     matches every statement that contains a plus sign;
>   - `.*` becomes `*` and matches a literal multiplication sign;
>   - `cont*` loses nothing, but it is read as the two parts `cont` `*`, which
>     almost nothing contains: a star is an ordinary character here, not a wildcard.
> ✗ Question marks, `_`, `.` and the subscript and superscript marks are separators
>   and are never matched themselves. A subscripted name such as `f⇩1` is therefore
>   found by `f`, and **not** by `f1`.
>
> To search by the structure of a term, use Isabelle: `find_theorems` and
> `find_consts` search structurally inside a session. The search box here ranks by
> meaning, not by shape, so describing the term will find related statements but
> cannot match a pattern.

### 5.2 The conditions matched nothing between them

Shown when two or more conditions are active. Each appears with its own removal
control, and an `excludes` condition prints as `excludes`.

> **No entity satisfies all of these conditions**
>
> A result must satisfy every condition. These are active:
>
> - Expression contains `sorted_wrt` — *[remove]*
> - Entity Name excludes `List` — *[remove]*
> - Theory Name contains `HOL-Analysis` — *[remove]*
>
> Try removing one. Your query is not the cause: the conditions decide which
> entities are eligible, and none is. The query only puts eligible entities in
> order.

Appended whenever fewer than 11 kinds are selected:

> «4» of the 11 kinds are selected, and that also restricts the results.

### 5.3 One condition matched nothing

Shown when exactly one condition is active and it is not an Expression condition
(an Expression condition gets §5.1, which can explain the pattern mistake).

> **Nothing satisfies this condition**
>
> «Entity Name contains `Path_Connectd`»
>
> A condition matches whole parts of a name, in the order you typed them, and
> upper and lower case are different. Check the spelling and the capitals. If you
> are unsure of the whole name, type **fewer parts** of it — `Path` rather than
> `Path_Connectd`. Typing a shorter piece of one part does not help, because only
> whole parts are matched.
>
> *[button]* Remove this condition and search again

### 5.4 The kind selection alone is the cause

Shown when no condition is active. The removal controls of §5.2 are absent,
because there is nothing to remove.

> No entity of the kinds you selected is eligible. Selecting more kinds returns
> more results; clearing the selection removes the kind restriction entirely.

### 5.5 — deleted in draft 4

There is no such state. Two legs each fetch 200 rows and the fused list is truncated
to 200 (plan §6.6); there is no relevance floor anywhere, and D7 rejects an empty
query. So with nothing narrowing, a non-empty index always returns 200 results, and
the screen this section used to hold described a state the system cannot reach. A
genuine backend failure is §6's territory, which already covers it.

### 5.6 A condition with nothing to match

> Nothing in this condition can be matched. `_`, `.`, the question mark and the
> subscript and superscript marks divide a name into parts and are not matched
> themselves, so a condition made only of them has no text remaining. Add a name or an
> operator, or remove the condition.

### 5.7 The search box is empty

> Enter a query. The syntactic filters only narrow the results; they cannot
> search by themselves.

## 6. While searching, and when it fails

> Searching…

> The search did not finish. Try again. If it continues to fail, the problem is
> with the site and not with your query.

> No connection to the site.

## 7. Limits

Numbers locked by D29 and D35. Both address limits count per network address, and
both messages say so, because a visitor behind a shared address needs to know
that waiting alone may not be enough.

Too many searches within a few seconds (5 per 10 seconds per address):

> Too many searches from your network. Wait a few seconds and try again.

The daily limit is reached (1 000 per address per UTC day). One search is one press
of the search button: turning a page of results costs nothing, because all «200» are
fetched at once (D29), and editing a condition costs nothing until you search again.
The message says so, because a visitor who cannot budget against the limit will
assume the worst:

> Your network has reached the limit of 1 000 searches for today. You can search
> again after 00:00 UTC. Turning a page of results does not count. This limit counts
> every search from an address, so an address shared by many people reaches it
> faster than one used by a single person.

The whole site is above its limit (10 000 per hour):

> Isasearch is busy. Try again in a moment.

The query is too long:

> The text in the search box is too long. The limit is 8 000 characters.

One condition is too long:

> This condition is too long. The limit is 512 characters.

## 8. The entity page

One page per record, at `/entity/<universal key, base64url>` (plan D9 as amended
2026-08-25): a theorem and its introduction-rule twin are two pages, each with
its own explanation. The heading is the entity name alone. Under it, the same content as a card,
uncollapsed and full width, and then:

**Every block of prose on this page runs the full width of the column** — the
same width as the statement box — with both edges flush (ruled 2026-08-25). The
three blocks used to carry three different maximum widths, so their right edges
stopped in three different places; the user called the result ragged, and a
shorter shared measure did not satisfy him either.

**The copy control is kept here** (it is deleted from the result cards, §4.1).


> **Associated theories**

For a constant, a type, a class, a locale, a proof method or named theorems, one
theory. For a theorem or a derived rule, the complete list, untruncated (D26),
under this line:

> These are the theories that declare the constants appearing in this statement.

*(Cut to this one sentence by the user, 2026-08-25. The four sentences that
followed — the five-times-in-six figure, "Isasearch does not mark it either
way", and where to find the proving theory in the entity name — are deleted.)*

**Each theory is a link** to that theory's published source page (ruled
2026-08-25). The address is the theory's own name: `HOL.Finite_Set` links to
`/source/HOL.Finite_Set.html`. No mapping and no guessing is involved — the
published tree names its files exactly as Isabelle names the theories; verified
live against the distribution, the AFP and `Pure`.

Then, when a source position is recorded:

> **Source**
> This entity was produced by the command at HOL-Computational_Algebra.Primes.thy:525.

(The link text is the theory's full name with the line, as on the card — §4.4.)

and when none is recorded:

> **Source**
> No source position was recorded for this entity. Some commands do not report
> one.

Then:

> **Nearest entities**
> The ten entities closest to this one, compared with each other by the same
> measure that compares a query with an entity on the result cards.

*(The clause "There is no query here, so keyword matching is not used" is deleted
(ruled 2026-08-25). It dated from the hybrid ranking; with the BM25 leg gone
there is no keyword matching anywhere, so saying it is not used *here* implied
it was used elsewhere. What remains needs no replacement: the measure it points
at is the cosine similarity the cards now print.)*

The ten come from the record's own vector. Every published record carries one
(measured: turbopuffer refuses a vector-less row), so the absent form below is
kept only for a failed lookup:

> Nearest entities are not available for this entity.

An entity page that does not exist:

> No entity was found at this web address. The entity may have been removed when the
> index was rebuilt. *[link]* Search instead

## 9. The header and the footer, on every page

The header, left to right: the site name (a link home), the metadata line, the
search box (shown only on the result page), and the two links.

> Isasearch   «1 230 467» entities · Isabelle «2025-2» · AFP «2026-05-13»

*(Shortened by the user 2026-08-25 from "Isabelle release 2025-2 · AFP snapshot
2026-05-13". The line never wraps: it shrinks, then clips, and below 900 px it
is hidden altogether — the about page carries the same values in full. It used
to wrap into a narrow column and run over the page beneath it, which the user
caught on a narrow window.)*

The footer:

> Isasearch · built for Isabelle release 2025-2 · AFP snapshot 2026-05-13 · index built
> «2026-08-20»

*(The footer wraps rather than crushing: the build line will not shrink, and
without wrapping it squeezed the note beside it into a one-word column — caught
by the user 2026-08-25 on a narrow window.)*

The two links live in the page header instead, on every page (the user,
2026-08-25: the mockup had no footer links, so its header links were kept):

> about · source

`about` is the page of §14; `source` is the GitHub repository.

*(The build date is load-bearing: the absence of a result is this product's main
output, and no one can interpret it without knowing what was indexed. §15.2 of
the plan. "version" rather than "release" because `2025-2` sits between two ISO
dates and otherwise reads as February 2025.)*

## 10. Deliberately unwritten

- **The address of a search.** A search puts its query into the address,
  `/?q=…`, and opening such an address runs the search, so the address bar is
  the share link (ruled 2026-08-25; the embedding of a shared query is served
  from the Worker's 30-day cache, so a shared link costs one embedding, not one
  per visitor). Conditions and kinds are not in the address. The interface says
  nothing about it.

- **Whether the syntactic filters persist between visits.** They do not. Saying so on a page
  a visitor reads twenty times a day costs a line and helps no one.
- **What the copy control copies.** The expression as printed, in Unicode, without
  the name. The hover in §4.1 is the whole answer.
- **What a locale, a session or a proof method is.** The audience is Isabelle
  users. That is the author's reading of the product, not a sentence the user
  spoke: what he settled on 2026-08-14 was one labelling doubt, ruling that a
  reader who wonders whether `Introduction rule` is a subset of `Theorem` is not
  a customer. What this interface must explain is this index, not
  the prover.

## 11. The four labelling choices, settled 2026-08-14

- **`Collection` → `Named theorems`.** Measured: all 994 records of this kind are
  `named_theorems` declarations — `Approximation.approximation_preproc`,
  `DFS.invar_holds_intros`, `Finiteness.finite`. Not `lemmas` bundles, and not
  attributes such as `simp`.
- **`Method` → `Proof method`.** The landing page said "proof methods" and the
  button said "Method"; and "Method" alone reads as a programming-language method.
- **`Case split` — kept, hover measured.** Over all 10 504 records of the kind the
  final name segment is `cases` 3 659 times and `exhaust` 2 472, and exactly one
  contains `split`; separately, the 1 602 entities whose name ends in `.split` are
  classified `THEOREM`. The `.cases` records come from `inductive` definitions and
  the `.exhaust` records from datatypes, which is why §3.6's hover names both
  sources and no specific lemma. Draft 2's hover said "such as `list.cases`",
  which the Isabelle reader rejected: after the BNF transition `list.exhaust` is
  the datatype case rule.
- **`authoritative` — D30's second sentence amended.** Two consecutive rounds of
  reader testing named it the worst word on the site: its everyday sense is
  *sounds expert*, which reverses the sentence's purpose in the one place
  guarding against trusting machine-written prose about a formal statement.

## 12. What three rounds of reading changed

**Round 1 — four readers, four rejections.** Five statements were false: that
theorems have no declaring theory; that a condition matches "an adjacent run of
Isabelle tokens" (`sorted_wrt` is one token); that the filter "does not match
inside a name" with an example that refutes it; that conditions are matched
"literally"; and `sledgehammer` offered as a search tool. The empty state was
built on `?P ⟹ ?Q`, which matches 60 entities, and suggested `⟹`, which is in
about 45 % of them. The `excludes` toggle was unexplained; the boundary rule lived
only on an error page; eight states had no copy.

**Round 2 — three readers, three rejections.** The matching rule was stated four
times in three incompatible ways, and the version most visitors would read
promised prefix matching that does not exist — `sort` does not find `sorted_wrt`.
"Neither one works without the other" made the optional filters look mandatory.
"Your query never removes any" contradicted the 200-match limit. Draft 2 invented
a theory, `HOL-Analysis.Filter`, for the one example that teaches the rule; and it
told visitors to search for a theory in Entity Name without saying that entity
names carry no session prefix, so the name they would copy matches nothing. The
`excludes` empty state kept advice written for the opposite case, and the
end-of-list advice told visitors with 7 results to narrow their search.

**Round 3 — four readers, four rejections (draft 3).** The matching rule was still
stated five times, and three of the five dropped the adjacency clause — the same
defect that sank draft 2, moved rather than fixed. "A query cannot narrow the
results" was contradicted by the 200-result cap that the site itself describes; all
four readers found it independently. The three `✗` examples were the worst finding:
`_ + _`, `.*` and `cont*` are not rejected but **reduced** — `_` and `.` are
separators, so `_ + _` searches for `+` and returns thousands of unrelated entities
— so the copy taught the opposite of the real failure mode, and no screen covered
it. §4.6 is new and covers it. "The theory is the first part of the entity name" was
false under this file's own definition of *part*: the first part of
`Path_Connected.path_image_join` is `Path`. The `⟹` explanation refuted itself —
45 % is not "most statements", and removing 45 % is not "removes almost everything".
"Try a shorter part of it" was the one repair the matching rule forbids. §5.5
described a state the system cannot reach and is deleted. The non-native reader
found `left` used in four senses on one page, `and its kind` colliding with this
file's own defined term *kind*, and a garden path in the sentence that teaches the
central lesson of §5.1.

**One reader finding was rejected as wrong.** The Isabelle reader did not believe
`\<^named_theorems>` is a real Isabelle symbol. It is: `etc/symbols` line 466,
`\<^named_theorems>  argument: cartouche`. The sentence stands.

**Rejected across both rounds.** *Locale*, *session*, *jEdit*, `simp` and `intro`
left unexplained — out of scope under §10's audience statement, which is the
author's and not, as this line used to say, a decision of the user's. His 2026-08-14
ruling was about one labelling doubt; generalising it into a blanket audience policy
and then citing that policy back as his was the error. The omissions stand on §10. Term-structure search — D2, and the
interface says so. Dropping the required query so filters can search alone — D7;
the underlying need, a half-remembered name, is served by an Entity Name
condition, which §2 now says. Renaming the `contains` toggle, proposed on the
ground that the word promises substring matching — D22 fixes the control model,
and the rule is now stated where a visitor first meets it, which is the cheaper
of the two fixes.

**Left standing as design, not copy.** Two readers judged that a Theory Name
condition on a theorem will systematically mislead, since 99 % of theorem
statements mention something from `HOL`. That is D14, taken on measured evidence
that both alternatives are worse (§7.2 of the plan). The 200-match limit and the
per-network daily limit were both called out as leaving a user with no move; they
are D29 and D35.

## 13. Why the two name forms differ

§3.1's Entity Name hover tells visitors that an entity name is qualified by the
theory's base name and carries no session prefix — `Path_Connected.path_image_join`
— while the Theory Name panel takes the session-qualified form,
`HOL-Analysis.Path_Connected`. That is not an inconsistency to fix: an Isabelle
fact's long name is theory-qualified, and the theory field holds theory long
names, which are session-qualified. The interface states both, because a visitor
copying a theory off a card into Entity Name would otherwise match nothing.

D39 was first written with `HOL-Analysis.Path_Connected.path_image_join` as its
worked example, which is not a name that exists; it has been corrected in the
plan.

## 14. The about page — approved 2026-08-25

Heading: **About Isasearch**, then a table, then six sections. §1–§4 reuse
wording locked elsewhere in this file (named beside each); the sentences marked
*new* were approved by the user on 2026-08-25.

**The table, directly under the heading** (the user's proposal, 2026-08-25):

| Isabelle release | «2025-2» |
| AFP snapshot | «2026-05-13» |
| Entities | «1 230 467» |
| Index built | «2026-08-20» |
| Embedding model | «fireworks/qwen3-embedding-8b» |

All five are substitution slots; none is written by hand. The first four come
from the asset sentinel row and the namespace name, the model from the value the
Worker actually calls, so the page cannot name a model the site does not use.
The model is printed as that value reads, provider prefix included — a
hand-kept "display name" table would be one more thing that can drift, and the
prefix answers a question a reader has anyway, which is where a query goes.

The prose below repeats the release, the snapshot, the count, the build date and
the model, all of which the table also carries. **That repetition stands**
(ruled 2026-08-25): the table is for scanning, the prose for reading, and a
value that appears in both is read twice rather than hunted for once.

**What is indexed**

> Isasearch covers the Isabelle release 2025-2 and the Archive of Formal Proofs
> snapshot of 2026-05-13, and nothing outside them. It covers theorems, constants,
> types, classes, locales, proof methods and named theorems. In total it holds
> «1 230 467» entities. It was built on «2026-08-20».
>
> An entity has one of 11 kinds: Theorem, Named theorems, Constant, Type, Class,
> Locale, Proof method, Introduction rule, Elimination rule, Induction rule and
> Case split. **Named theorems** is a `named_theorems` declaration, such as
> `approximation_preproc`. **Case split** is a case rule: one case for each
> constructor of a datatype, or for each introduction rule of an inductive
> definition. A rule whose name ends in `.split`, such as `option.split`, has the
> kind Theorem here.

(§2's summary as rewritten 2026-08-25; the first sentence and the build date
are *new*; the kind sentences are §3.6's hovers. The sentence about the rules
Isabelle derives from `datatype`, `inductive` and `function` definitions left
this paragraph with §2's; the paragraph below names those four kinds anyway.)

**How a search works**

> A query is required. Isasearch compares it with an English explanation of every
> entity, using the embedding model «fireworks/qwen3-embedding-8b», and puts the
> results in that order. Only the best 200 appear.
>
> The syntactic filters are optional. They decide which entities are eligible to
> be ordered at all; they do not change the order.

(§4.5, and §2's deleted paragraph recast. *New* in this form, 2026-08-25: the
BM25 paragraph went with the checkbox, and what replaced it says plainly what
"semantically" in the landing page's first sentence means.)

**How a condition is matched**

The two paragraphs of §3.5 verbatim, then:

> A condition matches text, not patterns. It has no variables: `?n` searches for
> the name `n`. To search by the structure of a term, use Isabelle:
> `find_theorems` and `find_consts` search structurally inside a session.

(§5.1.)

**About the explanations**

> Every entity carries an English explanation. It is written by a language model
> from the formal statement, not by the theory's authors. It may be imprecise or
> wrong. Where the explanation and the statement disagree, the statement is the
> correct one. Isasearch searches this text as well, so an entity with a poor
> explanation may rank lower than it deserves.

(The first sentence *new*; the rest §4.2, D30.)

**Limits**

> Each network address may make 1 000 searches per UTC day, and 5 within any 10
> seconds. One search is one press of the search button: turning a page of
> results does not count, and editing a condition costs nothing until you search
> again.

(§7. The section was called "Limits and what is recorded" and carried a second
paragraph — "To count searches, Isasearch keeps a salted hash of your network
address for the current day and the day before, together with the country and
the network it belongs to. The address itself is not stored, and the query text
is not stored with it." — **deleted 2026-08-25 by the user**: the page does not
describe its own bookkeeping. What the site stores is unchanged by the deletion;
it is simply not written on the page.)

**Authors**

> Isasearch is made by [Qiyuan Xu](https://qiyuan.me), with
> [Claude Code](https://claude.com/claude-code). The source is on
> [GitHub](https://github.com/xqyww123/isasearch-web).

(*new*.)

The page ends with §9's footer line.
