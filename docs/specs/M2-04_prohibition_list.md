# M2-04 — The prohibition list and the drafting desk

_Spec drafted 15 Nov 2026 from the MVP plan (§2 "AI drafting under a written prohibition list"; §6 M2-04 "never invent
provenance, never state a value, never guess at meaning — written before the first draft, not after"), the six
principles, and Concept & Principles (13 Nov: "M2-01's verified flag needs something to verify against"). Format:
Feature Spec Kit v1.1. Comes before M2-01, which is its first user. Branch `m2-04-drafting-desk`._

## JOB
Every word the system writes about an artist or a work is drafted under a written list of things it must never do,
rests on sources a person can check, and stays a draft until a named person approves it.

## THE EXPERIENCE
Michael opens one page in the repository, *the prohibition list*, and reads ten plain rules. He changes two words in
rule 6 and saves. That page is the law: the drafting desk will not run without it, and every draft it writes records
which version of the page it was written under.

On Workshop, one command asks for drafts for one artist, or five. For Dan Halter the desk has his own statement in
`context/artists/`; for the others it finds what it can on a short list of trustworthy sites. What comes back, for each
artist, is a short biography and one sentence on why they matter — and under every sentence, where it came from: the
artist's statement, a gallery's biography, a museum's page, with the passage it rests on. A sentence that rests on
nothing is not there. Where little is known, the draft is short and says so; it never fills the gap with a guess.

Before Michael sees anything, the desk checks its own work twice: once by rule (no currency, no price, no "investment",
no superlative it cannot attribute, every sentence cited) and once by a second reading against the list. What it
catches, it removes or flags. Michael reads five drafts in one report, with the sources beside them. Nothing reaches the
wall in M2-04: approving, and showing an approved text, is M2-01.

The desk sends the model only what a draft needs — the artist's name, dates and nationality, the titles, years and media
of their works here, and the source texts. Never a value, a price, a location, an owner, a note.

## THE LIST — as Michael approved it, 17 Nov 2026 (rule 6 his wording; the register line as M2-04b set it, 18 Nov)
1. **Never invent provenance.** No owner, sale, exhibition, publication or date that is not in the record or a cited source.
2. **Never state or imply a value.** No price, estimate, auction result, market, "investment", "blue-chip", "sought-after",
   "appreciating". Enjoyment is the front door; value lives behind it (principle 1).
3. **Never guess at meaning.** What a work is about is said only in a named person's words — the artist's, a curator's,
   a critic's — quoted or closely paraphrased, and attributed.
4. **Every fact has a source a person can check.** A named publication, the artist's own statement, a gallery or museum
   page. The model's memory is not a source. No source, no sentence.
5. **Never touch the sensitive classes.** Nothing about where a work is, who owns it, what it is insured for, its
   condition, or the collector's notes — the desk is never given them.
6. **No rank, no superlatives of our own.** Not "the most important", "seminal", "major", "leading" — unless a cited
   source says exactly it, and then in their own words, attributed.
7. **No invented voices.** Never write as the collector or the artist; a quotation is verbatim from a cited source or it
   is not a quotation.
8. **Private lives stay private.** Nothing about a living person's family, health, relationships or finances beyond what
   they have published themselves.
9. **A draft is a draft.** It is marked as such until a named person approves it; the approval is dated and kept.
10. **When unsure, write less.** A shorter true sentence beats a longer guessed one. "Not enough is known yet" is an answer.

Register: warm, exact and alive to the work — a good museum's audio guide, not a gallery's press release and not a CV.

## GOOD LOOKS LIKE
- The desk refuses to run if the list is missing; every draft carries the list's version and the model's name.
- In five drafts Michael reads: every sentence has a source he can open; no number that is money; no word on the rule-2
  or rule-6 lists unless quoted and attributed; nothing about location, ownership, condition or notes.
- Dan Halter's draft rests on his own statement and says nothing his statement does not support.
- An artist with almost nothing findable gets two true sentences and "not enough is known yet", not a paragraph.
- A deliberately tempting set (an artist with famous auction results; a work whose meaning is much debated) comes back
  clean, and the rule checker catches every planted fault in a set of hand-written bad drafts.
- Drafts are readable only by the collection's owner; a viewer, or anyone without both factors, reads none.

## OUT OF SCOPE
Any screen — reviewing, approving and showing texts is M2-01 (artists) and M2-02 (works). Drafts about works. Images sent
to the model. Translation. Automatic publishing of anything. Valuation in any form.

## TASTE ANCHORS
A Tate or MoMA wall label (60–80 words, plain, sourced in the catalogue behind it). The Phaidon monograph's biographical
note. The auction catalogue's "Literature" line, for how a source is cited.

## OPEN TRADE-OFFS — decided in the plan below
1. Where sources come from. 2. Where the desk runs. 3. What happens to a sentence without a source. 4. Who may approve.

## PLAN — proposed 15 Nov 2026, for Michael's 70%

**What gets built — one PR, two to three days.**
- `docs/drafting/prohibition-list.md` — the list above, as you leave it. The desk reads it at run time and records its
  version (the file's git hash) on every draft.
- A `drafts` table (migration): what it is about (artist or work, which field), the text, its sources (title, publisher,
  link, the passage relied on), the list's version, the model, status (draft / approved / rejected), who decided and
  when. Owner-only by row-level security; every write in the audit log, like every other table. M2-01 copies an approved
  text into the artist's `biography` / `why_they_matter` and sets `verified_at` / `verified_by`, the fields already waiting.
- The desk (`src/lib/drafting/`): assembles the minimal input (never a sensitive column), asks the model for sentences
  each tied to source ids, drops any sentence whose sources don't exist, runs the rule checker, then a second model
  reading against the list.
- The rule checker — plain code, fully tested in CI: money patterns, the rule-2 and rule-6 word lists (allowed only inside
  an attributed quotation), every sentence cited, length limits (one sentence ≤ 30 words for "why they matter"; ≤ 120
  words for a biography).
- `npm run draft -- --artist "Halter"` (or `--artists 5`) on Workshop, writing drafts to the table and a readable report
  for you. The live model runs only on Workshop; CI tests the checker and the desk with a stand-in model, no key.

**The four trade-offs.**
1. **Sources.** Proposed: **texts you supply first** (`context/artists/`, Dan's statement the first), **then the model's
   web search with citations, limited to an allowlist** — the artists' galleries (Stevenson, Goodman, Everard Read,
   SMAC, WHATIFTHEWORLD and the like), museums, SAHO, the major art press; you can add sites. **The model's memory is
   never a source** (rule 4). Supplying everything by hand would cost you hours for 45 artists; memory alone is where
   inventions come from.
2. **Where it runs.** Proposed: **a Workshop command**, like `ingest` and `masters`. The key lives only in
   `~/curator/.env`; nothing AI runs on the website yet. An "ask for a draft" button in the app can come later, once
   there is a reason.
3. **A sentence without a source.** Proposed: **dropped, not flagged.** The report lists what was dropped and why, so
   you can see the desk's restraint; the draft itself never carries an unsourced sentence.
4. **Who approves.** Proposed: **the owner only — you — for now.** The advisor role exists in the database; letting Jean
   approve is one line when she is invited.

**Choices the build will make (say if any is wrong).** The official Anthropic SDK as the one new dependency (rather than
hand-written calls); a current Claude model named in config, recorded on each draft; the cost for 45 artists is
small — a few dollars at most.

**Needs from you before the build can run (not before it can start).**
- **An Anthropic API key**, created by you at console.anthropic.com with a little credit, saved on Workshop in
  `~/curator/.env` as `ANTHROPIC_API_KEY`. Never pasted into a chat.
- **Dan Halter's statement** saved as `context/artists/Halter_Dan.md` in the project folder.
- **Your edits to the list**, or "as written".

**Approved — 17 Nov 2026, 13:27.** Michael: "I'm happy with the M2-04 Prohibition List. I made some changes to 6 as
required. Let's start." The list stands as above, with rule 6 in his wording. The four trade-offs stand as proposed:
supplied texts first, then allowlisted web search with citations, the model's memory never a source; a Workshop
command; a sentence without a source is dropped and listed in the report; the owner alone approves.

**What rule 6, as Michael wrote it, adds to the build.** A ranking word or superlative is allowed only inside quotation
marks, attributed to a named source, and the quoted words must appear exactly in the passage of that source the draft
records (curly or straight quotes and spacing aside). The rule checker tests this in plain code, not by asking the
model, and applies the same exact-match test to every quotation (rule 7). A paraphrase never carries a superlative.

**Where the sources live.** Supplied texts are read from the project folder's `context/artists/` on Workshop (the path
set as `CURATOR_CONTEXT_DIR` in `~/curator/.env`) and are never copied into the repository; CI uses hand-written
fixtures. The web-search allowlist is a short file Michael can edit, `docs/drafting/sources-allowlist.md`: the galleries
in the collection's provenance, the museums, SAHO and the art press, each domain checked to resolve.

**Dan Halter's text — in place, 17 Nov.** `context/artists/Halter_Dan.md`: his own words on his four works here, from his
email of 11 Nov, verbatim, with the original Word file beside it. It speaks about the works, not his life, so his
biography has to come from the allowlist (WHATIFTHEWORLD first). Still needed before the live run, not before the
build: the Anthropic key in `~/curator/.env`.

## BUILT — M2-04, 17 Nov 2026

**PR note — for Michael.**

**What changed.** Your list is now a page in the repository, `docs/drafting/prohibition-list.md`: THE LIST above,
word for word, rule 6 in your wording, with the register line. A test holds the page and this spec together — if
they ever differ, CI fails. The drafting desk reads that page every time it runs and refuses to run without it;
every draft records the page's version (the hash git gives the file's bytes, so a changed word is a new version —
at this commit `daaa969ce26f44f461d8b0bc1ab6ac183a65a39e`) and the model's name as the API returned it.

