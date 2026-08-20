# Website QA execution modes

Choose one mode explicitly and preserve its capability boundary in the report.

## Local runner — full sweep

Use `runner/qa_runner.mjs` whenever a local browser can reach the target. This is the
only mode that natively combines responsive layout, hover/click/open states, scrolling,
keyboard, links, non-submitting form checks, console/network capture, visual tiles,
run-to-run regression and optional multi-engine comparison. Its manifest declares
`execution.mode: local-runner` and records each enabled capability.

Completion criterion: the runner finished, every skipped phase is named, reviewable
tiles were inspected, and every reported finding was verified through the appropriate
channel (image, interaction, runtime or source).

## Interactive browser — authenticated or already-open state

Use the host browser when the runner cannot reach authentication or the relevant state
already exists in an open session. Execute the page scripts, exercise interactions, and
capture evidence directly. Report the phases unavailable in this mode: generic scripts
alone do not supply the runner's link, load-shift, repeatable cross-browser or regression
passes.

Completion criterion: the exact browser/session and observed viewport are recorded,
every claim has inspected evidence, and missing runner phases appear as coverage gaps.

## Forge evidence — remote reduced mode

Use Forge only when its tools are installed and remote capture materially helps—for
example, a public deployed URL is reachable remotely but no suitable local browser is
available. Invoke the Forge `website-qa` prompt or call `forge_review` for representative
routes and phone/desktop viewports. Inspect every returned image and the accessibility
structure before using it.

Forge supplies screenshots and accessibility structure. A normal `forge_review` packet
declares `capabilities.websiteQaRunner: false`; therefore it does not prove interaction,
scroll, link, form, console/network, regression or cross-browser coverage. Label the
review `forge-evidence`, list those absent capabilities, and report only conclusions the
remote evidence supports. Do not rewrite a Forge packet as a website-qa local-runner
manifest.

When Parallax is also active, import the original Forge packet into Parallax. When a full
local runner later becomes available, run it normally and import its independent
`audit-manifest.json`; the two evidence sources remain distinguishable.

Completion criterion: every used Forge image is inspected, reduced capabilities and
failed/skipped capture cells are explicit, and the result never claims the standalone
runner executed.

## Independence boundary

- `website-qa` owns QA method and can run with no Parallax or Forge installation.
- Parallax may invoke the skill or import its neutral manifest; the skill does not emit
  Parallax review objects.
- Forge is an optional evidence provider, not the QA judge and not a runtime dependency.
- Provider packets retain their provider identity so capabilities cannot blur together.
