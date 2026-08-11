# The reviewer's mindset

## In this file

- Why false findings are costly
- Five questions that create useful checks
- Where automated QA fails
- How to control false positives
- How to add a new real-world failure

Why a site passes an automated sweep and still comes back from review covered in
comments — and how to close that gap on purpose rather than by adding rules one bug
at a time.

This document is the reasoning behind the checks. If you only read the scripts you
will learn *what* is checked; read this to know *why*, and to derive the next check
yourself when you meet a defect nothing here catches.

---

## The core asymmetry

**A machine looks for what is wrong. A person looks for what is unfinished.**

Those are different sets, and the second is bigger. A missing favicon is not wrong —
the page renders, nothing errors, every contrast ratio passes. It is *unfinished*, and
it is the first thing a human sees. Same for a phone number printed as plain text, six
cards wearing the same placeholder icon, a heading that wraps by one word, margins that
wander section to section, a debug widget still pinned to the corner.

None of that is detectable by asking "did anything break?". All of it is detectable by
asking better questions. The rest of this document is those questions.

---

## Five questions that generate checks

### 1. "Does the page agree with itself?"

Most design intent is unavailable to you — you don't have the Figma, and even when you
do, the file often can't answer the question. But you don't need the intended value if
you have several instances of it. **Self-consistency needs no reference.**

If eleven sections start their content at 54px and one starts at 102px, you don't need
to know whether 54 was the intended gutter to know that 102 is wrong. If every heading
on the page scales down at mobile and one doesn't, that one is a bug. Take the majority
as the intent and report the outliers.

This is the single highest-yield idea here, because it converts "I'd need the design" —
the reason most spacing and type findings get skipped — into arithmetic. It generalises
to gutters, type scale, spacing rhythm, border radii, colour palette, button heights.

Corollary: report the *distribution*, not just the outlier. "Dominant gutter 54px; also
47px, 102px, 133px" tells a developer what to fix. "Gutter outlier detected" doesn't.

### 2. "Would a person try to do this, and does it work?"

Affordance bugs. A phone number printed as text is a button as far as a phone user is
concerned; when it isn't wired up, nothing looks broken, the tap just does nothing.
A `cursor: pointer` on a non-interactive card is a promise the page can't keep. A real
link with no pointer cursor is a feature nobody discovers.

The general form: wherever the page *presents* something as actionable — by shape, by
convention, by cursor — check it actually is, and vice versa. Both directions are bugs
and both are trivially measurable.

### 3. "What does this look like in a state I'm not currently in?"

The largest structural blind spot. A resting-state DOM dump can only find resting-state
bugs, so every note that begins "on hover…", "when you click…", or "as you scroll…" is
invisible to it — and that's a huge share of what people actually file.

Driving a real browser fixes this, and the reason it works is worth understanding:
synthetic events don't trigger many JavaScript interaction layers, but
Playwright's input is *trusted* input, so the site behaves exactly as it does for a
person. Once you can hover, click and scroll for real, a whole category becomes
auditable: dropdowns that stay open, panels painted behind the footer, reveal
animations that never fire, toggles that do nothing, placeholder copy in a panel nobody
opened during review.

Enumerate the states deliberately: hover, focus, open, active, scrolled, empty, error,
loading, long-content, and every breakpoint × each of those.

### 4. "In a set that should vary, does it?"

A presence check asks "is there an icon?" and a build full of placeholder icons answers
yes, every time. The useful question is about *variety*: in a group of things that
should each be distinct, are they?

Repetition where variety is expected is the signature of content nobody finished. It
generalises well past icons — identical alt text, identical thumbnails, the same card
copy twice in a generated list, the same meta description on every dynamic page.

The critical refinement, learned the hard way: **controls are supposed to be
identical.** A chevron on every accordion row is correct. Without an exception for
controls this check flags every FAQ list on earth, and a noisy check is worse than no
check because people stop reading the output.

### 5. "What does the page declare about itself?"

Completeness is the hardest property to review, because you must know what *should* be
there. But sites usually state it: **the navigation is a declaration of what exists.**
When an on-page listing carries only some of what the nav declares, the build is
incomplete.

