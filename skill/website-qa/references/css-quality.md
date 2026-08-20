# CSS quality — reading the rules, not the pixels

Every other audit in this skill reads **computed values on elements**. That is the
right lens for *"does this page look wrong"* and the wrong lens for *"is this CSS
any good"*. Two rules can compute identically on every element you sampled and
still be two rules that should have been one. `audit_css_quality.mjs` reads the
**CSSOM rules**.

```bash
node scripts/audit_css_quality.mjs --url https://site.com --out ./css-quality.json
```

| flag | effect |
|---|---|
| `--min-shared 4` | how many identical declarations make a merge candidate (default 4) |
| `--ignore-selectors u-,w-,is-` | mute naming conventions where sharing is the point |

## Everything here is advisory. Say so in the report.

A merge candidate is **not a defect**. Two selectors sharing six declarations may
be a missed abstraction, or two components that agree today and must diverge
tomorrow. The script reports evidence (*"these 7 selectors share these 6
declarations"*), never a verdict.

**Report these as SUSPECTED, in their own clearly-labelled code-quality section.**
A maintainer who finds *"merge these two classes"* filed next to *"the CTA
gradient is upside down"* stops trusting both. Severity for this whole class caps
at **Low** unless you can tie a specific rule to a specific rendering defect —
in which case it belongs in the defect section with that evidence, not here.

## What it finds, and how much to trust each

| finding | trust | why |
|---|---|---|
| `identicalRuleBlocks` | **high** | byte-identical declaration blocks under different selectors. Hard to argue with; the only question is whether they should diverge later. |
| `literalWhereTokenExists` | **high** | a literal that exactly equals a defined custom property. The token already exists, so this is a mechanical fix. |
| `nearDuplicateColour` / `nearDuplicateValue` | **high** | two values a hair apart (`#f2f5fa` vs `#f3f5fa`, `line-height: 1.14` vs `1.15`) are almost always one value typed twice. This check found a real cross-frame Figma discrepancy on a live site. |
| `sharedDeclarationBlock` | medium | a large shared subset across N selectors. Genuinely useful for spotting a missing base class, but "should this be abstracted" is a judgement. |
| `duplicatePropertyInBlock` | high | same property twice with different values in one block; one is dead. |
| `unusedCustomProperty` | **low** | see the caveat below. |
| `valueSprawl` | low | a count, not a defect. Useful as a headline ("34 distinct font sizes"), useless as a ticket. |
| `deepDescendantSelector` | low | depth ≥5 couples CSS to DOM shape. Sometimes unavoidable. |
| `importantHotspot` | medium | `!important` in bulk means a specificity fight; the *losing* selector is the real bug. |

## The traps, all of which produced wrong output while building this

1. **CSSOM expands every shorthand.** `border: 0` explodes into eight
   `border-image-*` longhands, and a reset applied to 20 selectors then looks
   like "20 selectors share 8 declarations!". The script drops `border-image-*`
   and vendor prefixes, and collapses 4-side families (`padding-*`, `margin-*`,
   `border-*-radius`, …) back to one logical declaration. **Without that, the top
   ten merge findings are all reset noise.**
2. **Empty CSSOM values.** Longhands can enumerate with `''`. They are not
   declarations; filter them or they become phantom shared properties.
3. **Matching a literal to a token by value alone produces confident nonsense.**
   `row-gap: 2rem` will match a *font-size* token that happens to be `2rem`, and
   "use `var(--type--title--l)` for your gap" is worse than silence. Suggestions
   must agree on **category**, inferred from the token's name (colour / space /
   size / lh / family / shadow). Bare small numbers (`1`, `1.2`) match everything
   and are skipped unless the property is `line-height`.
4. **Pairwise reporting explodes.** N selectors sharing one block produce
   N(N−1)/2 rows of the same fact — 4,183 on one real site. Cluster by the shared
   **block** and emit it once with every selector, ranked by duplication removed.
   Then drop clusters whose declarations are a subset of a larger reported cluster
   covering the same selectors, or you report one missed abstraction three times
   at decreasing detail.
5. **"Unused" custom property is a lead, not a fact.** It means *never referenced
   by `var()` in a readable stylesheet on this page*. It may be read from an
   inline style, from JS, from a cross-origin sheet, or from another page. Never
   tell someone to delete one on this evidence alone.
6. **Utilities are supposed to share declarations.** That is what makes them
   utilities. Mute the convention rather than reporting the whole utility layer.
7. **Cross-origin stylesheets throw on `.cssRules`.** The script counts them and
   states the count, because absence of a finding in an unreadable sheet is not
   evidence of absence. If that count is non-zero, say so next to your
   conclusions.

## Turning it into findings people act on

Rank by **duplication removed**, not by count. "20 selectors repeat these 4
declarations (76 duplicated lines)" is one ticket with an obvious fix. Prefer
naming the abstraction the codebase is missing:

> `.title-l`, `.title-m`, `.title-3xs`, `.title-xs`, `.title-2xs` … (15 selectors)
> all repeat `font-family: var(--ff-title); font-weight: regular; margin: 0`.
> There is no base `.title` class — add one and let the size classes carry only
> `font-size`/`line-height`.

That is actionable. "15 merge candidates found" is not.

One more framing that lands well: when the same visual value is expressed two
ways (`#f2f5fa` in one rule, `#f3f5fa` in another, `var(--surface)` in a third),
the finding is not "these differ" but **"there is no single source of truth for
this surface colour"** — which is also why the drift happened.