**The desk — `npm run draft` on Workshop.** For each artist named (`--artist "Halter" --artist "Kentridge"`, or
`--artists 5`), in this order:
1. *What you supplied first.* Every paragraph of `context/artists/<Surname>_<Given>.md` in the project folder
   becomes a numbered source — the author line as its publisher ("Dan Halter (the artist)"), the file's own heading
   as its title. Read from `CURATOR_CONTEXT_DIR`, never copied into the repository.
2. *Then the search, on the allowlist only.* The model's own web search, limited by the API to the sites in
   `docs/drafting/sources-allowlist.md` (41 today: the galleries in the register's provenance and their peers,
   museums, SAHO, the art press — no auction house, no marketplace; you edit the file). The desk keeps only what the
   API itself cited: the passage, the page, its title. The model's own words about what it found are never a source,
   and a citation from a site not on the list is thrown away before it can become one. Each domain is checked to
   resolve when the desk runs; two that did not today (Gallery MOMO, the Javett) were left off — add their right
   addresses when you have them.
3. *The draft.* The model is given the artist's name, dates and nationality, the titles, years and media of their
   works here, and the numbered sources — and nothing else: the command's two column lists are the whole of what it
   may select, and a test keeps every sensitive column off them. It is asked, under the list, for sentences each
   tied to source numbers, in a fixed shape.
