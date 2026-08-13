# Review profiles

Profiles are review contracts, not hidden runner modes. Translate them into
explicit URLs and options, then report actual coverage.

| Profile | Selection | Engines and widths | States | Evidence threshold |
|---|---|---|---|---|
| `targeted` | named route/component/problem plus known consumers | engine(s) relevant to the claim; failing width plus one adjacent width | reported state and one control state | verify the claim and nearest regression risk |
| `standard` | every unique static layout; two real items per dynamic family; shared-component consumers | Chromium + WebKit; desktop, tablet, common phone, narrow phone | default, keyboard focus, opened controls, reduced motion where motion exists | inspect all High findings and one sample of every other kind |
| `deep` | standard plus journeys, error/empty/long content, authenticated or locale cases in scope | standard plus agreed in-between widths and installed Chrome where useful | hover, focus, open, validation, success/error simulation that causes no server mutation, reduced motion, relevant theme | verify every important finding and browser difference |
| `launch` | every contract-required route family, journey, form, redirect and shared-component consumer | every promised engine/device class and width | every promised visitor state and resilience condition | durable evidence for every required cell; any gap makes the result partial |

Physical Safari, iOS browser chrome, keyboard resizing, safe areas, Low Power
Mode, codec behavior and real assistive technology require physical-device or
specialist evidence. Playwright WebKit does not cover those claims.

Use a stable selection table before running:

```text
URL/family | content case | width | engine | state | interaction | required?
```

The denominator is the number of required cells. Mark each `ran`, `partial`, or
`not-run`; never calculate a pass rate after silently dropping cells.