The subtlety is that partial coverage is the signal — zero overlap just means this page
isn't that listing, which is fine. Look for the same shape anywhere two places should
mirror each other: nav vs listing, filters vs results, sitemap vs pages, tabs vs panels.

---

## Where automated QA systematically fails

Patterns behind the misses, worth checking yourself against:

- **Anything outside the viewport.** Tab title, favicon, share preview, print styles.
  No layout or a11y rule looks there; every reviewer does, immediately.
- **Anything requiring time.** Auto-rotating carousels, animation duration, layout
  shift during load, a lazy image that never resolves. A single-moment snapshot cannot
  see behaviour, only state. You have to watch, and watching costs seconds you must
  choose to spend.
- **Anything the team has stopped seeing.** Debug chips, grid overlays, feedback
  badges, a script still loading from localhost. Invisible to the people who put them
  there, fully visible to everyone else. Doubly worth catching because they also sit
  *over* content and cause false "this element is missing" findings in your own
  screenshots.
- **Anything only true in another engine.** Most client QA arrives from Safari on a
  phone, and a real share of it is Safari-only: SVG intrinsic sizing, flex/grid
  rounding, sticky, `100vh`. Auditing in one engine structurally cannot see it. Run the
  same audit in two and let the *diff* be the finding.
- **Anything only true at a width nobody screenshots.** 393px is where reviewers
  actually look; 479 is where the CSS breakpoint is. Sweep real device widths, and run
  the width-dependent checks at *every* one — running them once at desktop is how an
  earlier version of this skill found zero mobile wrapping issues on a site whose QA
  list was full of them.

---

## Discipline: the false-positive budget

Every check has a noise budget, and it is small. A reviewer who finds three fabricated
findings stops trusting the whole report — including the eleven real ones. Noise doesn't
just waste time, it destroys the value of the signal next to it.

Rules that have earned their place:

- **Never assert "missing" from a DOM probe alone.** Resolving a card via `closest()`
  from a text node grabs the wrong ancestor and reports zero icons on cards that
  plainly have them. This exact mistake produced two false findings on a real review.
  Confirm absence on a clean screenshot, with overlays hidden, before reporting it.
  Absence is far easier to get wrong than measurement — hold it to a higher bar.
- **Distinguish "different" from "wrong".** A wrapped footer link column is a column.
  An already-open accordion that closes when clicked is working. A toggle that shrinks
  content is a toggle. Each of those was a false positive here until the check learned
  the difference; the fix is always to model the *intent* of the pattern, not its shape.
- **Prefer a measurement over a judgement.** Report "renders at 62px at both 1512 and
  393" rather than "text too big". The first is checkable and actionable; the second is
  an opinion someone can wave away.
- **Separate content from defects.** Lorem, wording, and editorial copy are a different
  conversation from broken layout. Mixing them makes the defect list look padded.
- **Say what you capped.** If the link check stopped at 120 links or only two toggles
  per component were tested, print it. Silent truncation reads as "all clear".

---

## When you meet a defect nothing here catches

The loop that produced every check in this skill:

1. Take a real QA list written by a person — not a spec, an actual list of complaints.
2. For each item ask: *what would have had to be measured for a script to catch this?*
3. If the answer is a number the browser already knows, write the check.
4. If it isn't, ask what the item is a *symptom* of. "Reduce the text size here" is
   almost never about that one heading; it's a missing responsive type scale, and that
   whole class is one cross-breakpoint comparison.
5. Generalise before you implement. A check for one site's markup is worth almost
   nothing; a check for the shape ("a repeated group", "a toggle", "a full-width
   section") transfers everywhere. Keep the vocabulary in `runner/lib/vocab.mjs` so
   adapting to a different codebase means editing one map, never a check.
6. Then run it against sites you *haven't* mined and count the false positives. A check
   that fires on three real sites and is right every time is finished. One that fires
   eleven times and is right twice is worse than nothing.

The compounding move is step 4. Individual bug reports are cheap; the class behind them
is what's worth automating.