4. *The desk's own checks, in plain code.* A sentence on no source, or on a source number that does not exist, is
   dropped. Then the rule checker (below). Then the lengths: one sentence of at most thirty words for why they
   matter, at most 120 for a biography; anything beyond leaves from the end. _Said plainly, as the review asked
   (18 Nov): plain code checks quotations word for word, the word lists, the sources and the lengths. A fact
   written in the desk's own words is tested against its passage only by the second reading, step 5. M2-04b moves
   the lengths after that reading and sets them at 250 words, and two sentences and sixty words._
5. *The second reading.* The model reads what survived, against the list, and gives a verdict on every sentence:
   keep, remove (naming the rule), or flag. Removed sentences leave; flagged ones stay, listed as doubted.
6. *What you read.* One report for the run — each artist's biography and the one sentence, with [n] after every
   sentence; the sources beneath, each with the passage it rests on; then everything the desk removed and why, so
   its restraint is visible. Every draft is marked as a draft. The same goes to the `drafts` table (owner-only)
   once its migration is applied.

**What rule 6, as you wrote it, built — the exact-match test on every quotation.** Words in quotation marks must
appear in the passage of a cited source letter for letter — curly or straight quotes, spacing, dashes and the
markdown of a supplied text aside; capitals included. A quotation that fails is "not a quotation" (rule 7) and the
sentence goes. A quotation must also name its source in the same sentence — rule 3's "quoted … and attributed":
the page's publisher ("as Stevenson puts it"), or the person or body the passage itself names (a critic quoted on
Tate's page), or "the artist" where the passage is the artist's own statement or carries the artist's name;
naming the subject of the draft is not naming a source. Only inside such a quotation may a ranking word, a value word or a
word about a living person's private life appear; in the desk's own words, never. A paraphrase never carries a
superlative. _Corrected 18 Nov, after the review: as built here, sums of money, the sensitive classes and the
private-life words were also let through inside an attributed quotation (blocker 1), and "the artist" or any
capitalised phrase in the passage counted as naming a source (blocker 2). M2-04b checks money, auction houses, sales
and the sensitive classes everywhere, quoted or not; allows private life only in the artist's own words, given to the
artist; and names a source only by a distinctive name, a speaker the passage shows, or the artist for their own
words._ The checker's word lists are in `src/lib/drafting/rules.ts`, in plain sight: the list's own words
(price, estimate, auction, market, investment, blue-chip, sought-after, appreciating; the most, seminal, major,
leading) and their kin; money in any currency (a currency word counts with an amount beside it — "two million
rand" — not alone: a dollar bill in a collage is a thing); the sensitive classes (insured, condition, hangs in, owned by,
private collection, the collector); the first person; and your own name, which the desk derives from the
collection's name and removes wherever it appears. "Not enough is known yet." is the one sentence that needs no
source.

