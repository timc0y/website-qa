Compare a built page with specific Figma nodes using the `figma-parity` skill. Read its
`SKILL.md` first.

Needs a Figma read path (Framelink's Figma MCP, with its own access token) and exact node
IDs — a file link alone is not a selection. Bind every comparison to a live URL, a node, a
width, a state and a content case before measuring, and record the denominator before
sampling.

Report measurements and paired images, never a similarity score. A difference from the design
is not automatically a defect: where a build departs to stay editable, report it as a
difference with its likely reason. Use `website-qa` separately for general defects — this
skill never claims the site is otherwise sound.
