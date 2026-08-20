Review a rendered website for defects with the `website-qa` skill. Read its `SKILL.md`
first, then work the contract in order: boundary, contract, selection, profile, execution,
evidence, outcome, replay.

Ask for the URL and the profile if the user has not given them. Prefer the local runner:

```sh
npm run qa -- --url=<url> --out=<approved-private-folder>
```

The width sweep is on by default and is what answers "does it break at any point" rather
than "is it broken at these widths". Add `--perturb` before a content handover or a
translation, and `--why-css` when the user wants fixes rather than findings.

Read `summary.md` top-down — regressions, then worst-first by content lost — and label every
finding MEASURED, OBSERVED or SUSPECTED. Inspect the screenshots for anything the run marked
geometric, unverifiable or unstable. Never report a defect the run only suspected as though
it were measured, and state what the run could not establish.
