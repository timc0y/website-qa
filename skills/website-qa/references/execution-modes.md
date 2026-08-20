# Ways to run Website QA

Choose one method and state what it could and could not check.

## Local runner — full sweep

Use `runner/qa_runner.mjs` whenever a local browser can reach the target. This is the
only mode that natively combines responsive layout, hover/click/open states, scrolling,
keyboard, links, non-submitting form checks, console/network capture, visual tiles,
run-to-run regression and optional multi-engine comparison. Its manifest declares
`execution.mode: local-runner` and records each enabled capability.

Done when: the runner finished, every skipped phase is named, reviewable
tiles were inspected, and every reported finding was verified through the appropriate
route (image, interaction, browser output or source code).

The local runner always records `capabilities.physicalDevice: false` and an empty
`configuration.devices` list. Playwright device emulation and WebKit do not count
as physical Safari/iOS evidence. Attach real-device evidence separately and name
the hardware, OS/browser, state, and observed result; do not edit the runner's
manifest to imply that it produced evidence it did not capture.

## Interactive browser — authenticated or already-open state

Use the host browser when the runner cannot reach authentication or the relevant state
already exists in an open session. Execute the page scripts, exercise interactions, and
save proof directly. Report the checks unavailable in this mode: generic scripts
alone do not supply the runner's link, load-shift, repeatable cross-browser or regression
passes.

Done when: the exact browser/session and observed viewport are recorded, every
claim has inspected proof, and missing runner checks appear as gaps.

## Forge — fewer remote checks

Use Forge only when its tools are installed and remote capture materially helps—for
example, a public deployed URL is reachable remotely but no suitable local browser is
available. Invoke the Forge `website-qa` prompt or call `forge_review` for representative
routes and phone/desktop viewports. Inspect every returned image and the accessibility
structure before using it.

Forge supplies screenshots and accessibility structure. A normal `forge_review` result
declares `capabilities.websiteQaRunner: false`; therefore it does not prove interaction,
scroll, link, form, console/network, regression or cross-browser coverage. Label the
review `forge-evidence`, list those absent capabilities, and report only conclusions the
remote proof supports. Do not relabel a Forge result as a Website QA local run.

When Parallax is also active, import the original Forge packet into Parallax. When a full
local runner later becomes available, run it normally and import its independent
`audit-manifest.json`; the two evidence sources remain distinguishable.

Done when: every used Forge image is inspected, missing checks and
failed/skipped capture cells are explicit, and the result never claims the standalone
runner ran.

## Keep the tools separate

- `website-qa` owns QA method and can run with no Parallax or Forge installation.
- Parallax may run the skill or read its summary file; the skill does not write
  Parallax-specific findings.
- Forge is an optional source of screenshots, not the QA judge or a required part
  of the runner.
- Saved results keep the name of the tool that made them, so their coverage stays clear.
