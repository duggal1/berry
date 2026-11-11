# DESIGN.md

This file is law for the Berry interface. If something is not in it, it is not allowed.
Changes go into this file first.

---

## 0. The sketch is the product

A pen traces one real request across your architecture. Each module it lands on fills in its own
role colour, so you watch the system run. Everything is one seeded rough.js stroke: square
corners, flat fills, no borders, no shadows. Colour comes from role and link kind. The surface
stays neutral.

## 1. Colour carries meaning

There is no single brand accent. Every colour is a signal:

| Token       | Hex       | Meaning                        |
| ----------- | --------- | ------------------------------ |
| entry       | `#ff5a1f` | the module a request enters by |
| core        | `#2a4bff` | the modules the request runs in |
| data        | `#00a870` | where state is stored          |
| integration | `#f5a300` | calls that leave the system    |
| utility     | `#8b5cf6` | background workers             |
| config      | `#6b7280` | configuration and wiring       |

| Link kind | Hex       | Meaning                    |
| --------- | --------- | -------------------------- |
| call      | `#0a0a0a` | a function call            |
| import    | `#8a8a8a` | an import                  |
| data      | `#00a870` | a read or a write          |
| event     | `#e11d74` | a message or a job         |

Ink `#0a0a0a` is the base stroke. The surface is `#ffffff`; the stage the sketch sits on is
`#f5f5f5`. No other colours. Never colour for decoration.

## 2. Type

Two families, no more:

- **Bricolage Grotesque** for everything that is read. Its width axis is the display voice:
  `wdth 75` for display, `80` for the title, `82` for headings, `88` for subheads.
- **JetBrains Mono** for anything that names a file, a path, a label or a count.

| Token   | Size / line | Weight | Tracking |
| ------- | ----------- | ------ | -------- |
| hero    | clamp(3rem, 10vw, 9rem) / 0.78       | 600 | -0.05em  |
| h1      | clamp(2.4rem, 6.5vw, 5.5rem) / 0.92   | 500 | -0.045em |
| h2      | clamp(2rem, 4.4vw, 3.6rem) / 0.96    | 700 | -0.04em  |
| h3      | 1.75rem / 1                            | 650 | -0.03em  |
| lead    | clamp(1.15rem, 1.7vw, 1.5rem) / 1.4   | 400 | -0.015em |
| body    | 1.0625rem / 1.6                        | 400 | -0.012em |
| mono    | 11px                                    | 500 | 0.02em   |

Nothing is approximately aligned. Numbers do not jitter. Layout does not shift when state changes.

## 3. Motion explains a change of state

- Motion shows where something came from and where it went. Values roll, surfaces fill, strokes draw.
- Springs, damping ratio >= 1, no bounce. `EASE_QUINT = cubic-bezier(0.22, 1, 0.36, 1)` for
  entrances, `EASE_STD` for exits.
- Draw duration `DRAW = 0.48s`, stagger `STAGGER = 0.07s`, pen travel `PEN_T = 0.9s`.
- Always honour reduced motion, and make sure the interface is still complete without it.
- No looping decoration, except the run indicator and the pen while a run is live.

## 4. The sketch system

- Square corners. One clean stroke per shape. Stable seeds so a drawing never jitters between
  renders. No multi-stroke, no decorative double lines.
- Shapes carry kind, colour carries role:
  - **service**: rectangle
  - **datastore**: cylinder with a hachure fill
  - **queue**: rectangle with three ticks on the right edge
  - **external**: dashed rectangle
  - **boundary**: dashed frame around a group of modules, with a label on its top edge
- Arrows are hand drawn: a single V at the end of the edge, same seed logic as the shapes.
- Edges draw with `pathLength` only after both of their end nodes have finished drawing.
- Every diagram has a text alternative: a visually hidden list of modules and edges.

## 5. Screen sequences

### Home

1. A giant headline. Its full stop is a square that cycles through the role colours.
2. The repository field, then the live sketch of the example directly below it.
3. What comes out, the recent analyses, then the questions.

### Workspace

1. The architecture sketch is the hero. Full width, centred, huge.
2. The trace bar sits directly under it: play one request, one hop at a time.
3. Summary, path, prompt, interview and ask are stacked tabs underneath the sketch. Every panel
   is vertically aligned in one column.
4. The module detail opens under the sketch, not in a modal.

### Running

While the model works, the loading screen draws itself as a sketch of the run: one box per
stage, linked in order, the active one filled in its role colour. The architecture draws below
it as soon as it exists.

## 6. Banned

- **Shadows.** No `shadow-*`, no `box-shadow`, no drop shadow on any surface, ever.
- **Borders.** No `border` on cards, panels, buttons, inputs or list rows. Separation is done with
  background steps and space.
- **Rounded corners.** Square. `rounded-full`, `rounded-[6px]` and friends are banned.
- **Serif, italic.** Two families only, and never a third.
- **Uppercase micro labels, gradient fills, glassmorphism, icon tiles, pill badges, floating
  action buttons, hero plus three feature cards, generic stat tiles.**
- **A button that hides its label.** Every control shows its label at rest.
- **A missing cursor.** Every interactive element has `cursor: pointer`.
- **A second accent.** If a colour is not in the tables above, it does not exist.