**The four trade-offs, as approved.** Supplied texts first, then the allowlisted search with citations, the
model's memory never a source (the prompt says so, and the desk takes only what the API cited). A Workshop command;
the key lives in `~/curator/.env` and nothing AI runs on the website. A sentence without a source is dropped, not
flagged, and listed in the report. The owner alone reads drafts — by row-level security with both factors — and
nobody writes one from a browser; approving is M2-01.

**The drafts table — migration written, not applied.** `supabase/migrations/20261117120000_drafts.sql`: what the
draft is about (an artist now; a work later), the field, the text, its sentences with their source numbers, the
sources with their passages, what was removed and flagged, the list's version, the model, the status (draft,
approved, rejected) and who decided and when — the decision must be dated and signed. _Corrected 18 Nov: the check
as written here accepted a date without a signer, or a signer without a date (blocker 3); M2-04b fixes it in the same
migration, still unapplied, and tests each half._ Owner-only by row-level
security; every write in the audit log. It is applied only on your "Yes, apply it". Until then `npm run draft`
says the table is not there yet and the drafts live in the report.

**Choices made in the build** (say if any is wrong):
- The official Anthropic SDK (`@anthropic-ai/sdk` 1.9.0) is the one new dependency; no helper libraries. The model
  is `claude-opus-5-5` unless `CURATOR_DRAFT_MODEL` says otherwise, and the draft records the name the API answers
  with. No automatic fall-back to another model on a declined request: a draft must say which model wrote it, so a
  declined request is reported as "not drafted" instead.
- The search is the basic search tool (`web_search_20250305`), on purpose: the newer variant answers from a code
  sandbox and cites nothing (the first live run, below). The desk keeps the API's citations only (passage, page,
  title), from allowed sites only, each passage once; a long search that pauses is sent back to continue, up to
  four times.
- The model sees a supplied file's own heading as the source's title ("Dan Halter — in his own words"), not its
  Document line, which names you and the email.
- A quotation keeps the passage's capitals: "The blue is the blue…" cannot be quoted as "the blue is the blue…".
  The model is told so. Titles of works go in italics, never in quotation marks, so a title is never mistaken for a
  quotation.
