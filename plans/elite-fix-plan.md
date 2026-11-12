# Elite Fix Plan — Architecture Clarity

## Issues reported
1. Too many arrows/edges make the diagram confusing and unreadable.
2. Trace playback only animates 1–2 arrows instead of walking the whole architecture.
3. Hover tooltip uses a black background (acceptable) but should stay clear.
4. "ID page" canvas should match the landing canvas: colorful role/kind arrows + dotted inferred edges.
5. Large repos must not hard-fail; exploration must chunk context (done in prior pass).

## Root causes
- `server/graph.ts` `recoverEdges` can add up to 28 derived edges on top of AI edges, causing spaghetti.
- `server/verify.ts` does not cap total edges; caps modules at 12 (too many for a legible map).
- `flow` is capped at 8 steps and only connected hops animate; sparse model flow yields 1–2 animated arrows.
- Canvas/Diagram rendering is shared, so "ID vs landing" difference is mostly data density, not styling.

## Plan
1. Cap derived edges lower (6) and total edges (18) for legibility.
2. Cap modules at 9 (prompt already prefers 4–9).
3. Build a connected flow covering more edges: keep model flow, then greedily extend with unvisited edges so playback walks most of the graph.
4. Raise flow cap to 12.
5. Keep colorful KIND/ROLE palette and dotted inferred edges (already present); no visual regression.
6. Keep hover tooltip dark (already intended).

## Non-goals
- No frontend bloat (no sliders/extra controls).
- No new UI surfaces.