- An artist with no source at all is not sent to the model: both fields read "Not enough is known yet." and the
  report says why.
- The report lands in `~/curator/drafts/Drafts_<date>.md` unless `--report <file>` says where; `--no-db` keeps the
  table untouched.

**Tests** — 59 in `tests/drafting/`, no key, no network: the page is this spec's section word for word and parses as
rules 1 to 10; the version is git's own hash of the file (two known answers, and git's answer for the real file);
the desk refuses without the list. The checker: every rule, the exact-match test with its normalisations, a set of
fourteen hand-written bad sentences each with one planted fault — money, a market word, an auction, a paraphrased
superlative, a quotation changed by one word, a quotation unattributed, no source, a source that does not exist, a
work's location, the first person, a living person's divorce, a record sum — every one caught under its rule (your
name is tested beside them, not among them: the review's correction), and seven
good sentences, a quoted superlative among them, clean; a whole good biography through whole; attribution by the
publisher, by a person the passage names, by "the artist" — and not by the subject's own name. The supplied-text
reader on a hand-written fixture (never Dan's text). The allowlist: its shape, the real file's contents, subdomains
and look-alikes, the resolve check. The desk against a stand-in model: supplied sources numbered before the web;
the search given the allowlist only; a sentence on no source dropped, one on source 9 dropped, one with "investment"
removed under rule 2, one naming the owner removed under rule 5, one the second reading removed, one it flagged and
kept; why-they-matter cut to one sentence; the version and the model on the draft; the minimal input stripped of
every sensitive column. The report. The adapter against a fake client: the tool definition names the allowlist's
domains, a paused turn is continued, citations from elsewhere dropped, the two JSON shapes and the prompts, a
declined request an error. And one database test beside the others in `tests/db/ingest.test.ts`: the owner reads a
draft; a viewer, an advisor, a stranger and a half-signed-in owner read none; nobody inserts or approves from a
browser; the write is in the audit log as the desk; the table's checks hold. That one runs in CI only — there is no
Postgres on Workshop. Lint, typecheck, test and build pass; the runner reports 183 tests passing and 12 skipped (the
database tests), 195 in all.

**The live run — 17 Nov, three attempts. The report is `Drafts_Report_2026-11-17.md` in the project folder, from
the third.**

*The first attempt found nothing.* With the key in `~/curator/.env` and `CURATOR_CONTEXT_DIR` set, all five came back
"the search found nothing on the allowed sites" — though thirty searches ran and the token counts showed results
arriving. Only Halter had text, one sentence from his statement. A probe showed why: the newer search tool
(`web_search_20260209`) runs its searches inside a code sandbox and writes its answer from printed results, so its
text carries no citations — and the desk takes nothing but the API's citations, by design. The fix was the basic
search tool (`web_search_20250305`), whose results the text cites directly, passage and page; a probe on Kentridge
then gave twelve cited passages from three searches, every one from an allowlisted host. The first attempt cost
about $1.80.

*The second attempt.*
- **Halter** — five sentences: born in Harare in 1977, lives and works in Cape Town (ArtThrob's CV); a BFA from
  Michaelis in 2001 (the Smithsonian); Zeitz MOCAA's words on his craft methods; his own words on *Footsack Empire*
  and *Indlala inamanyala*, from his statement. Why he matters, in ArtThrob's words. One sentence removed for
  length: the biography had passed 120 words. Nothing his statement does not support.
- **Kentridge** — six sentences from Marian Goodman, Zeitz MOCAA, the Guggenheim, Apollo, The Art Newspaper and
  ArtThrob; Tate's words on why he matters. Nothing removed. No price, no auction, no superlative of the desk's
  own: the famous-auction-results test came back clean.
- **Yiadom-Boakye** — five sentences, four from Tate; one removed under rule 3 and her why-they-matter removed under
  rule 3 — both wrongly, see below; one flagged by the second reading and kept (Jack Shainman's line on which
  collections hold her work: "touches on who owns works") — yours to judge.
- **Adams** — three sentences (C&, blank projects, ART AFRICA, ArtThrob) and Artforum's words on why he matters. Two
  sentences removed under rule 7: quotations the model attributed to The Art Newspaper and to blank projects that
  are not verbatim in any cited passage. The checker did its job.
- **Naude** — nothing on the allowed sites; "Not enough is known yet." twice; the model was asked to search (one
  request, six searches) and found nothing, so it was not asked to write. _Not the spec's "two true sentences and
  'not enough is known yet'" case, as the review pointed out: the register spells the name "Hohanna Naude", which
  may explain the empty search better than obscurity; the correction comes through the ingest (M2-04b)._
In all: 16 requests, 30 searches, 497,549 input and 38,459 output tokens — about $3.

*What the second attempt taught — three removals that were the checker's fault, not the model's, fixed in this PR
before the third.* (1) "the artist says" did not count as naming Halter in his own statement; now a source's
stated role ("Dan Halter (the artist)") names it. (2) "a US dollar bill" in a collage was caught as a currency;
now a currency word is money only with an amount beside it. (3) Hilton Als, named in the sentence and in Tate's
passage, did not count as attribution because he is not the page's publisher; now a person or body the cited
passage itself names counts — never the subject's own name — and "the artist" counts where the passage carries
the artist's name. Then, on your word, the five were run a third time under the refined rule.

*The third attempt is the report.*
- **Halter** — five sentences, nothing removed: born in Harare in 1977, lives and works in Cape Town (the Smithsonian,
  WHATIFTHEWORLD — his biography now cites his gallery, as the spec hoped); a BFA from Michaelis in 2001 (the
  Smithsonian); his own words on all four works, as "the artist writes", "in Halter's words", "as he describes
  them". Why he matters, in Zeitz MOCAA's words on his craft methods.
- **Kentridge** — six sentences, nothing removed: SAHO, Marian Goodman, Goodman Gallery, the Met, the Guggenheim,
  Tate, Apollo, ArtThrob. Why he matters, in Zeitz MOCAA's words — "celebrated internationally", a superlative
  allowed because quoted and attributed. The Met's passage goes on to his father, "the renowned trial lawyer"; the
  draft does not.
- **Yiadom-Boakye** — five sentences from Tate, Corvi-Mora's CV, Jack Shainman and the Serpentine; why she matters in
  Hyperallergic's words. Two removed: one by the second reading, which caught "as she has explained to Tate" where
  the passage says only "as she has explained" — a claim added, rule 4; one for length, the Turner Prize shortlist,
  past 120 words. _The sentence passed because it says "according to Tate"; no code counted "as she puts it" — the
review's correction of this line._
- **Adams** — five sentences, nothing removed: blank projects, C&, Artforum, ArtThrob, ART AFRICA, The Art Newspaper;
  his own words from Frieze, attributed; why he matters, in blank projects' words. ART AFRICA's passage speaks of a
  named person's illness; the draft does not.
- **Naude** — as before: nothing on the allowed sites, the list's own sentence twice; the model searched and was not
  asked to write.
In all: 17 requests, 30 searches, 508,701 input and 29,717 output tokens — about $3. The table was not written (the
migration awaits your yes); the drafts live in the report. For the day — three attempts and two probes — about $8.

**Not shown.** The spec's tempting case of "a work whose meaning is much debated" was not run; Kentridge stood for
the famous-auction-results case only. _Added 18 Nov, after the review._

**What to read in the report.** Every sentence ends in [n] and every [n] is a source you can open, with the passage
beneath it. No sum of money, no auction, no market, on any of the five. No "most important" or "seminal" but inside
quotation marks with the source named. Nothing about where a work is, who owns it, or you. Halter's draft rests on
his own words and the allowlist. Kentridge's says nothing of prices. Naude's is the list's own sentence. Then
"Removed by the desk" under each: that is the restraint, and this time none of it is the checker's fault.

**Not done here.** The migration (your yes). Drafts about works
(M2-02). The "ask for a draft" button. Jean's approval (one line when she is invited). Gallery MOMO and the Javett on
the allowlist.
